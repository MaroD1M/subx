/**
 * Directory automation service.
 *
 * Combines chokidar events with a periodic scan, applies watch rules, claims
 * watch events atomically, creates tasks and reconciles their final state.
 * Both watch events and notification delivery use atomic claims so multiple
 * application workers do not process the same row twice.
 */

import chokidar, { type FSWatcher } from 'chokidar'
import { randomUUID } from 'crypto'
import { existsSync } from 'fs'
import { lstat, readdir, stat } from 'fs/promises'
import { dirname, join, relative } from 'path'
import type { WatchEvent, WatchFolder } from '../../types'
import { useDb } from './db'
import { ConfigService } from './config'
import { getMediaRoot, getMediaRoots } from './mediaRoots'
import { resolveInsideRoot } from './pathSafety'
import { TaskService, globalTaskQueue } from './task'
import { VideoService } from './video'
import { NotificationService } from './notifications'
import {
  DEFAULT_WATCH_OUTPUT_POLICY,
  sanitizeOutputPolicy,
  sanitizeWatchRules,
  evaluateWatchCandidate,
  isIgnoredRelativePath,
  normalizeRelativePath,
  type WatchCandidateResult
} from './watchRules'

const ACTIVE_TASK_STATUSES = ['queued', 'probing', 'extracting', 'extracting_audio', 'transcribing', 'ocr', 'parsing', 'translating', 'exporting']
const ACTIVE_EVENT_STATUSES = ['pending', 'queued', 'processing']

function parseJson<T>(value: unknown, fallback: T): T {
  try {
    return JSON.parse(String(value || '')) as T
  } catch {
    return fallback
  }
}

function rowToFolder(row: any, rootName = ''): WatchFolder {
  return {
    id: Number(row.id),
    rootId: String(row.root_id),
    rootName,
    path: String(row.path || ''),
    enabled: Number(row.enabled) === 1,
    recursive: Number(row.recursive) === 1,
    mode: ['new', 'backfill', 'both'].includes(String(row.mode)) ? String(row.mode) as WatchFolder['mode'] : 'new',
    rules: sanitizeWatchRules(parseJson(row.rules_json, {})),
    outputPolicy: sanitizeOutputPolicy(parseJson(row.output_policy_json, {})),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    pendingEvents: Number(row.pending_events || 0),
    failedEvents: Number(row.failed_events || 0)
  }
}

function rowToEvent(row: any, folderLabel = ''): WatchEvent {
  return {
    id: Number(row.id),
    folderId: Number(row.folder_id),
    folderName: folderLabel || String(row.folder_name || ''),
    path: String(row.path),
    size: Number(row.size || 0),
    mtime: row.mtime || '',
    status: String(row.status) as WatchEvent['status'],
    taskId: row.task_id || undefined,
    error: row.error || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

async function siblingNames(absoluteDir: string): Promise<string[]> {
  try {
    const entries = await readdir(absoluteDir, { withFileTypes: true })
    return entries.filter(entry => entry.isFile() && !entry.isSymbolicLink()).map(entry => entry.name)
  } catch {
    return []
  }
}

export const WatchService = {
  watchers: new Map<number, FSWatcher>(),
  started: false,
  pumping: false,
  periodicTimer: null as ReturnType<typeof setInterval> | null,
  notificationTimer: null as ReturnType<typeof setInterval> | null,

  async listFolders(): Promise<WatchFolder[]> {
    const db = useDb()
    const roots = await getMediaRoots()
    const rootNames = new Map(roots.map(root => [root.id, root.name]))
    const rows = db.prepare(`
      SELECT wf.*,
        (SELECT COUNT(*) FROM watch_events we WHERE we.folder_id = wf.id AND we.status IN ('pending', 'queued', 'processing')) AS pending_events,
        (SELECT COUNT(*) FROM watch_events we WHERE we.folder_id = wf.id AND we.status = 'failed') AS failed_events
      FROM watch_folders wf
      ORDER BY wf.id ASC
    `).all() as any[]
    return rows.map(row => rowToFolder(row, rootNames.get(String(row.root_id)) || String(row.root_id)))
  },

  async getFolder(id: number): Promise<WatchFolder | null> {
    const db = useDb()
    const row = db.prepare(`
      SELECT wf.*,
        (SELECT COUNT(*) FROM watch_events we WHERE we.folder_id = wf.id AND we.status IN ('pending', 'queued', 'processing')) AS pending_events,
        (SELECT COUNT(*) FROM watch_events we WHERE we.folder_id = wf.id AND we.status = 'failed') AS failed_events
      FROM watch_folders wf WHERE wf.id = ?
    `).get(id) as any
    if (!row) return null
    const roots = await getMediaRoots()
    return rowToFolder(row, roots.find(root => root.id === String(row.root_id))?.name || String(row.root_id))
  },

  async resolveFolderPath(rootId: string, folderPath: string): Promise<string> {
    const roots = await getMediaRoots()
    const root = roots.find(item => item.id === rootId)
    if (!root) throw new Error('媒体库不存在')
    const absolute = await resolveInsideRoot(root.path, folderPath || '.', { allowMissing: true })
    const info = await stat(absolute).catch(() => null)
    if (!info || !info.isDirectory()) throw new Error('监控目录不存在或不是目录')
    return absolute
  },

  async createFolder(input: any): Promise<WatchFolder> {
    const rootId = String(input?.rootId || '')
    if (!rootId) throw new Error('请选择媒体库')
    const folderPath = normalizeRelativePath(String(input?.path || ''))
    const absolute = await this.resolveFolderPath(rootId, folderPath)
    if (!existsSync(absolute)) throw new Error('监控目录不存在')
    const rules = sanitizeWatchRules(input?.rules)
    const policy = sanitizeOutputPolicy(input?.outputPolicy)
    const db = useDb()
    db.prepare(`
      INSERT INTO watch_folders (root_id, path, enabled, recursive, mode, rules_json, output_policy_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(root_id, path) DO UPDATE SET
        enabled=excluded.enabled, recursive=excluded.recursive, mode=excluded.mode,
        rules_json=excluded.rules_json, output_policy_json=excluded.output_policy_json, updated_at=datetime('now')
    `).run(
      rootId,
      folderPath,
      input?.enabled !== false ? 1 : 0,
      input?.recursive !== false ? 1 : 0,
      ['new', 'backfill', 'both'].includes(String(input?.mode)) ? String(input.mode) : 'new',
      JSON.stringify(rules),
      JSON.stringify(policy)
    )
    const row = db.prepare('SELECT id FROM watch_folders WHERE root_id = ? AND path = ?').get(rootId, folderPath) as { id?: number } | undefined
    const folder = row?.id ? await this.getFolder(Number(row.id)) : null
    if (!folder) throw new Error('保存监控目录失败')
    await this.restartWatcher(folder.id)
    return folder
  },

  async updateFolder(id: number, input: any): Promise<WatchFolder> {
    const current = await this.getFolder(id)
    if (!current) throw new Error('监控目录不存在')
    const rootId = String(input?.rootId ?? current.rootId)
    const folderPath = normalizeRelativePath(String(input?.path ?? current.path))
    await this.resolveFolderPath(rootId, folderPath)
    const rules = input?.rules !== undefined ? sanitizeWatchRules(input.rules) : current.rules
    const policy = input?.outputPolicy !== undefined ? sanitizeOutputPolicy(input.outputPolicy) : current.outputPolicy
    const db = useDb()
    db.prepare(`
      UPDATE watch_folders
      SET root_id = ?, path = ?, enabled = ?, recursive = ?, mode = ?, rules_json = ?, output_policy_json = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      rootId,
      folderPath,
      input?.enabled !== undefined ? (input.enabled ? 1 : 0) : (current.enabled ? 1 : 0),
      input?.recursive !== undefined ? (input.recursive ? 1 : 0) : (current.recursive ? 1 : 0),
      input?.mode && ['new', 'backfill', 'both'].includes(String(input.mode)) ? String(input.mode) : current.mode,
      JSON.stringify(rules),
      JSON.stringify(policy),
      id
    )
    await this.restartWatcher(id)
    return (await this.getFolder(id))!
  },

  async deleteFolder(id: number) {
    this.closeWatcher(id)
    const db = useDb()
    db.prepare('DELETE FROM watch_events WHERE folder_id = ?').run(id)
    return db.prepare('DELETE FROM watch_folders WHERE id = ?').run(id).changes > 0
  },

  async listEvents(options: { limit?: number, folderId?: number, status?: string } = {}) {
    const limit = Math.min(500, Math.max(1, Number(options.limit) || 100))
    const conditions: string[] = []
    const params: any[] = []
    if (options.folderId) { conditions.push('we.folder_id = ?'); params.push(Number(options.folderId)) }
    if (options.status) { conditions.push('we.status = ?'); params.push(String(options.status)) }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const rows = useDb().prepare(`
      SELECT we.*, wf.root_id, wf.path AS folder_path
      FROM watch_events we JOIN watch_folders wf ON wf.id = we.folder_id
      ${where}
      ORDER BY we.created_at DESC, we.id DESC
      LIMIT ?
    `).all(...params, limit) as any[]
    const roots = await getMediaRoots()
    const rootNames = new Map(roots.map(root => [root.id, root.name]))
    return rows.map(row => rowToEvent(row, `${rootNames.get(String(row.root_id)) || row.root_id}${row.folder_path ? ` / ${row.folder_path}` : ''}`))
  },

  listDeliveries(limit = 100) {
    const rows = useDb().prepare(`
      SELECT d.*, c.name AS channel_name, c.type AS channel_type
      FROM notification_deliveries d LEFT JOIN notification_channels c ON c.id = d.channel_id
      ORDER BY d.created_at DESC, d.id DESC LIMIT ?
    `).all(Math.min(500, Math.max(1, Number(limit) || 100))) as any[]
    return rows.map(row => ({
      id: Number(row.id),
      channelId: Number(row.channel_id),
      channelName: row.channel_name || '已删除渠道',
      channelType: row.channel_type || '',
      event: row.event,
      title: row.title,
      body: row.body,
      status: row.status,
      attempts: Number(row.attempts || 0),
      maxAttempts: Number(row.max_attempts || 3),
      lastError: row.last_error || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }))
  },

  async start() {
    if (this.started) return
    this.started = true
    const folders = await this.listFolders()
    for (const folder of folders) {
      if (folder.enabled && folder.mode !== 'backfill') await this.restartWatcher(folder.id)
    }
    this.reconcileEvents()
    const recoveredNotifications = NotificationService.recoverStuck()
    if (recoveredNotifications > 0) console.warn(`[Notification] Recovered ${recoveredNotifications} stuck deliveries`)
    this.periodicTimer = setInterval(() => { void this.scanPeriodic() }, 60_000)
    this.notificationTimer = setInterval(() => { void NotificationService.processQueue() }, 15_000)
    void NotificationService.processQueue()
    void this.pump()
  },

  closeWatcher(folderId: number) {
    const watcher = this.watchers.get(folderId)
    if (watcher) {
      void watcher.close()
      this.watchers.delete(folderId)
    }
  },

  async restartWatcher(folderId: number) {
    this.closeWatcher(folderId)
    const folder = await this.getFolder(folderId)
    if (!folder || !folder.enabled || folder.mode === 'backfill') return
    const root = await getMediaRoot(folder.rootId)
    const absolute = await resolveInsideRoot(root.path, folder.path || '.', { allowMissing: false })
    const stableSeconds = Number.isFinite(Number(folder.rules.stableSeconds)) ? Number(folder.rules.stableSeconds) : 15
    const watcher = chokidar.watch(absolute, {
      ignoreInitial: true,
      persistent: true,
      depth: folder.recursive ? undefined : 0,
      awaitWriteFinish: {
        stabilityThreshold: Math.max(1000, Math.min(24 * 60 * 60 * 1000, stableSeconds * 1000)),
        pollInterval: 1000
      }
    })
    console.log(`[Watch] 启动监控目录 #${folder.id}: ${absolute} (recursive=${folder.recursive})`)
    watcher.on('add', (path) => {
      console.log(`[Watch] 检测到新文件 #${folder.id}: ${path}`)
      void this.handleFile(folder.id, path, 'watch')
    })
    watcher.on('error', (error) => {
      console.error(`[Watch] 监控目录异常 ${folder.id}:`, error)
      void NotificationService.notifyWatchError(folder.id, root.name, folder.path || '/', String((error as any)?.message || error))
    })
    this.watchers.set(folder.id, watcher)
  },

  async handleFile(folderId: number, absolutePath: string, source: 'watch' | 'poll' | 'backfill') {
    const folder = await this.getFolder(folderId)
    if (!folder || !folder.enabled) return false
    const root = await getMediaRoot(folder.rootId)
    const rel = normalizeRelativePath(relative(root.path, absolutePath))
    if (!rel || rel.startsWith('..') || isIgnoredRelativePath(rel)) return false
    const info = await lstat(absolutePath).catch(() => null)
    if (!info || !info.isFile() || info.isSymbolicLink()) return false
    const parentDir = dirname(absolutePath)
    const siblings = [
      ...await siblingNames(parentDir),
      ...(await siblingNames(join(parentDir, 'SubX'))).map(name => `SubX/${name}`)
    ]
    console.log(`[Watch] 处理候选文件 #${folderId} (${source}): ${rel}`)
    const evaluation = evaluateWatchCandidate({
      relativePath: rel,
      size: info.size,
      mtimeMs: info.mtimeMs,
      createdMs: info.birthtimeMs || info.ctimeMs,
      siblingNames: siblings,
      rules: folder.rules,
      policy: folder.outputPolicy
    })
    if (!evaluation.accepted) {
      console.log(`[Watch] 跳过 #${folderId}: ${rel} -> ${evaluation.reason}`)
      if (evaluation.reason === '文件尚未稳定' && source === 'watch') {
        setTimeout(() => { void this.handleFile(folderId, absolutePath, 'poll') }, Math.max(1000, folder.rules.stableSeconds * 1000))
        return false
      }
      if (source !== 'poll' && !['忽略的路径或临时文件', '扩展名不在监控范围'].includes(evaluation.reason || '')) {
        this.insertEvent(folder, rel, info, evaluation, 'skipped', evaluation.reason)
      }
      return false
    }
    if (folder.rules.minDurationSec > 0) {
      try {
        const media = await VideoService.probeMedia(rel, folder.rootId)
        if (media.duration > 0 && media.duration < folder.rules.minDurationSec) {
          this.insertEvent(folder, rel, info, evaluation, 'skipped', '视频时长低于下限')
          return false
        }
      } catch (e: any) {
        this.insertEvent(folder, rel, info, evaluation, 'skipped', `无法读取视频时长：${e?.message || e}`)
        return false
      }
    }
    const inserted = this.insertEvent(folder, rel, info, evaluation, 'pending')
    if (inserted) void this.pump()
    return inserted
  },

  insertEvent(folder: WatchFolder, relativePath: string, info: { size: number, mtimeMs: number }, evaluation: WatchCandidateResult, status: WatchEvent['status'], error?: string) {
    const db = useDb()
    const active = db.prepare(`
      SELECT id FROM watch_events WHERE folder_id = ? AND path = ? AND status IN ('pending','queued','processing') LIMIT 1
    `).get(folder.id, relativePath)
    if (active) return false
    const infoRow = db.prepare(`
      INSERT OR IGNORE INTO watch_events (folder_id, path, size, mtime, status, error, dedupe_key)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(folder.id, relativePath, info.size, new Date(info.mtimeMs).toISOString(), status, error || null, evaluation.dedupeKey)
    return infoRow.changes > 0
  },

  async pump() {
    if (this.pumping) return
    this.pumping = true
    try {
      const db = useDb()
      const config = await ConfigService.getConfig()
      const limit = Math.max(1, Math.min(10, Number(config.automationConcurrency) || 1))
      let active = Number((db.prepare(`
        SELECT COUNT(*) AS count FROM tasks WHERE origin = 'automation' AND status IN (${ACTIVE_TASK_STATUSES.map(() => '?').join(',')})
      `).get(...ACTIVE_TASK_STATUSES) as { count?: number } | undefined)?.count || 0)

      while (active < limit) {
        const candidate = db.prepare("SELECT id FROM watch_events WHERE status = 'pending' ORDER BY created_at ASC, id ASC LIMIT 1").get() as { id?: number } | undefined
        if (!candidate?.id) break
        const claimed = db.prepare("UPDATE watch_events SET status='processing', updated_at=datetime('now') WHERE id = ? AND status='pending'").run(candidate.id)
        if (claimed.changes === 0) continue
        const row = db.prepare("SELECT * FROM watch_events WHERE id = ?").get(candidate.id) as any
        const folder = await this.getFolder(Number(row.folder_id))
        if (!folder || !folder.enabled) {
          db.prepare("UPDATE watch_events SET status='skipped', task_id=NULL, error='监控目录已停用', updated_at=datetime('now') WHERE id = ?").run(row.id)
          continue
        }
        const policy = { ...DEFAULT_WATCH_OUTPUT_POLICY, ...folder.outputPolicy }
        const taskId = randomUUID()
        db.prepare("UPDATE watch_events SET task_id=?, error=NULL, updated_at=datetime('now') WHERE id = ?").run(taskId, row.id)
        try {
          await TaskService.createTask({
            taskId,
            filePath: String(row.path),
            rootId: folder.rootId,
            sourceType: policy.sourceType,
            trackIndex: 0,
            model: policy.model || config.defaultModel,
            targetLanguage: policy.targetLanguage || config.targetLanguage,
            outputMode: policy.outputMode,
            stylePreset: policy.stylePreset,
            stylePrompt: '',
            translationMode: config.translationMode || 'non_stream',
            subtitleFormat: policy.subtitleFormat,
            subtitleStylePreset: policy.subtitleStylePreset,
            bilingualLayout: policy.bilingualLayout,
            origin: 'automation',
            watchEventId: Number(row.id)
          })
          await globalTaskQueue.add(taskId, { apiKey: config.apiKey, baseUrl: config.apiBaseUrl })
          active++
        } catch (e: any) {
          const message = String(e?.message || e)
          db.prepare("UPDATE watch_events SET status='failed', task_id=NULL, error=?, updated_at=datetime('now') WHERE id = ?").run(message, row.id)
          void NotificationService.notifyWatchError(folder.id, folder.rootName || folder.rootId, String(row.path), message)
        }
      }
    } catch (e) {
      console.error('[Watch] 自动任务调度失败:', e)
    } finally {
      this.pumping = false
    }
  },

  finishTask(taskId: string, status: 'done' | 'error' | 'cancelled') {
    const db = useDb()
    const task = db.prepare('SELECT error FROM tasks WHERE task_id = ?').get(taskId) as { error?: string } | undefined
    db.prepare(`
      UPDATE watch_events SET status=?, error=?, updated_at=datetime('now')
      WHERE task_id = ? AND status IN ('queued','processing')
    `).run(status === 'done' ? 'done' : 'failed', status === 'done' ? null : (task?.error || (status === 'cancelled' ? '任务已取消' : '任务失败')), taskId)
    void this.pump()
  },

  reconcileEvents() {
    const db = useDb()
    const rows = db.prepare(`
      SELECT we.id, we.task_id, t.status AS task_status, t.error
      FROM watch_events we LEFT JOIN tasks t ON t.task_id = we.task_id
      WHERE we.status IN ('queued','processing')
    `).all() as any[]
    for (const row of rows) {
      if (!row.task_id || !row.task_status) {
        db.prepare("UPDATE watch_events SET status='pending', task_id=NULL, updated_at=datetime('now') WHERE id = ?").run(row.id)
      } else if (row.task_status === 'done' || row.task_status === 'review') {
        db.prepare("UPDATE watch_events SET status='done', error=NULL, updated_at=datetime('now') WHERE id = ?").run(row.id)
      } else if (['error', 'cancelled'].includes(String(row.task_status))) {
        db.prepare("UPDATE watch_events SET status='failed', error=?, updated_at=datetime('now') WHERE id = ?").run(row.error || String(row.task_status), row.id)
      }
    }
  },

  async retryEvent(id: number) {
    const db = useDb()
    const row = db.prepare('SELECT * FROM watch_events WHERE id = ?').get(id) as any
    if (!row) throw new Error('监控事件不存在')
    if (ACTIVE_EVENT_STATUSES.includes(String(row.status))) throw new Error('事件仍在排队或处理中')
    db.prepare("UPDATE watch_events SET status='pending', task_id=NULL, error=NULL, updated_at=datetime('now') WHERE id = ?").run(id)
    void this.pump()
    return true
  },

  async backfill(folderId: number, options: { start?: string, end?: string, path?: string, limit?: number } = {}) {
    const folder = await this.getFolder(folderId)
    if (!folder) throw new Error('监控目录不存在')
    const root = await getMediaRoot(folder.rootId)
    const start = options.start ? Date.parse(options.start) : null
    const end = options.end ? Date.parse(options.end) : null
    if (options.start && start === null) throw new Error('开始时间不合法')
    if (options.end && end === null) throw new Error('结束时间不合法')
    const limit = Math.min(5000, Math.max(1, Number(options.limit) || 500))
    const basePath = await resolveInsideRoot(root.path, options.path || folder.path || '.', { allowMissing: false })
    let scanned = 0
    let queued = 0
    const maxFiles = limit

    const walk = async (dir: string) => {
      if (queued >= maxFiles) return
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
      for (const entry of entries) {
        if (queued >= maxFiles) break
        if (entry.name.startsWith('.') || entry.name === 'SubX' || entry.name === '@eaDir' || entry.name === '#recycle') continue
        const full = join(dir, entry.name)
        if (entry.isSymbolicLink()) continue
        if (entry.isDirectory()) {
          if (folder.recursive) await walk(full)
          continue
        }
        if (!entry.isFile()) continue
        const rel = normalizeRelativePath(relative(root.path, full))
        if (isIgnoredRelativePath(rel)) continue
        const info = await lstat(full).catch(() => null)
        if (!info) continue
        if (start !== null && info.mtimeMs < start) continue
        if (end !== null && info.mtimeMs > end) continue
        scanned++
        const inserted = await this.handleFile(folderId, full, 'backfill')
        if (inserted) queued++
      }
    }

    await walk(basePath)
    void this.pump()
    void NotificationService.notifyBackfillDone(folder.id, folder.rootName || folder.rootId, queued, scanned)
    return { scanned, queued }
  },

  async scanPeriodic() {
    const folders = await this.listFolders()
    const cutoff = Date.now() - 10 * 60 * 1000
    for (const folder of folders) {
      if (!folder.enabled || folder.mode === 'backfill') continue
      const root = await getMediaRoot(folder.rootId)
      const base = await resolveInsideRoot(root.path, folder.path || '.', { allowMissing: true }).catch(() => '')
      if (!base) continue
      const walk = async (dir: string) => {
        const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'SubX' || entry.name === '@eaDir' || entry.name === '#recycle') continue
          const full = join(dir, entry.name)
          if (entry.isSymbolicLink()) continue
          if (entry.isDirectory()) {
            if (folder.recursive) await walk(full)
            continue
          }
          if (!entry.isFile()) continue
          const info = await lstat(full).catch(() => null)
          if (!info || info.mtimeMs < cutoff) continue
          await this.handleFile(folder.id, full, 'poll')
        }
      }
      await walk(base).catch(error => {
        void NotificationService.notifyWatchError(folder.id, folder.rootName || folder.rootId, folder.path || '/', String(error?.message || error))
      })
    }
  },

  stats() {
    return {
      started: this.started,
      watchers: this.watchers.size
    }
  }
}
