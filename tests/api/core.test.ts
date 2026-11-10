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
mkdirSync(join(tempDir, 'media', 'DeepSearch'), { recursive: true })
writeFileSync(join(tempDir, 'media', 'DeepSearch', 'Nested.Movie.mkv'), '', 'utf-8')
writeFileSync(join(tempDir, 'media', 'DeepSearch', 'Nested.Movie.zh.srt'), '1\n00:00:00,000 --> 00:00:01,000\nNested\n', 'utf-8')

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

async function createSessionToken(name: string, scopes: string[]) {
  const response = await apiFetch('/api/api-tokens', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ name, scopes })
  })
  expect(response.status).toBe(200)
  return await response.json() as any
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
    expect(task?.startedAt).toBeTruthy()
    expect(task?.finishedAt).toBeTruthy()

    const download = await apiFetch(`/api/tasks/${completedTaskId}/download?format=srt`, { headers: { cookie } })
    expect(download.status).toBe(200)
    const content = await download.text()
    expect(content).toContain('Hello')
    expect(content).toContain('World')
  })

  it('persists structured subtitle styles and applies them to ASS output', async () => {
    const subtitleStyle = {
      presetId: 'bilingual_simple',
      original: {
        fontFamily: 'Noto Sans CJK SC',
        fontSize: 34,
        primaryColor: '#00FF00',
        outlineColor: '#000000',
        outlineWidth: 1.5,
        shadow: 0.4,
        bold: true,
        italic: false,
        marginV: 30,
        alignment: 'bottom'
      },
      translated: {
        fontFamily: 'Arial',
        fontSize: 48,
        primaryColor: '#FFFFFF',
        outlineColor: '#000000',
        outlineWidth: 2,
        shadow: 0.8,
        bold: false,
        italic: false,
        marginV: 24,
        alignment: 'bottom'
      },
      lineGap: 5,
      background: { enabled: false, color: '#000000', opacity: 45, padding: 2 }
    }

    const saved = await apiFetch('/api/config', {
      method: 'PUT',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ outputMode: 'original', subtitleFormat: 'ass', subtitleStyle, subtitleStylePreset: 'bilingual_simple' })
    })
    expect(saved.status).toBe(200)

    const config = await apiFetch('/api/config', { headers: { cookie } })
    const configBody = await config.json() as any
    expect(configBody.subtitleStyle.original.fontFamily).toBe('Noto Sans CJK SC')
    expect(configBody.subtitleStyle.original.primaryColor).toBe('#00FF00')

    const created = await apiFetch('/api/task', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        filePath: 'Demo.zh.srt',
        sourceType: 'external',
        targetLanguage: 'zh-CN',
        outputMode: 'original',
        subtitleFormat: 'ass',
        subtitleStyle,
        subtitleStylePreset: 'bilingual_simple'
      })
    })
    expect(created.status).toBe(200)
    const taskId = (await created.json() as any).taskId as string

    let task: any = null
    for (let attempt = 0; attempt < 40; attempt++) {
      const response = await apiFetch(`/api/tasks/${taskId}`, { headers: { cookie } })
      task = (await response.json() as any).task
      if (['done', 'error', 'cancelled', 'review'].includes(task.status)) break
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    expect(task?.status).toBe('done')
    expect(task?.subtitleStyle?.original?.fontFamily).toBe('Noto Sans CJK SC')

    const download = await apiFetch(`/api/tasks/${taskId}/download?format=ass`, { headers: { cookie } })
    expect(download.status).toBe(200)
    const content = await download.text()
    expect(content).toContain('Style: SubX-Original,Noto Sans CJK SC,34,&H0000FF00')
    expect(content).toContain('Hello')

    const review = await apiFetch(`/api/tasks/${taskId}/review`, { headers: { cookie } })
    const reviewBody = await review.json() as any
    expect(reviewBody.task.subtitleStyle.original.fontFamily).toBe('Noto Sans CJK SC')

    const presetOnly = await apiFetch('/api/config', {
      method: 'PUT',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ outputMode: 'bilingual', subtitleStylePreset: 'bilingual_cinema' })
    })
    expect(presetOnly.status).toBe(200)
    const presetConfig = await (await apiFetch('/api/config', { headers: { cookie } })).json() as any
    expect(presetConfig.subtitleStyle.presetId).toBe('bilingual_cinema')
    expect(presetConfig.subtitleStyle.translated.fontSize).toBe(56)
    expect(presetConfig.subtitleStylePreset).toBe('bilingual_cinema')

    await apiFetch('/api/config', {
      method: 'PUT',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ outputMode: 'translated', subtitleFormat: 'srt', subtitleStylePreset: 'mono_clean' })
    })
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

  it('downloads ASR original subtitles in segment order and returns 404 for empty runs', async () => {
    const taskId = 'asr-download-task'
    const emptyRunTaskId = 'asr-empty-run-task'
    const emptySegmentsTaskId = 'asr-empty-segments-task'
    const db = new Database(dbPath)
    db.pragma('busy_timeout = 5000')
    const insertTask = db.prepare(`
      INSERT INTO tasks (task_id, file_path, root_id, source_type, track_index, model, target_lang, output_mode, status)
      VALUES (?, ?, ?, 'asr', 0, 'test-model', 'zh-CN', 'original', 'done')
    `)
    insertTask.run(taskId, 'Asr.Video.mkv', 'default')
    insertTask.run(emptyRunTaskId, 'Asr.EmptyRun.mkv', 'default')
    insertTask.run(emptySegmentsTaskId, 'Asr.EmptySegments.mkv', 'default')

    const run = db.prepare("INSERT INTO transcription_runs (task_id, engine, model, language) VALUES (?, 'whisper', 'test', 'zh')").run(taskId)
    const runId = Number(run.lastInsertRowid)
    db.prepare('INSERT INTO asr_segments (run_id, start_ms, end_ms, text) VALUES (?, ?, ?, ?)').run(runId, 2000, 3000, 'ASR second line')
    db.prepare('INSERT INTO asr_segments (run_id, start_ms, end_ms, text) VALUES (?, ?, ?, ?)').run(runId, 0, 1000, 'ASR first line')

    db.prepare("INSERT INTO transcription_runs (task_id, engine, model, language) VALUES (?, 'whisper', 'test', 'zh')").run(emptySegmentsTaskId)
    db.close()

    const download = await apiFetch(`/api/tasks/${taskId}/download-original`, { headers: { cookie } })
    expect(download.status).toBe(200)
    expect(String(download.headers.get('content-type') || '')).toContain('text/plain')
    const content = await download.text()
    expect(content).toContain('1\n00:00:00,000 --> 00:00:01,000\nASR first line')
    expect(content).toContain('2\n00:00:02,000 --> 00:00:03,000\nASR second line')
    expect(content.indexOf('ASR first line')).toBeLessThan(content.indexOf('ASR second line'))

    const emptyRun = await apiFetch(`/api/tasks/${emptyRunTaskId}/download-original`, { headers: { cookie } })
    expect(emptyRun.status).toBe(404)

    const emptySegments = await apiFetch(`/api/tasks/${emptySegmentsTaskId}/download-original`, { headers: { cookie } })
    expect(emptySegments.status).toBe(404)
  })

  it('returns completed ASR checkpoint segments while transcription is still running', async () => {
    const taskId = 'live-asr-task'
    const checkpointKey = 'live-asr-checkpoint'
    const db = new Database(dbPath)
    db.pragma('busy_timeout = 5000')
    try {
      db.prepare(`
        INSERT INTO tasks (task_id, file_path, root_id, source_type, track_index, model, target_lang, output_mode, status, asr_checkpoint_key)
        VALUES (?, ?, ?, 'asr', 0, 'test-model', 'zh-CN', 'translated', 'transcribing', ?)
      `).run(taskId, 'Live.Asr.mkv', 'default', checkpointKey)
      db.prepare(`
        INSERT INTO asr_checkpoints (checkpoint_key, chunk_index, start_ms, end_ms, status, language, confidence, engine, model, segments_json)
        VALUES (?, 0, 0, 300000, 'done', 'en', 0.9, 'faster-whisper', 'small', ?)
      `).run(checkpointKey, JSON.stringify([{ id: 1, start: 1, end: 2, text: 'First chunk' }]))
      db.prepare(`
        INSERT INTO asr_checkpoints (checkpoint_key, chunk_index, start_ms, end_ms, status, language, confidence, engine, model, segments_json)
        VALUES (?, 1, 300000, 600000, 'done', 'en', 0.8, 'faster-whisper', 'small', ?)
      `).run(checkpointKey, JSON.stringify([{ id: 1, start: 0.5, end: 1.5, text: 'Second chunk' }]))
    } finally {
      db.close()
    }

    const response = await apiFetch(`/api/tasks/${taskId}/asr`, { headers: { cookie } })
    expect(response.status).toBe(200)
    const body = await response.json() as any
    expect(body.run).toBeNull()
    expect(body.partial.active).toBe(true)
    expect(body.partial.doneChunks).toBe(2)
    expect(body.partial.totalSegments).toBe(2)
    expect(body.segments.map((segment: any) => segment.text)).toEqual(['First chunk', 'Second chunk'])
    expect(body.segments[0].startMs).toBe(1000)
    expect(body.segments[1].startMs).toBe(300500)
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

  it('searches the whole media root including nested files', async () => {
    const result = await apiFetch('/api/files/search?rootId=default&q=Nested', { headers: { cookie } })
    expect(result.status).toBe(200)
    const body = await result.json() as any
    expect(body.aborted).toBe(false)
    expect(body.files.some((item: any) => item.path === 'DeepSearch/Nested.Movie.mkv')).toBe(true)
    expect(body.files.some((item: any) => item.path === 'DeepSearch/Nested.Movie.zh.srt')).toBe(true)

    const tooShort = await apiFetch('/api/files/search?rootId=default&q=x', { headers: { cookie } })
    expect(tooShort.status).toBe(400)
  })

  it('keeps search working after a client aborts a search request', async () => {
    const controller = new AbortController()
    const pending = apiFetch('/api/files/search?rootId=default&q=Nested', {
      headers: { cookie },
      signal: controller.signal
    })
    controller.abort()
    await expect(pending).rejects.toBeTruthy()

    const retry = await apiFetch('/api/files/search?rootId=default&q=Nested', { headers: { cookie } })
    expect(retry.status).toBe(200)
    const body = await retry.json() as any
    expect(body.aborted).toBe(false)
    expect(body.files.some((item: any) => item.path === 'DeepSearch/Nested.Movie.mkv')).toBe(true)
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

  it('records failed tasks and deletes individual history entries', async () => {
    const created = await apiFetch('/api/task', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        filePath: 'Missing.mkv',
        sourceType: 'embedded',
        targetLanguage: 'zh-CN',
        outputMode: 'original',
        subtitleFormat: 'srt'
      })
    })
    expect(created.status).toBe(200)
    const taskId = (await created.json() as any).taskId

    let status = ''
    for (let attempt = 0; attempt < 40; attempt++) {
      const response = await apiFetch(`/api/tasks/${taskId}`, { headers: { cookie } })
      status = (await response.json() as any).task.status
      if (['done', 'error', 'cancelled', 'review'].includes(status)) break
      await new Promise(resolve => setTimeout(resolve, 150))
    }
    expect(['error', 'cancelled']).toContain(status)

    const removed = await apiFetch(`/api/tasks/${taskId}`, { method: 'DELETE', headers: { cookie } })
    expect(removed.status).toBe(200)
    const missing = await apiFetch(`/api/tasks/${taskId}`, { headers: { cookie } })
    expect(missing.status).toBe(404)
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


  it('records webhook path mapping failures', async () => {
    const response = await apiFetch('/api/integrations/sonarr?token=hook-token-123456', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ eventType: 'Download', episodeFile: { relativePath: '../../outside/Unknown.mkv' } })
    })
    expect(response.status).toBe(400)

    const events = await apiFetch('/api/integrations/events?limit=20', { headers: { cookie } })
    expect(events.status).toBe(200)
    const payload = await events.json() as any
    expect(payload.events.some((item: any) => item.status === 'failed')).toBe(true)
  })
  it('sends a persisted SSE snapshot and closes the stream', async () => {
    const db = new Database(dbPath)
    db.pragma('busy_timeout = 5000')
    db.prepare(`
      INSERT INTO tasks (task_id, file_path, root_id, source_type, track_index, model, target_lang, output_mode, status, progress)
      VALUES ('sse-snapshot-task', 'Demo.zh.srt', 'default', 'external', 0, 'test-model', 'zh-CN', 'original', 'translating', 42)
    `).run()
    db.close()

    const controller = new AbortController()
    const response = await apiFetch('/api/sse/progress?taskId=sse-snapshot-task', {
      headers: { cookie },
      signal: controller.signal
    })
    expect(response.status).toBe(200)
    expect(String(response.headers.get('content-type') || '')).toContain('text/event-stream')

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    const text = await Promise.race([
      reader.read().then(result => decoder.decode(result.value || new Uint8Array(), { stream: true })),
      new Promise<string>((resolve) => setTimeout(() => resolve('timeout'), 5000))
    ])
    controller.abort()
    expect(text).toContain('event: progress')
    expect(text).toContain('sse-snapshot-task')
    expect(text).toContain('"snapshot":true')
  })



  it('pauses and resumes an ASR task', async () => {
    const db = new Database(dbPath)
    db.pragma('busy_timeout = 5000')
    db.prepare(`
      INSERT INTO tasks (task_id, file_path, root_id, source_type, track_index, model, target_lang, output_mode, status, progress)
      VALUES ('pause-api-task', 'MissingForResume.mkv', 'default', 'asr', 0, 'test-model', 'zh-CN', 'translated', 'transcribing', 20)
    `).run()
    db.close()

    const paused = await apiFetch('/api/tasks/pause-api-task/pause', { method: 'POST', headers: { cookie } })
    expect(paused.status).toBe(200)
    expect(await paused.json()).toMatchObject({ success: true, status: 'paused' })

    const afterPause = await apiFetch('/api/tasks/pause-api-task', { headers: { cookie } })
    expect((await afterPause.json() as any).task.status).toBe('paused')

    const resumed = await apiFetch('/api/tasks/pause-api-task/resume', { method: 'POST', headers: { cookie } })
    expect(resumed.status).toBe(200)
    expect(await resumed.json()).toMatchObject({ success: true, status: 'queued' })

    let status = ''
    for (let attempt = 0; attempt < 40; attempt++) {
      const response = await apiFetch('/api/tasks/pause-api-task', { headers: { cookie } })
      status = (await response.json() as any).task.status
      if (['done', 'error', 'review', 'cancelled'].includes(status)) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    expect(['error', 'cancelled']).toContain(status)
    await apiFetch('/api/tasks/pause-api-task', { method: 'DELETE', headers: { cookie } })
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

  it('enforces the API token scope matrix across automation, config and token management', async () => {
    const automationRead = await createSessionToken('matrix-automation-read', ['automation:read'])
    const tasksRead = await createSessionToken('matrix-tasks-read', ['tasks:read'])
    const tokensManage = await createSessionToken('matrix-tokens-manage', ['tokens:manage'])
    const bearer = (token: string) => ({ authorization: `Bearer ${token}` })

    expect(automationRead.item.scopes).toEqual(['automation:read'])
    expect(tasksRead.item.scopes).toEqual(['tasks:read'])
    expect(tokensManage.item.scopes).toEqual(['tokens:manage'])

    const watchFolders = await apiFetch('/api/watch-folders', { headers: bearer(automationRead.token) })
    expect(watchFolders.status).toBe(200)
    expect(Array.isArray((await watchFolders.json() as any).folders)).toBe(true)

    const watchEvents = await apiFetch('/api/watch-events?limit=5', { headers: bearer(automationRead.token) })
    expect(watchEvents.status).toBe(200)
    expect(Array.isArray((await watchEvents.json() as any).events)).toBe(true)

    const channels = await apiFetch('/api/notification-channels', { headers: bearer(automationRead.token) })
    expect(channels.status).toBe(200)
    expect(Array.isArray((await channels.json() as any).channels)).toBe(true)

    const integrationEvents = await apiFetch('/api/integrations/events?limit=5', { headers: bearer(automationRead.token) })
    expect(integrationEvents.status).toBe(200)
    expect(Array.isArray((await integrationEvents.json() as any).events)).toBe(true)

    const createWatchFolder = await apiFetch('/api/watch-folders', {
      method: 'POST',
      headers: { ...bearer(automationRead.token), 'content-type': 'application/json' },
      body: JSON.stringify({ rootId: 'default', path: 'WatchApi', enabled: false, recursive: false, mode: 'new' })
    })
    expect(createWatchFolder.status).toBe(403)

    const createChannel = await apiFetch('/api/notification-channels', {
      method: 'POST',
      headers: { ...bearer(automationRead.token), 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'webhook', name: 'Matrix Denied', enabled: false, config: { url: `${webhookBaseUrl}/hook`, method: 'POST' } })
    })
    expect(createChannel.status).toBe(403)

    const configRead = await apiFetch('/api/config', { headers: bearer(automationRead.token) })
    expect(configRead.status).toBe(403)

    const configWrite = await apiFetch('/api/config', {
      method: 'PUT',
      headers: { ...bearer(tasksRead.token), 'content-type': 'application/json' },
      body: JSON.stringify({ targetLanguage: 'zh-CN' })
    })
    expect(configWrite.status).toBe(403)

    const tasks = await apiFetch('/api/tasks', { headers: bearer(tasksRead.token) })
    expect(tasks.status).toBe(200)
    expect(Array.isArray((await tasks.json() as any).tasks)).toBe(true)

    const createTask = await apiFetch('/api/task', {
      method: 'POST',
      headers: { ...bearer(tasksRead.token), 'content-type': 'application/json' },
      body: JSON.stringify({ filePath: 'Demo.zh.srt', targetLanguage: 'zh-CN' })
    })
    expect(createTask.status).toBe(403)

    const tasksWithAutomationRead = await apiFetch('/api/tasks', { headers: bearer(automationRead.token) })
    expect(tasksWithAutomationRead.status).toBe(403)

    const automationWithTasksRead = await apiFetch('/api/watch-folders', { headers: bearer(tasksRead.token) })
    expect(automationWithTasksRead.status).toBe(403)

    const tokensWithAutomationRead = await apiFetch('/api/api-tokens', { headers: bearer(automationRead.token) })
    expect(tokensWithAutomationRead.status).toBe(403)

    const tokensWithTasksRead = await apiFetch('/api/api-tokens', { headers: bearer(tasksRead.token) })
    expect(tokensWithTasksRead.status).toBe(403)

    const tokenList = await apiFetch('/api/api-tokens', { headers: bearer(tokensManage.token) })
    expect(tokenList.status).toBe(200)
    const tokenListBody = await tokenList.json() as any
    expect(tokenListBody.tokens.some((item: any) => item.id === automationRead.item.id)).toBe(true)

    const childResponse = await apiFetch('/api/api-tokens', {
      method: 'POST',
      headers: { ...bearer(tokensManage.token), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'matrix-tokens-child', scopes: ['tokens:manage'] })
    })
    expect(childResponse.status).toBe(200)
    const child = await childResponse.json() as any
    expect(child.token).toMatch(/^subx_[a-f0-9]{48}$/)
    expect(child.item.scopes).toEqual(['tokens:manage'])

    const childList = await apiFetch('/api/api-tokens', { headers: bearer(child.token) })
    expect(childList.status).toBe(200)

    const audit = await apiFetch('/api/api-token-audit?limit=5', { headers: bearer(tokensManage.token) })
    expect(audit.status).toBe(200)
    expect(Array.isArray((await audit.json() as any).logs)).toBe(true)

    const revokeChild = await apiFetch(`/api/api-tokens/${child.item.id}`, { method: 'DELETE', headers: bearer(tokensManage.token) })
    expect(revokeChild.status).toBe(200)

    const childAfterRevoke = await apiFetch('/api/api-tokens', { headers: bearer(child.token) })
    expect(childAfterRevoke.status).toBe(401)

    const automationWithTokensManage = await apiFetch('/api/watch-folders', { headers: bearer(tokensManage.token) })
    expect(automationWithTokensManage.status).toBe(403)
  })
})
