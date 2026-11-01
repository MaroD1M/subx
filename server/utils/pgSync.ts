/**
 * PostgreSQL sync bridge.
 *
 * The existing application code uses better-sqlite3's synchronous API. To keep
 * that API while supporting PostgreSQL, queries run in a worker thread and the
 * main thread waits on shared memory. This is intentionally a compatibility
 * layer, not a high-concurrency database driver: each query blocks the event
 * loop. Every request carries a sequence number; a timeout or stale response
 * restarts the worker to avoid mixing responses.
 */

import { Worker } from 'worker_threads'
import { existsSync } from 'fs'
import { join } from 'path'

const IDENTITY_TABLES = new Set([
  'task_responses', 'transcription_runs', 'asr_segments', 'watch_folders', 'watch_events',
  'notification_channels', 'notification_deliveries', 'api_tokens', 'integration_events',
  'api_audit_logs', 'task_logs', 'task_review_entries', 'translation_quality_runs',
  'translation_quality_entries'
])

const BUFFER_BYTES = 32 * 1024 * 1024
const QUERY_TIMEOUT_MS = 120_000

function convertPlaceholders(sql: string): string {
  let result = ''
  let index = 1
  let single = false
  let double = false
  for (let position = 0; position < sql.length; position++) {
    const char = sql[position]
    const previous = position > 0 ? sql[position - 1] : ''
    if (char === "'" && !double && previous !== '\\') single = !single
    if (char === '"' && !single && previous !== '\\') double = !double
    if (char === '?' && !single && !double) {
      result += `$${index++}`
    } else {
      result += char
    }
  }
  return result
}

export function translateSql(input: string): string {
  let sql = String(input || '').trim().replace(/;+\s*$/, '')
  const replaceMatch = sql.match(/^INSERT\s+OR\s+REPLACE\s+INTO\s+([a-zA-Z_][\w]*)/i)
  if (replaceMatch) {
    const table = replaceMatch[1]
    sql = sql.replace(/^INSERT\s+OR\s+REPLACE\s+INTO/i, 'INSERT INTO')
    if (table === 'config') {
      sql += ' ON CONFLICT (key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at'
    } else if (table === 'translations_cache') {
      sql += ' ON CONFLICT (hash) DO UPDATE SET original_text=excluded.original_text, translated_text=excluded.translated_text, model=excluded.model, target_language=excluded.target_language, updated_at=excluded.updated_at'
    }
  } else if (/^INSERT\s+OR\s+IGNORE\s+INTO/i.test(sql)) {
    sql = sql.replace(/^INSERT\s+OR\s+IGNORE\s+INTO/i, 'INSERT INTO')
    if (!/\bON\s+CONFLICT\b/i.test(sql)) sql += ' ON CONFLICT DO NOTHING'
  }

  sql = sql
    .replace(/datetime\('now',\s*\?\)/gi, '(CURRENT_TIMESTAMP + ?::interval)')
    .replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP')

  const insertMatch = sql.match(/^INSERT\s+INTO\s+([a-zA-Z_][\w]*)/i)
  if (insertMatch && IDENTITY_TABLES.has(insertMatch[1]!) && !/\bRETURNING\b/i.test(sql)) {
    sql += ' RETURNING id'
  }
  return convertPlaceholders(sql)
}

function normalizeParams(params: any[]): any[] {
  return params.map(value => value === undefined ? null : value)
}

export class PgDatabase {
  private worker: Worker
  private shared: SharedArrayBuffer
  private header: Int32Array
  private bytes: Uint8Array
  private connectionString: string
  private seq = 0
  private dead = false

  constructor(connectionString: string) {
    this.connectionString = connectionString
    this.worker = null as any
    this.shared = null as any
    this.header = null as any
    this.bytes = null as any
    this.startWorker()
  }

  private startWorker() {
    this.shared = new SharedArrayBuffer(BUFFER_BYTES)
    this.header = new Int32Array(this.shared, 0, 4)
    this.bytes = new Uint8Array(this.shared, 16)
    this.dead = false
    const productionPath = join(process.cwd(), '.output', 'server', 'pgWorker.cjs')
    const developmentPath = join(process.cwd(), 'server', 'utils', 'pgWorker.cjs')
    const workerPath = existsSync(productionPath) ? productionPath : developmentPath
    const worker = new Worker(workerPath, { workerData: { connectionString: this.connectionString, shared: this.shared } })
    this.worker = worker
    worker.on('error', (error) => {
      if (this.worker === worker) this.dead = true
      console.error('[PostgreSQL] Worker error:', error)
    })
    worker.on('exit', (code) => {
      if (this.worker === worker) this.dead = true
      if (code !== 0) console.error(`[PostgreSQL] Worker exited with code ${code}`)
    })
  }

  private resetWorker() {
    try { void this.worker?.terminate() } catch { /* ignore */ }
    this.startWorker()
  }

  query(sql: string, params: any[] = []) {
    if (this.dead) this.resetWorker()
    this.seq += 1
    const seq = this.seq
    const request = Buffer.from(JSON.stringify({ sql, params: normalizeParams(params), seq }))
    if (request.length > this.bytes.length) throw new Error('PostgreSQL 查询请求超过共享缓冲区限制')
    this.bytes.set(request)
    Atomics.store(this.header, 3, seq)
    Atomics.store(this.header, 1, request.length)
    Atomics.store(this.header, 0, 0)
    this.worker.postMessage(1)
    const wait = Atomics.wait(this.header, 0, 0, QUERY_TIMEOUT_MS)
    if (wait === 'timed-out') {
      this.resetWorker()
      throw new Error('PostgreSQL 查询超时，worker 已重启')
    }
    const responseLength = Atomics.load(this.header, 2)
    let response: any
    try {
      response = JSON.parse(Buffer.from(this.bytes.slice(0, responseLength)).toString('utf8'))
    } catch {
      this.resetWorker()
      throw new Error('PostgreSQL 返回了无法解析的响应，worker 已重启')
    }
    if (response.seq !== seq) {
      this.resetWorker()
      throw new Error('PostgreSQL 响应序号不匹配，worker 已重启')
    }
    if (!response.ok) throw new Error(response.error || 'PostgreSQL 查询失败')
    return response.result
  }

  prepare(sql: string) {
    const translated = translateSql(sql)
    return {
      get: (...params: any[]) => this.query(translated, params).rows[0],
      all: (...params: any[]) => this.query(translated, params).rows,
      run: (...params: any[]) => {
        const result = this.query(translated, params)
        return {
          changes: Number(result.rowCount || 0),
          lastInsertRowid: Number(result.rows?.[0]?.id || 0)
        }
      }
    }
  }

  exec(sql: string) {
    this.query(sql, [])
  }

  pragma() {
    return undefined
  }

  close() {
    try {
      this.worker?.removeAllListeners()
      void this.worker?.terminate()
    } catch { /* ignore */ }
  }
}
