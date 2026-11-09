import { test as base, expect } from '@playwright/test'
import { spawn, spawnSync } from 'node:child_process'
import { createWriteStream, mkdirSync } from 'node:fs'
import { createServer } from 'node:net'
import { join, resolve } from 'node:path'
import type { ChildProcess } from 'node:child_process'

const productionMode = process.env.PLAYWRIGHT_PRODUCTION === '1'
const explicitPortBase = process.env.SUBX_E2E_PORT_BASE ?? process.env.E2E_PORT_BASE
const serverStartTimeout = Number(process.env.SUBX_E2E_SERVER_TIMEOUT || 180_000)

type WorkerFixtures = {
  e2eArtifactsDir: string
  e2eDbPath: string
  e2eMediaDir: string
  e2eServerURL: string
}

function getFreePort() {
  return new Promise<number>((resolvePort, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => resolvePort(port))
    })
  })
}

async function waitForHealth(url: string, isAlive: () => boolean) {
  const deadline = Date.now() + serverStartTimeout
  let lastError: unknown = null
  while (Date.now() < deadline) {
    if (!isAlive()) throw new Error(`E2E server exited before becoming healthy: ${url}`)
    try {
      const response = await fetch(`${url}/api/health`)
      if (response.ok) {
        const payload = await response.json().catch(() => null)
        if (payload?.ok) return
      }
    } catch (error) {
      lastError = error
    }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 500))
  }
  throw new Error(`E2E server did not become healthy at ${url}: ${String(lastError)}`)
}

async function stopServer(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return
  const pid = child.pid
  if (!pid) return
  const kill = (signal: NodeJS.Signals) => {
    try {
      if (process.platform === 'win32') child.kill(signal)
      else process.kill(-pid, signal)
    } catch { /* already gone */ }
  }
  const exited = new Promise<void>(resolveExit => child.once('exit', () => resolveExit()))
  kill('SIGTERM')
  const timedOut = await Promise.race([
    exited.then(() => false),
    new Promise<boolean>(resolveTimeout => setTimeout(() => resolveTimeout(true), 10_000))
  ])
  if (timedOut) {
    kill('SIGKILL')
    await Promise.race([exited, new Promise(resolveTimeout => setTimeout(resolveTimeout, 5_000))])
  }
}

export const test = base.extend<{ baseURL: string }, WorkerFixtures>({
  // eslint-disable-next-line no-empty-pattern -- Playwright requires an object destructuring pattern.
  e2eArtifactsDir: [async ({}, use, workerInfo) => {
    const explicitRoot = process.env.SUBX_E2E_ARTIFACTS_DIR || process.env.E2E_ARTIFACTS_DIR
    const dir = explicitRoot
      ? resolve(explicitRoot, `worker-${workerInfo.workerIndex}`)
      : resolve(process.cwd(), '.test-artifacts', `worker-${workerInfo.workerIndex}`)
    mkdirSync(dir, { recursive: true })
    await use(dir)
  }, { scope: 'worker' }],

  e2eDbPath: [async ({ e2eArtifactsDir }, use) => {
    await use(join(e2eArtifactsDir, 'subx.db'))
  }, { scope: 'worker' }],

  e2eMediaDir: [async ({ e2eArtifactsDir }, use) => {
    await use(join(e2eArtifactsDir, 'media'))
  }, { scope: 'worker' }],

  e2eServerURL: [async ({ e2eArtifactsDir, e2eDbPath, e2eMediaDir }, use, workerInfo) => {
    const port = explicitPortBase
      ? Number(explicitPortBase) + workerInfo.workerIndex
      : await getFreePort()
    const url = `http://127.0.0.1:${port}`
    const env = {
      ...process.env,
      DB_PATH: e2eDbPath,
      VIDEO_DIR: e2eMediaDir,
      SUBX_E2E_ARTIFACTS_DIR: e2eArtifactsDir,
      SUBX_E2E_WORKER_INDEX: String(workerInfo.workerIndex),
      SUBX_SECRET_KEY: 'playwright-test-secret',
      NODE_ENV: productionMode ? 'production' : 'development',
      NUXT_DEVTOOLS: 'false',
      PORT: String(port),
      HOST: '127.0.0.1',
      NITRO_PORT: String(port),
      NITRO_HOST: '127.0.0.1'
    }

    const prepare = spawnSync(process.execPath, ['tests/e2e/prepare-env.mjs'], {
      cwd: process.cwd(),
      env,
      stdio: 'inherit'
    })
    if (prepare.status !== 0) {
      throw new Error(`prepare-env.mjs failed with exit code ${prepare.status}`)
    }

    const command = productionMode
      ? process.execPath
      : resolve(process.cwd(), 'node_modules', '.bin', 'nuxt')
    const args = productionMode
      ? ['.output/server/index.mjs']
      : ['dev', '--port', String(port), '--host', '127.0.0.1']

    const child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let alive = true
    child.once('exit', () => { alive = false })

    const log = createWriteStream(join(e2eArtifactsDir, 'server.log'), { flags: 'a' })
    child.stdout?.pipe(log)
    child.stderr?.pipe(log)

    try {
      await waitForHealth(url, () => alive)
      process.env.PLAYWRIGHT_TEST_BASE_URL = url
      process.env.DB_PATH = e2eDbPath
      process.env.VIDEO_DIR = e2eMediaDir
      process.env.SUBX_E2E_ARTIFACTS_DIR = e2eArtifactsDir
      process.env.SUBX_E2E_WORKER_INDEX = String(workerInfo.workerIndex)
      await use(url)
    } finally {
      await stopServer(child)
      log.end()
    }
  }, { scope: 'worker' }],

  baseURL: async ({ e2eServerURL }, use) => {
    await use(e2eServerURL)
  }
})

export { expect }
