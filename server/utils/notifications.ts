/**
 * Notification adapters and delivery queue.
 *
 * Channels store encrypted credentials; deliveries are claimed atomically,
 * retried with backoff and recovered after a crash. Notification failures must
 * never fail the main subtitle task.
 */

import { createHmac, randomUUID } from 'crypto'
import nodemailer from 'nodemailer'
import { fetch as undiciFetch, ProxyAgent } from 'undici'
import type { NotificationChannel, NotificationChannelType, NotificationEvent } from '../../types'
import { useDb } from './db'
import { ConfigService } from './config'
import { decryptSecret, encryptSecret, isEncryptedSecret } from './secret'

export const NOTIFICATION_EVENTS: NotificationEvent[] = [
  'task_done',
  'task_error',
  'task_cancelled',
  'low_confidence',
  'watch_error',
  'backfill_done'
]

const SECRET_FIELDS: Record<NotificationChannelType, string[]> = {
  telegram: ['botToken'],
  smtp: ['password'],
  webhook: ['secret', 'headers'],
  ntfy: ['token'],
  discord: ['url'],
  matrix: ['accessToken'],
  wecom: ['url']
}

const EVENT_LABELS: Record<NotificationEvent, string> = {
  task_done: '任务完成',
  task_error: '任务失败',
  task_cancelled: '任务取消',
  low_confidence: '低置信度',
  watch_error: '监控异常',
  backfill_done: '回填完成',
  test: '测试通知'
}

function asString(value: unknown): string {
  return String(value ?? '').trim()
}

function normalizeEvents(value: unknown): NotificationEvent[] {
  const items = Array.isArray(value) ? value : NOTIFICATION_EVENTS
  const events = items
    .map(item => String(item))
    .filter((item): item is NotificationEvent => NOTIFICATION_EVENTS.includes(item as NotificationEvent))
  return events.length ? Array.from(new Set(events)) : [...NOTIFICATION_EVENTS]
}

function validateHttpUrl(value: string, label: string): string {
  const text = asString(value)
  if (!text) return ''
  try {
    const url = new URL(text)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol')
    return text
  } catch {
    throw new Error(`${label}必须是合法的 http/https 地址`)
  }
}

function parseHeaders(value: unknown): Record<string, string> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, val]) => [key, String(val)]))
  }
  const text = asString(value)
  if (!text) return {}
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object')
    return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).map(([key, val]) => [key, String(val)]))
  } catch {
    throw new Error('Webhook Headers 必须是 JSON 对象')
  }
}

export function sanitizeChannelConfig(type: NotificationChannelType, input: unknown): Record<string, any> {
  const raw = (input && typeof input === 'object') ? input as Record<string, any> : {}
  if (type === 'telegram') {
    return {
      botToken: asString(raw.botToken),
      chatId: asString(raw.chatId),
      proxyUrl: validateHttpUrl(raw.proxyUrl, 'Telegram 代理地址'),
      events: normalizeEvents(raw.events)
    }
  }
  if (type === 'smtp') {
    const port = Number(raw.port || 587)
    return {
      host: asString(raw.host),
      port: Number.isFinite(port) ? Math.min(65535, Math.max(1, Math.floor(port))) : 587,
      secure: raw.secure === true,
      user: asString(raw.user),
      password: asString(raw.password),
      from: asString(raw.from),
      to: asString(raw.to),
      rejectUnauthorized: raw.rejectUnauthorized !== false,
      events: normalizeEvents(raw.events)
    }
  }
  if (type === 'discord') {
    return {
      url: validateHttpUrl(raw.url, 'Discord Webhook 地址'),
      events: normalizeEvents(raw.events)
    }
  }
  if (type === 'matrix') {
    return {
      homeserverUrl: validateHttpUrl(raw.homeserverUrl, 'Matrix Homeserver 地址'),
      roomId: asString(raw.roomId),
      accessToken: asString(raw.accessToken),
      events: normalizeEvents(raw.events)
    }
  }
  if (type === 'wecom') {
    return {
      url: validateHttpUrl(raw.url, '企业微信 Webhook 地址'),
      events: normalizeEvents(raw.events)
    }
  }
  if (type === 'webhook') {
    const method = ['POST', 'PUT', 'PATCH'].includes(String(raw.method || 'POST').toUpperCase())
      ? String(raw.method || 'POST').toUpperCase()
      : 'POST'
    return {
      url: validateHttpUrl(raw.url, 'Webhook 地址'),
      method,
      headers: parseHeaders(raw.headers),
      secret: asString(raw.secret),
      proxyUrl: validateHttpUrl(raw.proxyUrl, 'Webhook 代理地址'),
      events: normalizeEvents(raw.events)
    }
  }
  return {
    url: validateHttpUrl(raw.url, 'ntfy 地址') || 'https://ntfy.sh',
    topic: asString(raw.topic),
    token: asString(raw.token),
    priority: Math.min(5, Math.max(1, Number(raw.priority) || 3)),
    proxyUrl: validateHttpUrl(raw.proxyUrl, 'ntfy 代理地址'),
    events: normalizeEvents(raw.events)
  }
}

function encryptConfig(type: NotificationChannelType, config: Record<string, any>): Record<string, any> {
  const result = { ...config }
  for (const field of SECRET_FIELDS[type] || []) {
    const value = result[field]
    if (field === 'headers' && value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0) {
      result[field] = encryptSecret(JSON.stringify(value))
    } else if (typeof value === 'string' && value && !isEncryptedSecret(value)) {
      result[field] = encryptSecret(value)
    }
  }
  return result
}

function decryptConfig(type: NotificationChannelType, config: Record<string, any>): Record<string, any> {
  const result = { ...config }
  for (const field of SECRET_FIELDS[type] || []) {
    if (typeof result[field] === 'string' && isEncryptedSecret(result[field])) {
      try {
        const plain = decryptSecret(result[field])
        result[field] = field === 'headers' ? JSON.parse(plain) : plain
      } catch {
        result[field] = field === 'headers' ? {} : ''
      }
    }
  }
  return result
}

export function maskChannelConfig(type: NotificationChannelType, config: Record<string, any>): Record<string, any> & { secretsSet: Record<string, boolean> } {
  const masked = { ...config }
  const secretsSet: Record<string, boolean> = {}
  for (const field of SECRET_FIELDS[type] || []) {
    const value = config[field]
    const hasValue = field === 'headers'
      ? Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0)
      : (Array.isArray(value) ? Object.keys(value).length > 0 : Boolean(value))
    secretsSet[field] = hasValue
    masked[field] = field === 'headers' ? (hasValue ? '{}' : '') : ''
  }
  return { ...masked, secretsSet }
}

function mergeSecrets(type: NotificationChannelType, incoming: Record<string, any>, existing: Record<string, any>) {
  const result = { ...incoming }
  for (const field of SECRET_FIELDS[type] || []) {
    const value = incoming[field]
    const isBlank = field === 'headers'
      ? (!value || (typeof value === 'object' && Object.keys(value).length === 0))
      : !asString(value) || asString(value).includes('****')
    if (isBlank && existing[field]) result[field] = existing[field]
  }
  return result
}

function envProxyUrl(): string {
  for (const key of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy']) {
    const value = asString(process.env[key])
    if (value) return value
  }
  return ''
}

function shouldBypassProxy(targetUrl: string): boolean {
  const noProxy = asString(process.env.NO_PROXY || process.env.no_proxy)
  if (!noProxy) return false
  let hostname = ''
  try {
    hostname = new URL(targetUrl).hostname.toLowerCase()
  } catch {
    return false
  }
  return noProxy.split(',').map(item => item.trim().toLowerCase()).filter(Boolean).some(item => {
    if (item === '*') return true
    const host = item.replace(/^\./, '').replace(/:\d+$/, '')
    return hostname === host || hostname.endsWith(`.${host}`)
  })
}

function resolveProxyUrl(explicit?: unknown, targetUrl?: string): string {
  const value = asString(explicit)
  if (value) return value
  if (targetUrl && shouldBypassProxy(targetUrl)) return ''
  return envProxyUrl()
}

function maskProxyUrl(proxyUrl: string): string {
  if (!proxyUrl) return ''
  try {
    const url = new URL(proxyUrl)
    return `${url.protocol}//${url.host}`
  } catch {
    return '已配置代理'
  }
}

function getProxyDispatcher(proxyUrl: string) {
  return proxyUrl ? new ProxyAgent(proxyUrl) : undefined
}

function describeFetchError(error: any): string {
  const cause = error?.cause
  return String(cause?.code || cause?.message || error?.code || error?.message || error)
}

async function outboundFetch(label: string, url: string, init: any, proxyUrl?: unknown) {
  const proxy = resolveProxyUrl(proxyUrl, url)
  try {
    return await undiciFetch(url, { ...init, dispatcher: getProxyDispatcher(proxy) } as any)
  } catch (error: any) {
    const proxyText = proxy ? `（代理 ${maskProxyUrl(proxy)}）` : ''
    throw new Error(`${label} 网络请求失败${proxyText}：${describeFetchError(error)}`)
  }
}

export async function testNotificationProxy(proxyUrl?: string) {
  const started = Date.now()
  const proxy = resolveProxyUrl(proxyUrl, 'https://api.telegram.org')
  const response = await outboundFetch('代理测试', 'https://api.telegram.org', {
    method: 'GET',
    signal: AbortSignal.timeout(10_000)
  }, proxyUrl)
  return {
    ok: response.status < 400 || response.status === 404,
    status: response.status,
    latencyMs: Date.now() - started,
    proxy: proxy ? maskProxyUrl(proxy) : ''
  }
}

async function sendTelegram(config: Record<string, any>, payload: NotificationPayload) {
  const token = asString(config.botToken)
  const chatId = asString(config.chatId)
  if (!token || !chatId) throw new Error('Telegram Bot Token 或 Chat ID 未配置')
  const response = await outboundFetch('Telegram', `https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: `${payload.title}\n\n${payload.body}`, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(15_000)
  }, config.proxyUrl)
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Telegram 发送失败 (${response.status}) ${text.substring(0, 200)}`)
  }
}

async function sendSmtp(config: Record<string, any>, payload: NotificationPayload) {
  if (!asString(config.host) || !asString(config.to)) throw new Error('SMTP Host 或收件人未配置')
  const transporter = nodemailer.createTransport({
    host: asString(config.host),
    port: Number(config.port || 587),
    secure: config.secure === true,
    auth: asString(config.user) ? { user: asString(config.user), pass: asString(config.password) } : undefined,
    tls: { rejectUnauthorized: config.rejectUnauthorized !== false },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000
  })
  await transporter.sendMail({
    from: asString(config.from) || asString(config.user),
    to: asString(config.to),
    subject: `[SubX] ${payload.title}`,
    text: payload.body
  })
}

async function sendWebhook(config: Record<string, any>, payload: NotificationPayload) {
  const url = validateHttpUrl(config.url, 'Webhook 地址')
  if (!url) throw new Error('Webhook 地址未配置')
  const body = JSON.stringify({ event: payload.event, title: payload.title, body: payload.body, timestamp: new Date().toISOString() })
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(config.headers || {}) }
  if (asString(config.secret)) {
    headers['X-SubX-Signature'] = `sha256=${createHmac('sha256', asString(config.secret)).update(body).digest('hex')}`
  }
  const response = await outboundFetch('Webhook', url, {
    method: String(config.method || 'POST'),
    headers,
    body,
    signal: AbortSignal.timeout(15_000)
  }, config.proxyUrl)
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Webhook 发送失败 (${response.status}) ${text.substring(0, 200)}`)
  }
}

async function sendDiscord(config: Record<string, any>, payload: NotificationPayload) {
  const url = validateHttpUrl(config.url, 'Discord Webhook 地址')
  if (!url) throw new Error('Discord Webhook 地址未配置')
  const response = await outboundFetch('Discord', url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: `${payload.title}\n\n${payload.body}` }),
    signal: AbortSignal.timeout(15_000)
  })
  if (!response.ok) throw new Error(`Discord 发送失败 (${response.status})`)
}

async function sendMatrix(config: Record<string, any>, payload: NotificationPayload) {
  const base = validateHttpUrl(config.homeserverUrl, 'Matrix Homeserver 地址').replace(/\/+$/, '')
  const roomId = asString(config.roomId)
  const token = asString(config.accessToken)
  if (!base || !roomId || !token) throw new Error('Matrix Homeserver、Room ID 或 Access Token 未配置')
  const txnId = randomUUID()
  const response = await outboundFetch('Matrix', `${base}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}?access_token=${encodeURIComponent(token)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msgtype: 'm.text', body: `${payload.title}\n\n${payload.body}` }),
    signal: AbortSignal.timeout(15_000)
  })
  if (!response.ok) throw new Error(`Matrix 发送失败 (${response.status})`)
}

async function sendWecom(config: Record<string, any>, payload: NotificationPayload) {
  const url = validateHttpUrl(config.url, '企业微信 Webhook 地址')
  if (!url) throw new Error('企业微信 Webhook 地址未配置')
  const response = await outboundFetch('企业微信', url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msgtype: 'text', text: { content: `${payload.title}\n\n${payload.body}` } }),
    signal: AbortSignal.timeout(15_000)
  })
  if (!response.ok) throw new Error(`企业微信发送失败 (${response.status})`)
}

async function sendNtfy(config: Record<string, any>, payload: NotificationPayload) {
  const base = validateHttpUrl(config.url, 'ntfy 地址') || 'https://ntfy.sh'
  const topic = asString(config.topic)
  if (!topic) throw new Error('ntfy Topic 未配置')
  const url = `${base.replace(/\/+$/, '')}/${encodeURIComponent(topic)}`
  const asciiTitle = /^[\x20-\x7E]*$/.test(payload.title) ? payload.title : 'SubX'
  const messageBody = asciiTitle === payload.title ? payload.body : `${payload.title}\n\n${payload.body}`
  const headers: Record<string, string> = {
    'Title': asciiTitle,
    'Priority': String(Math.min(5, Math.max(1, Number(config.priority) || 3)))
  }
  if (asString(config.token)) headers.Authorization = `Bearer ${asString(config.token)}`
  const response = await outboundFetch('ntfy', url, {
    method: 'POST',
    headers,
    body: messageBody,
    signal: AbortSignal.timeout(15_000)
  }, config.proxyUrl)
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`ntfy 发送失败 (${response.status}) ${text.substring(0, 200)}`)
  }
}

export interface NotificationPayload {
  event: NotificationEvent
  title: string
  body: string
}

export async function sendChannel(channel: NotificationChannel, payload: NotificationPayload) {
  const config = decryptConfig(channel.type, channel.config)
  if (channel.type === 'telegram') return sendTelegram(config, payload)
  if (channel.type === 'smtp') return sendSmtp(config, payload)
  if (channel.type === 'webhook') return sendWebhook(config, payload)
  if (channel.type === 'discord') return sendDiscord(config, payload)
  if (channel.type === 'matrix') return sendMatrix(config, payload)
  if (channel.type === 'wecom') return sendWecom(config, payload)
  return sendNtfy(config, payload)
}

function rowToChannel(row: any): NotificationChannel {
  return {
    id: Number(row.id),
    type: String(row.type) as NotificationChannelType,
    name: String(row.name),
    config: JSON.parse(row.config_json || '{}'),
    enabled: Number(row.enabled) === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function eventAllowed(channel: NotificationChannel, event: NotificationEvent) {
  if (event === 'test') return true
  const events = Array.isArray(channel.config.events) ? channel.config.events : NOTIFICATION_EVENTS
  return events.includes(event)
}

let notificationQueueProcessing = false

async function processNotificationQueue(limit = 10) {
  if (notificationQueueProcessing) return
  notificationQueueProcessing = true
  try {
    const db = useDb()
    const candidates = db.prepare(`
      SELECT id FROM notification_deliveries
      WHERE status = 'pending' AND next_run_at <= datetime('now')
      ORDER BY created_at ASC
      LIMIT ?
    `).all(limit) as Array<{ id: number }>

    for (const candidate of candidates) {
      const claimed = db.prepare("UPDATE notification_deliveries SET status='processing', updated_at=datetime('now') WHERE id = ? AND status='pending'").run(candidate.id)
      if (claimed.changes === 0) continue
      const row = db.prepare(`
        SELECT d.*, c.type, c.name, c.config_json, c.enabled
        FROM notification_deliveries d
        LEFT JOIN notification_channels c ON c.id = d.channel_id
        WHERE d.id = ?
      `).get(candidate.id) as any
      if (!row) {
        db.prepare("UPDATE notification_deliveries SET status='failed', last_error='渠道记录不存在', updated_at=datetime('now') WHERE id = ?").run(candidate.id)
        continue
      }
      const channel: NotificationChannel = {
        id: Number(row.channel_id),
        type: String(row.type) as NotificationChannelType,
        name: String(row.name || '已删除渠道'),
        config: JSON.parse(row.config_json || '{}'),
        enabled: Number(row.enabled) === 1
      }
      if (!channel.enabled) {
        db.prepare("UPDATE notification_deliveries SET status='skipped', last_error='渠道已停用', updated_at=datetime('now') WHERE id = ?").run(row.id)
        continue
      }
      try {
        await sendChannel(channel, { event: row.event, title: row.title, body: row.body })
        db.prepare("UPDATE notification_deliveries SET status='sent', attempts=attempts + 1, last_error=NULL, updated_at=datetime('now') WHERE id = ?").run(row.id)
      } catch (e: any) {
        const attempts = Number(row.attempts || 0) + 1
        const maxAttempts = Number(row.max_attempts || 3)
        const message = String(e?.message || e)
        if (attempts < maxAttempts) {
          db.prepare(`
            UPDATE notification_deliveries
            SET status='pending', attempts=?, last_error=?, next_run_at=datetime('now', ?), updated_at=datetime('now')
            WHERE id = ?
          `).run(attempts, message, `+${Math.min(600, 30 * attempts)} seconds`, row.id)
        } else {
          db.prepare("UPDATE notification_deliveries SET status='failed', attempts=?, last_error=?, updated_at=datetime('now') WHERE id = ?")
            .run(attempts, message, row.id)
        }
      }
    }
  } catch (e) {
    console.error('[Notification] 队列处理失败:', e)
  } finally {
    notificationQueueProcessing = false
  }
}

export const NotificationService = {
  async listChannels(masked = true) {
    const rows = useDb().prepare('SELECT * FROM notification_channels ORDER BY id ASC').all() as any[]
    return rows.map(row => {
      const channel = rowToChannel(row)
      return { ...channel, config: masked ? maskChannelConfig(channel.type, channel.config) : channel.config }
    })
  },

  getChannel(id: number): NotificationChannel | null {
    const row = useDb().prepare('SELECT * FROM notification_channels WHERE id = ?').get(id) as any
    return row ? rowToChannel(row) : null
  },

  upsertChannel(input: { id?: number, type: NotificationChannelType, name: string, config: unknown, enabled?: boolean }) {
    const db = useDb()
    const existing = input.id ? this.getChannel(Number(input.id)) : null
    const clean = sanitizeChannelConfig(input.type, input.config)
    const merged = mergeSecrets(input.type, clean, existing?.config || {})
    const encrypted = encryptConfig(input.type, merged)
    const name = asString(input.name) || `${input.type} 通知`
    const enabled = input.enabled !== false ? 1 : 0
    if (existing) {
      db.prepare('UPDATE notification_channels SET type = ?, name = ?, config_json = ?, enabled = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run(input.type, name, JSON.stringify(encrypted), enabled, existing.id)
      return this.getChannel(existing.id)
    }
    const info = db.prepare('INSERT INTO notification_channels (type, name, config_json, enabled) VALUES (?, ?, ?, ?)')
      .run(input.type, name, JSON.stringify(encrypted), enabled)
    return this.getChannel(Number(info.lastInsertRowid))
  },

  deleteChannel(id: number) {
    return useDb().prepare('DELETE FROM notification_channels WHERE id = ?').run(id).changes > 0
  },

  async enqueue(event: NotificationEvent, title: string, body: string, options: { channelIds?: number[], dedupeKey?: string } = {}) {
    if (event !== 'test') {
      const config = await ConfigService.getConfig()
      if (config.notificationEnabled === false) return 0
    }
    const db = useDb()
    const rows = db.prepare('SELECT * FROM notification_channels WHERE enabled = 1 ORDER BY id ASC').all() as any[]
    const allowedIds = Array.isArray(options.channelIds) && options.channelIds.length
      ? new Set(options.channelIds.map(Number))
      : null
    let queued = 0
    for (const row of rows) {
      const channel = rowToChannel(row)
      if (allowedIds && !allowedIds.has(channel.id)) continue
      if (!eventAllowed(channel, event)) continue
      const dedupeKey = options.dedupeKey
        ? `${options.dedupeKey}:${channel.id}`
        : `${event}:${randomUUID()}:${channel.id}`
      const info = db.prepare(`
        INSERT OR IGNORE INTO notification_deliveries (channel_id, event, title, body, dedupe_key)
        VALUES (?, ?, ?, ?, ?)
      `).run(channel.id, event, title, body, dedupeKey)
      if (info.changes > 0) queued++
    }
    if (queued > 0) void this.processQueue()
    return queued
  },

  async notifyTaskEvent(taskId: string, event: NotificationEvent) {
    const db = useDb()
    const task = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as any
    if (!task) return 0
    const config = await ConfigService.getConfig()
    if (config.notificationEnabled === false) return 0

    const fileName = String(task.file_path || '').split('/').pop() || task.file_path
    let body = `文件：${fileName}\n目标语言：${task.target_lang || '-'}`
    if (task.output_path) body += `\n输出：${task.output_path}`
    if (task.error) body += `\n错误：${task.error}`

    let title = EVENT_LABELS[event] || event
    if (event === 'task_done') title = 'SubX 任务完成'
    if (event === 'task_error') title = 'SubX 任务失败'
    if (event === 'task_cancelled') title = 'SubX 任务已取消'

    if (event === 'low_confidence') {
      const threshold = Number(config.notificationLowConfidenceThreshold ?? 0.6)
      const row = db.prepare(`
        SELECT COUNT(*) AS count FROM task_review_entries
        WHERE task_id = ? AND asr_confidence IS NOT NULL AND asr_confidence < ?
      `).get(taskId, threshold) as { count?: number } | undefined
      const count = Number(row?.count || 0)
      if (count <= 0) return 0
      title = 'SubX 低置信度字幕待核对'
      body += `\n低置信度片段：${count} 条（阈值 ${Math.round(threshold * 100)}%）`
    }

    let channelIds: number[] = []
    if (task.watch_event_id) {
      const folder = db.prepare(`
        SELECT wf.output_policy_json
        FROM watch_events we JOIN watch_folders wf ON wf.id = we.folder_id
        WHERE we.id = ?
      `).get(task.watch_event_id) as { output_policy_json?: string } | undefined
      if (folder?.output_policy_json) {
        try {
          const policy = JSON.parse(folder.output_policy_json)
          if (Array.isArray(policy.notifyChannelIds) && policy.notifyChannelIds.length) {
            channelIds = policy.notifyChannelIds.map(Number)
          }
        } catch { /* ignore malformed policy */ }
      }
    }

    return this.enqueue(event, title, body, {
      channelIds,
      dedupeKey: `${event}:${taskId}`
    })
  },

  async notifyWatchError(folderId: number, folderName: string, path: string, error: string) {
    const bucket = Math.floor(Date.now() / 5 / 60 / 1000)
    return this.enqueue('watch_error', 'SubX 监控目录异常', `目录：${folderName}\n路径：${path}\n错误：${error}`, {
      dedupeKey: `watch_error:${folderId}:${bucket}`
    })
  },

  async notifyBackfillDone(folderId: number, folderName: string, queued: number, scanned: number) {
    return this.enqueue('backfill_done', 'SubX 历史回填已入队', `目录：${folderName}\n扫描：${scanned} 个视频\n加入队列：${queued} 个`, {
      dedupeKey: `backfill_done:${folderId}:${Date.now()}`
    })
  },

  recoverStuck(olderThanSeconds = 300) {
    try {
      return useDb().prepare(`
        UPDATE notification_deliveries
        SET status='pending', next_run_at=datetime('now'), last_error='服务重启恢复', updated_at=datetime('now')
        WHERE status='processing' AND updated_at < datetime('now', ?)
      `).run(`-${Math.max(60, Number(olderThanSeconds) || 300)} seconds`).changes
    } catch {
      return 0
    }
  },

  async sendTest(channelId: number) {
    const db = useDb()
    const channel = this.getChannel(channelId)
    if (!channel) throw new Error('通知渠道不存在')
    const dedupeKey = `test:${channelId}:${randomUUID()}`
    const payload: NotificationPayload = {
      event: 'test',
      title: 'SubX 测试通知',
      body: `这是一条来自 SubX 的测试通知。\n时间：${new Date().toLocaleString('zh-CN')}\n渠道：${channel.name}`
    }
    const info = db.prepare(`
      INSERT INTO notification_deliveries (channel_id, event, title, body, status, attempts, dedupe_key)
      VALUES (?, 'test', ?, ?, 'processing', 1, ?)
    `).run(channelId, payload.title, payload.body, dedupeKey)
    try {
      await sendChannel(channel, payload)
      db.prepare("UPDATE notification_deliveries SET status='sent', updated_at=datetime('now') WHERE id = ?").run(info.lastInsertRowid)
      return { ok: true }
    } catch (e: any) {
      const message = String(e?.message || e)
      db.prepare("UPDATE notification_deliveries SET status='failed', last_error=?, updated_at=datetime('now') WHERE id = ?").run(message, info.lastInsertRowid)
      return { ok: false, error: message }
    }
  },

  processQueue: processNotificationQueue
}
