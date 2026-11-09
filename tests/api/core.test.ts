import { createHash } from 'crypto'
import Database from 'better-sqlite3'
import { createServer } from 'http'
import type { AddressInfo } from 'net'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setup, url } from '@nuxt/test-utils/e2e'

const rootDir = fileURLToPath(new URL('../..', import.meta.url))
const tempDir = mkdtempSync(join(tmpdir(), 'subx-api-'))
const dbPath = join(tempDir, 'subx.db')
mkdirSync(join(tempDir, 'media'), { recursive: true })
writeFileSync(join(tempDir, 'media', 'Demo.zh.srt'), '1\n00:00:01,000 --> 00:00:02,000\nHello\n\n2\n00:00:02,000 --> 00:00:03,000\nWorld\n', 'utf-8')
const slowEntries = Array.from({ length: 20 }, (_, index) => `${index + 1}\n00:00:${String(index).padStart(2, '0')},000 --> 00:00:${String(index + 1).padStart(2, '0')},000\nLine ${index + 1}\n`).join('\n')
writeFileSync(join(tempDir, 'media', 'Slow.zh.srt'), slowEntries, 'utf-8')

await setup({
  rootDir,
  server: true,
  build: true,
  port: 3200,
  env: {
    DB_PATH: dbPath,
    VIDEO_DIR: join(tempDir, 'media'),
    SUBX_SECRET_KEY: 'api-test-secret',
    NUXT_PUBLIC_TIME_ZONE: 'Asia/Shanghai',
    NO_PROXY: '127.0.0.1,localhost',
    no_proxy: '127.0.0.1,localhost'
  }
})

const slowSockets = new Set<any>()
const slowServer = createServer((req) => { req.on('close', () => slowSockets.delete(req.socket)); slowSockets.add(req.socket) })
await new Promise<void>((resolve) => slowServer.listen(0, '127.0.0.1', resolve))
const slowPort = (slowServer.address() as AddressInfo).port
const slowBaseUrl = `http://127.0.0.1:${slowPort}`
const webhookServer = createServer((req, res) => {
  req.resume()
  req.on('end', () => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok') })
})
await new Promise<void>((resolve) => webhookServer.listen(0, '127.0.0.1', resolve))
const webhookPort = (webhookServer.address() as AddressInfo).port
const webhookBaseUrl = `http://127.0.0.1:${webhookPort}`
const passkey = createHash('sha256').update('api-test-passkey').digest('hex')
let cookie = ''
let readToken = ''
let completedTaskId = ''

function apiUrl(path: string) {
  const value = url(path)
  return /^https?:\/\//.test(value) ? value : `http://${value}`
}

async function apiFetch(path: string, init: RequestInit = {}) {
  return fetch(apiUrl(path), init)
}

beforeAll(async () => {
  const response = await fetch(apiUrl('/api/auth/setup'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ passkey })
  })
  expect(response.ok).toBe(true)
  cookie = String(response.headers.get('set-cookie') || '').split(';')[0]
  expect(cookie).toContain('subx_session=')
})

afterAll(async () => {
  for (const socket of slowSockets) socket.destroy()
  await new Promise<void>((resolve) => slowServer.close(() => resolve()))
  await new Promise<void>((resolve) => webhookServer.close(() => resolve()))
  rmSync(tempDir, { recursive: true, force: true })
})

describe('core API integration', () => {
  it('serves public health and OpenAPI without authentication', async () => {
    const health = await apiFetch('/api/health')
    expect(health.status).toBe(200)
    expect(await health.json()).toMatchObject({ ok: true })

    const openapi = await apiFetch('/api/openapi.json')
    expect(openapi.status).toBe(200)
    expect(await openapi.json()).toMatchObject({ openapi: '3.1.0' })
  })

  it('requires a session for protected config endpoints', async () => {
    const unauthorized = await apiFetch('/api/config')
    expect(unauthorized.status).toBe(401)

    const authorized = await apiFetch('/api/config', { headers: { cookie } })
    expect(authorized.status).toBe(200)
    expect(await authorized.json()).toHaveProperty('targetLanguage')
  })

  it('rejects unsafe task language before creating a task', async () => {
    const response = await apiFetch('/api/task', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ filePath: 'demo.mkv', targetLanguage: '../../tmp/pwn' })
    })
    expect(response.status).toBe(400)
  })

  it('creates an original-subtitle task, exports and downloads it', async () => {
    const created = await apiFetch('/api/task', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        filePath: 'Demo.zh.srt',
        sourceType: 'external',
        targetLanguage: 'zh-CN',
        outputMode: 'original',
        subtitleFormat: 'srt'
      })
    })
    expect(created.status).toBe(200)
    const createdBody = await created.json() as any
    completedTaskId = createdBody.taskId
    expect(completedTaskId).toBeTruthy()

    let task: any = null
    for (let attempt = 0; attempt < 40; attempt++) {
      const response = await apiFetch(`/api/tasks/${completedTaskId}`, { headers: { cookie } })
      expect(response.status).toBe(200)
      task = (await response.json() as any).task
      if (['done', 'error', 'cancelled', 'review'].includes(task.status)) break
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    expect(task?.status).toBe('done')

    const download = await apiFetch(`/api/tasks/${completedTaskId}/download?format=srt`, { headers: { cookie } })
    expect(download.status).toBe(200)
    const content = await download.text()
    expect(content).toContain('Hello')
    expect(content).toContain('World')
  })

  it('downloads OCR original subtitles from transcription runs', async () => {
    const db = new Database(dbPath)
    db.pragma('busy_timeout = 5000')
    db.prepare(`
      INSERT INTO tasks (task_id, file_path, root_id, source_type, track_index, model, target_lang, output_mode, status)
      VALUES (?, ?, ?, 'ocr', 0, 'test-model', 'zh-CN', 'original', 'done')
    `).run('ocr-download-task', 'Demo.zh.srt', 'default')
    const run = db.prepare("INSERT INTO transcription_runs (task_id, engine, model, language) VALUES (?, 'rapidocr', 'test', 'zh')").run('ocr-download-task')
    db.prepare('INSERT INTO asr_segments (run_id, start_ms, end_ms, text) VALUES (?, ?, ?, ?)').run(Number(run.lastInsertRowid), 0, 1000, 'OCR line one')
    db.prepare('INSERT INTO asr_segments (run_id, start_ms, end_ms, text) VALUES (?, ?, ?, ?)').run(Number(run.lastInsertRowid), 1000, 2000, 'OCR line two')
    db.close()

    const download = await apiFetch('/api/tasks/ocr-download-task/download-original', { headers: { cookie } })
    expect(download.status).toBe(200)
    const content = await download.text()
    expect(content).toContain('OCR line one')
    expect(content).toContain('OCR line two')
  })

  it('loads and updates review entries for a completed task', async () => {
    expect(completedTaskId).toBeTruthy()
    const review = await apiFetch(`/api/tasks/${completedTaskId}/review`, { headers: { cookie } })
    expect(review.status).toBe(200)
    const reviewBody = await review.json() as any
    expect(reviewBody.entries.length).toBeGreaterThan(0)
    const entry = reviewBody.entries[0]

    const patched = await apiFetch(`/api/tasks/${completedTaskId}/review`, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        entries: [{ subtitleId: entry.subtitleId, translatedText: '你好', finalText: '你好', reviewStatus: 'edited', edited: true }],
        bilingualLayout: 'translated_first'
      })
    })
    expect(patched.status).toBe(200)

    const exported = await apiFetch(`/api/tasks/${completedTaskId}/review-export`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ subtitleFormat: 'srt', outputMode: 'original', bilingualLayout: 'translated_first' })
    })
    expect(exported.status).toBe(200)
    expect(await exported.json()).toMatchObject({ success: true })
  })

  it('lists media files and blocks path traversal', async () => {
    const listing = await apiFetch('/api/files?rootId=default&path=.', { headers: { cookie } })
    expect(listing.status).toBe(200)
    const files = await listing.json() as any[]
    expect(files.some((item: any) => String(item.name).includes('Demo.zh.srt'))).toBe(true)

    const traversal = await apiFetch('/api/files?rootId=default&path=../../etc', { headers: { cookie } })
    expect([400, 403, 404]).toContain(traversal.status)
  })

  it('retries a completed task and rejects cancelling a terminal task', async () => {
    const retried = await apiFetch('/api/task', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ retryTaskId: completedTaskId })
    })
    expect(retried.status).toBe(200)
    const retriedTaskId = (await retried.json() as any).taskId
    expect(retriedTaskId).not.toBe(completedTaskId)

    let status = ''
    for (let attempt = 0; attempt < 40; attempt++) {
      const response = await apiFetch(`/api/tasks/${retriedTaskId}`, { headers: { cookie } })
      status = (await response.json() as any).task.status
      if (['done', 'error', 'cancelled', 'review'].includes(status)) break
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    expect(status).toBe('done')

    const cancelDone = await apiFetch(`/api/tasks/${retriedTaskId}/cancel`, { method: 'POST', headers: { cookie } })
    expect(cancelDone.status).toBe(200)
    expect(await cancelDone.json()).toMatchObject({ success: false })
  })

  it('reuses an active task and cancels it', async () => {
    const configUpdate = await apiFetch('/api/config', {
      method: 'PUT',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        apiKey: 'test-key',
        apiBaseUrl: slowBaseUrl,
        defaultModel: 'test-model',
        maxRetries: 0,
        concurrency: 1,
        translationMode: 'non_stream',
        integrationWebhookToken: 'hook-token-123456'
      })
    })
    expect(configUpdate.status).toBe(200)

    const payload = JSON.stringify({
      filePath: 'Slow.zh.srt',
      sourceType: 'external',
      targetLanguage: 'zh-CN',
      outputMode: 'translated',
      subtitleFormat: 'srt'
    })
    const created = await apiFetch('/api/task', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: payload
    })
    expect(created.status).toBe(200)
    const taskId = (await created.json() as any).taskId

    for (let attempt = 0; attempt < 40; attempt++) {
      const response = await apiFetch(`/api/tasks/${taskId}`, { headers: { cookie } })
      const status = (await response.json() as any).task.status
      if (['probing', 'extracting', 'parsing', 'translating'].includes(status)) break
      if (['done', 'error', 'cancelled', 'review'].includes(status)) throw new Error(`task ended before cancel test: ${status}`)
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    const duplicate = await apiFetch('/api/task', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: payload
    })
    expect(duplicate.status).toBe(200)
    const duplicateBody = await duplicate.json() as any
    expect(duplicateBody.taskId).toBe(taskId)
    expect(duplicateBody.reusedActive).toBe(1)

    const webhookBody = JSON.stringify({ eventType: 'Download', episodeFile: { relativePath: 'Demo.zh.srt' } })
    const webhookFirst = await apiFetch('/api/integrations/sonarr?token=hook-token-123456', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: webhookBody
    })
    expect(webhookFirst.status).toBe(200)
    const webhookFirstBody = await webhookFirst.json() as any
    expect(webhookFirstBody).toMatchObject({ ok: true })
    expect(webhookFirstBody.deduped).not.toBe(true)
    expect(webhookFirstBody.taskId).toBeTruthy()

    const webhookSecond = await apiFetch('/api/integrations/sonarr?token=hook-token-123456', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: webhookBody
    })
    expect(webhookSecond.status).toBe(200)
    expect(await webhookSecond.json()).toMatchObject({ ok: true, deduped: true, taskId: webhookFirstBody.taskId })

    await apiFetch(`/api/tasks/${webhookFirstBody.taskId}/cancel`, { method: 'POST', headers: { cookie } })

    const sseController = new AbortController()
    const sseResponse = await apiFetch(`/api/sse/progress?taskId=${taskId}`, {
      headers: { cookie },
      signal: sseController.signal
    })
    expect(sseResponse.status).toBe(200)
    const reader = sseResponse.body!.getReader()
    const sseTextPromise = (async () => {
      let text = ''
      const decoder = new TextDecoder()
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        text += decoder.decode(value, { stream: true })
        if (text.includes('event: cancelled')) break
      }
      return text
    })()

    const cancelled = await apiFetch(`/api/tasks/${taskId}/cancel`, { method: 'POST', headers: { cookie } })
    expect(cancelled.status).toBe(200)
    expect(await cancelled.json()).toMatchObject({ success: true, status: 'cancelled' })

    const sseText = await Promise.race([
      sseTextPromise,
      new Promise<string>((resolve) => setTimeout(() => resolve('timeout'), 5000))
    ])
    expect(sseText).toContain('event: cancelled')
    sseController.abort()

    let finalStatus = ''
    for (let attempt = 0; attempt < 40; attempt++) {
      const response = await apiFetch(`/api/tasks/${taskId}`, { headers: { cookie } })
      finalStatus = (await response.json() as any).task.status
      if (finalStatus === 'cancelled') break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    expect(finalStatus).toBe('cancelled')
  })

  it('manages watch folders and storage endpoints', async () => {
    const folderCreated = await apiFetch('/api/files/create-folder', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ rootId: 'default', name: 'WatchApi' })
    })
    expect(folderCreated.status).toBe(200)

    const created = await apiFetch('/api/watch-folders', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ rootId: 'default', path: 'WatchApi', enabled: false, recursive: false, mode: 'new' })
    })
    expect(created.status).toBe(200)
    const folder = (await created.json() as any).folder
    expect(folder.id).toBeTruthy()

    const patched = await apiFetch(`/api/watch-folders/${folder.id}`, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: false, recursive: true, mode: 'both' })
    })
    expect(patched.status).toBe(200)

    const folders = await apiFetch('/api/watch-folders', { headers: { cookie } })
    expect(folders.status).toBe(200)
    expect((await folders.json() as any).folders.some((item: any) => item.id === folder.id)).toBe(true)

    const events = await apiFetch(`/api/watch-events?folderId=${folder.id}&limit=10`, { headers: { cookie } })
    expect(events.status).toBe(200)
    expect(Array.isArray((await events.json() as any).events)).toBe(true)

    const deleted = await apiFetch(`/api/watch-folders/${folder.id}`, { method: 'DELETE', headers: { cookie } })
    expect(deleted.status).toBe(200)

    const removedDir = await apiFetch('/api/files/delete', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ rootId: 'default', path: 'WatchApi' })
    })
    expect(removedDir.status).toBe(200)

    const storage = await apiFetch('/api/storage', { headers: { cookie } })
    expect(storage.status).toBe(200)
    expect(await storage.json()).toHaveProperty('disk')

    const cleanup = await apiFetch('/api/storage/cleanup', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ targets: ['aiLogs'], days: 3650 })
    })
    expect(cleanup.status).toBe(200)
  })

  it('validates config updates and preserves blank integration token', async () => {
    const invalid = await apiFetch('/api/config', {
      method: 'PUT',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ targetLanguage: '../../tmp/pwn' })
    })
    expect(invalid.status).toBe(400)

    const setToken = await apiFetch('/api/config', {
      method: 'PUT',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ integrationWebhookToken: 'hook-token-123456' })
    })
    expect(setToken.status).toBe(200)

    const blankToken = await apiFetch('/api/config', {
      method: 'PUT',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ integrationWebhookToken: '' })
    })
    expect(blankToken.status).toBe(200)

    const config = await apiFetch('/api/config', { headers: { cookie } })
    expect(config.status).toBe(200)
    expect(String((await config.json() as any).integrationWebhookToken)).toContain('****')
  })

  it('rejects oversized API request bodies', async () => {
    const response = await apiFetch('/api/config', {
      method: 'PUT',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ padding: 'x'.repeat(16 * 1024 * 1024 + 100) })
    })
    expect(response.status).toBe(413)
  })

  it('rate limits expensive endpoints', async () => {
    let lastStatus = 0
    for (let attempt = 0; attempt < 21; attempt++) {
      const response = await apiFetch('/api/model-list', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({})
      })
      lastStatus = response.status
    }
    expect(lastStatus).toBe(429)
  })

  it('validates integration webhook tokens and test events', async () => {
    const testEvent = await apiFetch('/api/integrations/sonarr?token=hook-token-123456', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ eventType: 'Test' })
    })
    expect(testEvent.status).toBe(200)
    expect(await testEvent.json()).toMatchObject({ ok: true, test: true, source: 'sonarr' })

    const invalid = await apiFetch('/api/integrations/sonarr?token=wrong-token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ eventType: 'Test' })
    })
    expect(invalid.status).toBe(401)
  })

  it('opens and closes the SSE progress stream', async () => {
    const controller = new AbortController()
    const response = await apiFetch('/api/sse/progress?taskId=missing-task', {
      headers: { cookie },
      signal: controller.signal
    })
    expect(response.status).toBe(200)
    expect(String(response.headers.get('content-type') || '')).toContain('text/event-stream')
    controller.abort()
  })

  it('supports session status, login and logout', async () => {
    const session = await apiFetch('/api/auth/session', { headers: { cookie } })
    expect(session.status).toBe(200)
    expect(await session.json()).toMatchObject({ hasPasskey: true, authenticated: true })

    const wrong = await apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ passkey: createHash('sha256').update('wrong-passkey').digest('hex') })
    })
    expect(wrong.status).toBe(401)

    const login = await apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ passkey })
    })
    expect(login.status).toBe(200)
    const newCookie = String(login.headers.get('set-cookie') || '').split(';')[0]
    expect(newCookie).toContain('subx_session=')

    const logout = await apiFetch('/api/auth/logout', { method: 'POST', headers: { cookie: newCookie } })
    expect(logout.status).toBe(200)
    const afterLogout = await apiFetch('/api/auth/session', { headers: { cookie: newCookie } })
    expect((await afterLogout.json() as any).authenticated).toBe(false)
  })

  it('creates, renames and deletes media folders safely', async () => {
    const created = await apiFetch('/api/files/create-folder', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ rootId: 'default', name: 'ApiDir' })
    })
    expect(created.status).toBe(200)

    const renamed = await apiFetch('/api/files/rename', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ rootId: 'default', path: 'ApiDir', newName: 'ApiDir2' })
    })
    expect(renamed.status).toBe(200)

    const deleted = await apiFetch('/api/files/delete', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ rootId: 'default', path: 'ApiDir2' })
    })
    expect(deleted.status).toBe(200)

    const invalidName = await apiFetch('/api/files/create-folder', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ rootId: 'default', name: '../escape' })
    })
    expect(invalidName.status).toBe(400)

    const deleteRoot = await apiFetch('/api/files/delete', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ rootId: 'default', path: '.' })
    })
    expect([400, 403]).toContain(deleteRoot.status)
  })

  it('creates, updates and deletes notification channels', async () => {
    const created = await apiFetch('/api/notification-channels', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'webhook',
        name: 'API Test Webhook',
        enabled: false,
        config: { url: `${webhookBaseUrl}/hook`, method: 'POST' }
      })
    })
    expect(created.status).toBe(200)
    const channel = (await created.json() as any).channel
    expect(channel.id).toBeTruthy()
    expect(channel.config).toEqual({})

    const listed = await apiFetch('/api/notification-channels', { headers: { cookie } })
    expect(listed.status).toBe(200)
    const channels = (await listed.json() as any).channels
    expect(channels.some((item: any) => item.id === channel.id)).toBe(true)

    const tested = await apiFetch(`/api/notification-channels/${channel.id}/test`, { method: 'POST', headers: { cookie } })
    expect(tested.status).toBe(200)
    expect(await tested.json()).toMatchObject({ ok: true })

    const deliveries = await apiFetch('/api/notification-deliveries?limit=10', { headers: { cookie } })
    expect(deliveries.status).toBe(200)
    expect((await deliveries.json() as any).deliveries.some((item: any) => item.channelId === channel.id && item.status === 'sent')).toBe(true)

    const patched = await apiFetch(`/api/notification-channels/${channel.id}`, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'webhook',
        name: 'API Test Webhook Updated',
        enabled: false,
        config: { url: `${webhookBaseUrl}/hook`, method: 'POST' }
      })
    })
    expect(patched.status).toBe(200)

    const deleted = await apiFetch(`/api/notification-channels/${channel.id}`, {
      method: 'DELETE',
      headers: { cookie }
    })
    expect(deleted.status).toBe(200)
  })

  it('enforces API token scopes', async () => {
    const createdResponse = await apiFetch('/api/api-tokens', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'read-only', scopes: ['tasks:read'] })
    })
    expect(createdResponse.status).toBe(200)
    const created = await createdResponse.json() as any
    readToken = created.token

    const tasks = await apiFetch('/api/tasks', { headers: { authorization: `Bearer ${readToken}` } })
    expect(tasks.status).toBe(200)

    const configWrite = await apiFetch('/api/config', {
      method: 'POST',
      headers: { authorization: `Bearer ${readToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ targetLanguage: 'zh-CN' })
    })
    expect(configWrite.status).toBe(403)

    const audit = await apiFetch('/api/api-token-audit?limit=10', { headers: { cookie } })
    expect(audit.status).toBe(200)
    expect((await audit.json() as any).logs.length).toBeGreaterThan(0)

    const revoked = await apiFetch(`/api/api-tokens/${created.item.id}`, { method: 'DELETE', headers: { cookie } })
    expect(revoked.status).toBe(200)
    const afterRevoke = await apiFetch('/api/tasks', { headers: { authorization: `Bearer ${readToken}` } })
    expect(afterRevoke.status).toBe(401)
  })
})
