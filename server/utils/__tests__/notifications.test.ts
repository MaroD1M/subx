import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { maskChannelConfig, NotificationService, sanitizeChannelConfig, sendChannel } from '../notifications'
import { testNotificationProxy } from '../notificationTransport'

const undiciFetchMock = vi.hoisted(() => vi.fn())
const dbHolder = vi.hoisted(() => ({ db: null as any }))

vi.mock('../db', () => ({ useDb: () => dbHolder.db }))

vi.mock('undici', async (importOriginal) => {
  const actual = await importOriginal<typeof import('undici')>()
  return { ...actual, fetch: undiciFetchMock }
})

function mockFetch(impl: (...args: any[]) => any = async () => ({ ok: true, text: async () => '' })) {
  const fn = vi.fn(impl)
  undiciFetchMock.mockImplementation(fn)
  return fn
}

afterEach(() => {
  undiciFetchMock.mockReset()
})

describe('notification channels', () => {
  it('sanitizes webhook config and defaults events', () => {
    const config = sanitizeChannelConfig('webhook', {
      url: 'https://example.com/hook',
      method: 'patch',
      headers: { Authorization: 'Bearer demo' }
    })
    expect(config.url).toBe('https://example.com/hook')
    expect(config.method).toBe('PATCH')
    expect(config.headers).toEqual({ Authorization: 'Bearer demo' })
    expect(config.events).toContain('task_done')
  })

  it('clamps SMTP port and rejects invalid URLs', () => {
    expect(sanitizeChannelConfig('smtp', { host: 'smtp.example.com', port: 99999 }).port).toBe(65535)
    expect(() => sanitizeChannelConfig('webhook', { url: 'ftp://example.com' })).toThrow('http/https')
  })

  it('masks secrets while exposing whether they are set', () => {
    const masked = maskChannelConfig('telegram', {
      botToken: 'secret-token',
      chatId: '123',
      events: ['task_done']
    })
    expect(masked.botToken).toBe('')
    expect(masked.chatId).toBe('123')
    expect(masked.secretsSet.botToken).toBe(true)
  })

  it('sends Telegram messages through fetch', async () => {
    const fetchMock = mockFetch()
    await sendChannel({
      id: 1,
      type: 'telegram',
      name: 'Telegram',
      enabled: true,
      config: { botToken: 'token', chatId: '42', events: ['task_done'] }
    }, { event: 'task_done', title: '完成', body: '文件已完成' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as any
    expect(url).toContain('api.telegram.org/bottoken/sendMessage')
    expect(JSON.parse(init.body).chat_id).toBe('42')
  })

  it('reports proxy connection causes instead of only fetch failed', async () => {
    undiciFetchMock.mockImplementation(async () => {
      throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } })
    })
    await expect(sendChannel({
      id: 7,
      type: 'telegram',
      name: 'Telegram',
      enabled: true,
      config: { botToken: 'token', chatId: '42', proxyUrl: 'http://127.0.0.1:7890', events: ['task_done'] }
    }, { event: 'task_done', title: '完成', body: '文件已完成' })).rejects.toThrow('ECONNREFUSED')
  })

  it('falls back to HTTPS_PROXY when the channel proxy is empty', async () => {
    process.env.HTTPS_PROXY = 'http://192.0.2.1:7890'
    try {
      const fetchMock = mockFetch(async () => ({ ok: true, status: 200, text: async () => '' }))
      const result = await testNotificationProxy('')
      expect(result.proxy).toBe('http://192.0.2.1:7890')
      expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.telegram.org')
    } finally {
      delete process.env.HTTPS_PROXY
    }
  })

  it('honors NO_PROXY for environment proxies', async () => {
    process.env.HTTPS_PROXY = 'http://192.0.2.1:7890'
    process.env.NO_PROXY = 'api.telegram.org'
    try {
      const fetchMock = mockFetch(async () => ({ ok: true, status: 200, text: async () => '' }))
      const result = await testNotificationProxy('')
      expect(result.proxy).toBe('')
      expect(fetchMock.mock.calls[0]?.[1]?.dispatcher).toBeUndefined()
    } finally {
      delete process.env.HTTPS_PROXY
      delete process.env.NO_PROXY
    }
  })

  it('tests proxy connectivity through Telegram endpoint', async () => {
    const fetchMock = mockFetch(async () => ({ ok: true, status: 200, text: async () => '' }))
    const result = await testNotificationProxy('http://127.0.0.1:7890')
    expect(result.ok).toBe(true)
    expect(result.proxy).toBe('http://127.0.0.1:7890')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.telegram.org')
  })


  it('reschedules failed deliveries and marks exhausted deliveries failed', async () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE notification_channels (
        id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, name TEXT NOT NULL,
        config_json TEXT NOT NULL DEFAULT '{}', enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE notification_deliveries (
        id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id INTEGER NOT NULL, event TEXT NOT NULL,
        title TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 3,
        next_run_at TEXT NOT NULL DEFAULT (datetime('now')), last_error TEXT,
        dedupe_key TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `)
    dbHolder.db = db
    try {
      const channelId = Number(db.prepare("INSERT INTO notification_channels (type, name, config_json) VALUES ('webhook', 'Retry', ?)").run(JSON.stringify({ url: 'http://127.0.0.1/hook', method: 'POST', events: ['task_done'] })).lastInsertRowid)
      const retryId = Number(db.prepare("INSERT INTO notification_deliveries (channel_id, event, title, body, status, attempts, max_attempts, next_run_at) VALUES (?, 'task_done', 't', 'b', 'pending', 0, 3, datetime('now', '-1 seconds'))").run(channelId).lastInsertRowid)
      const exhaustedId = Number(db.prepare("INSERT INTO notification_deliveries (channel_id, event, title, body, status, attempts, max_attempts, next_run_at) VALUES (?, 'task_done', 't', 'b', 'pending', 2, 3, datetime('now', '-1 seconds'))").run(channelId).lastInsertRowid)
      mockFetch(async () => ({ ok: false, status: 500, text: async () => 'server error' }))

      await NotificationService.processQueue()

      const retry = db.prepare('SELECT status, attempts, last_error FROM notification_deliveries WHERE id = ?').get(retryId) as any
      expect(retry.status).toBe('pending')
      expect(retry.attempts).toBe(1)
      expect(String(retry.last_error)).toContain('Webhook 发送失败')

      const exhausted = db.prepare('SELECT status, attempts, last_error FROM notification_deliveries WHERE id = ?').get(exhaustedId) as any
      expect(exhausted.status).toBe('failed')
      expect(exhausted.attempts).toBe(3)
      expect(String(exhausted.last_error)).toContain('Webhook 发送失败')
    } finally {
      db.close()
      dbHolder.db = null
    }
  })

  it('recovers deliveries stuck in processing', () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE notification_deliveries (
        id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id INTEGER NOT NULL, event TEXT NOT NULL,
        title TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 3,
        next_run_at TEXT NOT NULL DEFAULT (datetime('now')), last_error TEXT,
        dedupe_key TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `)
    dbHolder.db = db
    try {
      const staleId = Number(db.prepare("INSERT INTO notification_deliveries (channel_id, event, title, body, status, updated_at) VALUES (1, 'task_done', 't', 'b', 'processing', datetime('now', '-10 minutes'))").run().lastInsertRowid)
      const freshId = Number(db.prepare("INSERT INTO notification_deliveries (channel_id, event, title, body, status, updated_at) VALUES (1, 'task_done', 't', 'b', 'processing', datetime('now'))").run().lastInsertRowid)

      expect(NotificationService.recoverStuck(300)).toBe(1)
      expect((db.prepare('SELECT status, last_error FROM notification_deliveries WHERE id = ?').get(staleId) as any).status).toBe('pending')
      expect((db.prepare('SELECT status FROM notification_deliveries WHERE id = ?').get(freshId) as any).status).toBe('processing')
    } finally {
      db.close()
      dbHolder.db = null
    }
  })

  it('skips deliveries for disabled channels', async () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE notification_channels (
        id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, name TEXT NOT NULL,
        config_json TEXT NOT NULL DEFAULT '{}', enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE notification_deliveries (
        id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id INTEGER NOT NULL, event TEXT NOT NULL,
        title TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 3,
        next_run_at TEXT NOT NULL DEFAULT (datetime('now')), last_error TEXT,
        dedupe_key TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `)
    dbHolder.db = db
    try {
      const channelId = Number(db.prepare("INSERT INTO notification_channels (type, name, enabled) VALUES ('webhook', 'Disabled', 0)").run().lastInsertRowid)
      const deliveryId = Number(db.prepare("INSERT INTO notification_deliveries (channel_id, event, title, body, status, next_run_at) VALUES (?, 'task_done', 't', 'b', 'pending', datetime('now', '-1 seconds'))").run(channelId).lastInsertRowid)

      await NotificationService.processQueue()

      expect((db.prepare('SELECT status, last_error FROM notification_deliveries WHERE id = ?').get(deliveryId) as any)).toMatchObject({ status: 'skipped', last_error: '渠道已停用' })
    } finally {
      db.close()
      dbHolder.db = null
    }
  })

  it('filters events and deduplicates deliveries', async () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE config (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT DEFAULT (datetime('now')));
      CREATE TABLE notification_channels (
        id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, name TEXT NOT NULL,
        config_json TEXT NOT NULL DEFAULT '{}', enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE notification_deliveries (
        id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id INTEGER NOT NULL, event TEXT NOT NULL,
        title TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 3,
        next_run_at TEXT NOT NULL DEFAULT (datetime('now')), last_error TEXT,
        dedupe_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `)
    dbHolder.db = db
    const processQueue = vi.spyOn(NotificationService, 'processQueue').mockResolvedValue(undefined as any)
    try {
      db.prepare("INSERT INTO config (key, value) VALUES ('notificationEnabled', 'true')").run()
      db.prepare("INSERT INTO notification_channels (type, name, config_json) VALUES ('webhook', 'Errors', ?)").run(JSON.stringify({ url: 'http://127.0.0.1/hook', method: 'POST', events: ['task_error'] }))

      expect(await NotificationService.enqueue('task_done', 'Done', 'body')).toBe(0)
      expect(await NotificationService.enqueue('task_error', 'Error', 'body', { dedupeKey: 'event-1' })).toBe(1)
      expect(await NotificationService.enqueue('task_error', 'Error', 'body', { dedupeKey: 'event-1' })).toBe(0)
    } finally {
      processQueue.mockRestore()
      db.close()
      dbHolder.db = null
    }
  })
  it('signs webhook payloads with HMAC', async () => {
    const fetchMock = mockFetch()
    await sendChannel({
      id: 2,
      type: 'webhook',
      name: 'Webhook',
      enabled: true,
      config: { url: 'https://example.com/hook', method: 'POST', headers: { 'X-Test': '1' }, secret: 'secret', events: ['task_error'] }
    }, { event: 'task_error', title: '失败', body: '错误' })
    const [url, init] = fetchMock.mock.calls[0] as any
    expect(url).toBe('https://example.com/hook')
    expect(init.headers['X-Test']).toBe('1')
    expect(init.headers['X-SubX-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/)
  })

  it('sends ntfy with title and priority headers', async () => {
    const fetchMock = mockFetch(async (_url: string, init: any) => {
      new Headers(init.headers)
      return { ok: true, text: async () => '' }
    })
    await sendChannel({
      id: 3,
      type: 'ntfy',
      name: 'ntfy',
      enabled: true,
      config: { url: 'https://ntfy.sh', topic: 'subx', token: 'tk', priority: 5, events: ['watch_error'] }
    }, { event: 'watch_error', title: '监控异常', body: '目录不可读' })
    const [url, init] = fetchMock.mock.calls[0] as any
    expect(url).toBe('https://ntfy.sh/subx')
    expect(init.headers.Title).toBe('SubX')
    expect(init.headers.Priority).toBe('5')
    expect(init.headers.Authorization).toBe('Bearer tk')
    expect(init.body).toContain('监控异常')
  })
})

describe('additional notification channels', () => {
  it('sends Discord webhook content', async () => {
    const fetchMock = mockFetch()
    await sendChannel({
      id: 4, type: 'discord', name: 'Discord', enabled: true,
      config: { url: 'https://discord.com/api/webhooks/1/abc', events: ['task_done'] }
    }, { event: 'task_done', title: '完成', body: '字幕完成' })
    const [url, init] = fetchMock.mock.calls[0] as any
    expect(url).toBe('https://discord.com/api/webhooks/1/abc')
    expect(JSON.parse(init.body).content).toContain('字幕完成')
  })

  it('sends Matrix room messages', async () => {
    const fetchMock = mockFetch()
    await sendChannel({
      id: 5, type: 'matrix', name: 'Matrix', enabled: true,
      config: { homeserverUrl: 'https://matrix.example.com', roomId: '!room:example.com', accessToken: 'token', events: ['task_error'] }
    }, { event: 'task_error', title: '失败', body: '错误' })
    const [url, init] = fetchMock.mock.calls[0] as any
    expect(url).toContain('/_matrix/client/v3/rooms/!room%3Aexample.com/send/m.room.message/')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body).msgtype).toBe('m.text')
  })

  it('sends WeCom text messages', async () => {
    const fetchMock = mockFetch()
    await sendChannel({
      id: 6, type: 'wecom', name: 'WeCom', enabled: true,
      config: { url: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=abc', events: ['watch_error'] }
    }, { event: 'watch_error', title: '监控异常', body: '目录不可读' })
    const [url, init] = fetchMock.mock.calls[0] as any
    expect(url).toContain('qyapi.weixin.qq.com')
    expect(JSON.parse(init.body).msgtype).toBe('text')
  })
})
