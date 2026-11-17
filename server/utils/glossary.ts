import type { H3Event } from 'h3'
import { useDb } from './db'
import { ConfigService } from './config'
import { parseCsv, stringifyCsv } from './glossaryCsv'
import { toUtcIsoString } from '~~/shared/time'

export type GlossaryScopeType = 'global' | 'series'
export type GlossaryImportStrategy = 'skip' | 'overwrite'

export interface GlossaryEntry {
  id: number
  source: string
  target: string
  sourceLang: string
  targetLang: string
  scopeType: GlossaryScopeType
  scopeKey: string
  category: string
  notes: string
  priority: number
  enabled: boolean
  locked: boolean
  version: number
  createdBy: string
  updatedBy: string
  createdAt?: string
  updatedAt?: string
}

export interface GlossaryEntryInput {
  source?: unknown
  target?: unknown
  sourceLang?: unknown
  targetLang?: unknown
  scopeType?: unknown
  scopeKey?: unknown
  category?: unknown
  notes?: unknown
  priority?: unknown
  enabled?: unknown
  locked?: unknown
}

export interface GlossaryListOptions {
  scopeType?: string
  scopeKey?: string
  q?: string
  sourceLang?: string
  targetLang?: string
  enabled?: boolean
  page?: number
  pageSize?: number
}

export interface GlossaryImportRow {
  source: string
  target: string
  sourceLang: string
  targetLang: string
  category: string
  notes: string
  priority: number
  enabled: boolean
}

export interface GlossaryImportPreview {
  total: number
  inserted: number
  updated: number
  skipped: number
  errors: string[]
  rows: Array<GlossaryImportRow & { action: 'insert' | 'update' | 'skip', reason?: string }>
}

const MAX_SOURCE_LENGTH = 200
const MAX_TARGET_LENGTH = 2000
const MAX_LANGUAGE_LENGTH = 35
const MAX_CATEGORY_LENGTH = 80
const MAX_NOTES_LENGTH = 2000

function clampText(value: unknown, max: number): string {
  return String(value ?? '').trim().slice(0, max)
}

function normalizeScopeType(value: unknown): GlossaryScopeType {
  return String(value || '') === 'series' ? 'series' : 'global'
}

function normalizeScopeKey(scopeType: GlossaryScopeType, value: unknown): string {
  return scopeType === 'series' ? clampText(value, 500) : ''
}

function normalizeLanguage(value: unknown): string {
  const text = clampText(value, MAX_LANGUAGE_LENGTH)
  return /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(text) ? text : ''
}

function normalizeBoolean(value: unknown, fallback = true): boolean {
  if (value === undefined || value === null || value === '') return fallback
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

function normalizeInput(input: GlossaryEntryInput): GlossaryEntryInput & { source: string, target: string, sourceLang: string, targetLang: string, scopeType: GlossaryScopeType, scopeKey: string, category: string, notes: string, priority: number, enabled: boolean, locked: boolean } {
  const source = clampText(input.source, MAX_SOURCE_LENGTH)
  const target = clampText(input.target, MAX_TARGET_LENGTH)
  const scopeType = normalizeScopeType(input.scopeType)
  const priorityValue = Number(input.priority)
  return {
    source,
    target,
    sourceLang: normalizeLanguage(input.sourceLang),
    targetLang: normalizeLanguage(input.targetLang),
    scopeType,
    scopeKey: normalizeScopeKey(scopeType, input.scopeKey),
    category: clampText(input.category, MAX_CATEGORY_LENGTH),
    notes: clampText(input.notes, MAX_NOTES_LENGTH),
    priority: Number.isFinite(priorityValue) ? Math.max(-1000, Math.min(1000, Math.floor(priorityValue))) : 0,
    enabled: normalizeBoolean(input.enabled, true),
    locked: normalizeBoolean(input.locked, false)
  }
}

function mapEntry(row: any): GlossaryEntry {
  return {
    id: Number(row.id),
    source: String(row.source || ''),
    target: String(row.target || ''),
    sourceLang: String(row.source_lang || ''),
    targetLang: String(row.target_lang || ''),
    scopeType: normalizeScopeType(row.scope_type),
    scopeKey: String(row.scope_key || ''),
    category: String(row.category || ''),
    notes: String(row.notes || ''),
    priority: Number(row.priority || 0),
    enabled: Number(row.enabled ?? 1) === 1,
    locked: Number(row.locked || 0) === 1,
    version: Number(row.version || 1),
    createdBy: String(row.created_by || ''),
    updatedBy: String(row.updated_by || ''),
    createdAt: row.created_at ? toUtcIsoString(row.created_at) : undefined,
    updatedAt: row.updated_at ? toUtcIsoString(row.updated_at) : undefined
  }
}

function findExisting(db: any, input: ReturnType<typeof normalizeInput>): any {
  return db.prepare(`
    SELECT * FROM glossary_entries
    WHERE scope_type = ? AND scope_key = ? AND source_lang = ? AND target_lang = ? AND source = ?
  `).get(input.scopeType, input.scopeKey, input.sourceLang, input.targetLang, input.source)
}

function recordVersion(db: any, entryId: number | null, version: number, action: string, before: unknown, after: unknown, actor = '', batchId = '') {
  db.prepare(`
    INSERT INTO glossary_versions (entry_id, version, action, before_json, after_json, batch_id, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(entryId, version, action, JSON.stringify(before ?? null), JSON.stringify(after ?? null), batchId || null, actor || '')
}

function enabledMap(rows: any[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const row of rows) {
    if (Number(row.enabled ?? 1) === 1) result[String(row.source || '')] = String(row.target || '')
  }
  return result
}

function syncLegacyGlossary() {
  try {
    const db = useDb()
    const rows = db.prepare("SELECT source, target, enabled FROM glossary_entries WHERE scope_type = 'global' AND source_lang = '' AND target_lang = '' ORDER BY priority ASC, updated_at ASC").all() as any[]
    void ConfigService.updateConfig('glossary', enabledMap(rows)).catch(error => console.warn('[Glossary] Failed to sync legacy glossary:', error?.message || error))
  } catch { /* compatibility mirror is best effort */ }
}

function syncLegacySeries(scopeKey: string) {
  try {
    const db = useDb()
    const rows = db.prepare("SELECT source, target, enabled FROM glossary_entries WHERE scope_type = 'series' AND scope_key = ? AND source_lang = '' AND target_lang = '' ORDER BY priority ASC, updated_at ASC").all(scopeKey) as any[]
    db.prepare("UPDATE series_profiles SET glossary_json = ?, updated_at = datetime('now') WHERE series_key = ?")
      .run(JSON.stringify(enabledMap(rows)), scopeKey)
  } catch { /* compatibility mirror is best effort */ }
}

function applyRow(db: any, input: ReturnType<typeof normalizeInput>, actor: string): { action: 'insert' | 'update', entry: GlossaryEntry } {
  const existing = findExisting(db, input)
  const before = existing ? mapEntry(existing) : null
  if (existing) {
    const unchanged = String(existing.target || '') === input.target
      && String(existing.category || '') === input.category
      && String(existing.notes || '') === input.notes
      && Number(existing.priority || 0) === input.priority
      && Number(existing.enabled ?? 1) === (input.enabled ? 1 : 0)
      && Number(existing.locked || 0) === (input.locked ? 1 : 0)
    if (unchanged) return { action: 'update', entry: before as GlossaryEntry }
    const nextVersion = Number(existing.version || 1) + 1
    db.prepare(`
      UPDATE glossary_entries
      SET target = ?, category = ?, notes = ?, priority = ?, enabled = ?, locked = ?,
          version = ?, updated_by = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(input.target, input.category, input.notes, input.priority, input.enabled ? 1 : 0, input.locked ? 1 : 0, nextVersion, actor, existing.id)
    const after = mapEntry(db.prepare('SELECT * FROM glossary_entries WHERE id = ?').get(existing.id))
    recordVersion(db, Number(existing.id), nextVersion, 'update', before, after, actor)
    return { action: 'update', entry: after }
  }
  const info = db.prepare(`
    INSERT INTO glossary_entries (
      source, target, source_lang, target_lang, scope_type, scope_key, category, notes, priority, enabled, locked, version, created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, datetime('now'), datetime('now'))
  `).run(input.source, input.target, input.sourceLang, input.targetLang, input.scopeType, input.scopeKey, input.category, input.notes, input.priority, input.enabled ? 1 : 0, input.locked ? 1 : 0, actor, actor)
  const entry = mapEntry(db.prepare('SELECT * FROM glossary_entries WHERE id = ?').get(info.lastInsertRowid))
  recordVersion(db, entry.id, 1, 'create', null, entry, actor)
  return { action: 'insert', entry }
}

export function parseGlossaryImport(content: string, format: string): GlossaryImportRow[] {
  const normalizedFormat = String(format || 'csv').toLowerCase()
  let objects: any[] = []
  if (normalizedFormat === 'json') {
    const parsed = JSON.parse(String(content || '{}'))
    objects = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.entries) ? parsed.entries : [])
  } else {
    const rows = parseCsv(content)
    if (!rows.length) return []
    const header = rows[0]!.map(cell => String(cell).trim().toLowerCase())
    const indexOf = (...names: string[]) => header.findIndex(cell => names.includes(cell))
    const sourceIndex = indexOf('source', '原文', '源文')
    const targetIndex = indexOf('target', '译文', '目标译文')
    const hasHeader = sourceIndex >= 0 && targetIndex >= 0
    const columns = {
      source: hasHeader ? sourceIndex : 0,
      target: hasHeader ? targetIndex : 1,
      sourceLang: hasHeader ? indexOf('source_lang', 'sourcelang', '源语言') : 2,
      targetLang: hasHeader ? indexOf('target_lang', 'targetlang', '目标语言') : 3,
      category: hasHeader ? indexOf('category', '分类') : 4,
      notes: hasHeader ? indexOf('notes', 'note', '备注') : 5,
      priority: hasHeader ? indexOf('priority', '优先级') : 6,
      enabled: hasHeader ? indexOf('enabled', '启用') : 7
    }
    objects = rows.slice(hasHeader ? 1 : 0).map(row => ({
      source: row[columns.source],
      target: row[columns.target],
      sourceLang: columns.sourceLang >= 0 ? row[columns.sourceLang] : '',
      targetLang: columns.targetLang >= 0 ? row[columns.targetLang] : '',
      category: columns.category >= 0 ? row[columns.category] : '',
      notes: columns.notes >= 0 ? row[columns.notes] : '',
      priority: columns.priority >= 0 ? row[columns.priority] : 0,
      enabled: columns.enabled >= 0 ? row[columns.enabled] : true
    }))
  }
  return objects.map(item => {
    const normalized = normalizeInput(item)
    return {
      source: normalized.source,
      target: normalized.target,
      sourceLang: normalized.sourceLang,
      targetLang: normalized.targetLang,
      category: normalized.category,
      notes: normalized.notes,
      priority: normalized.priority,
      enabled: normalized.enabled
    }
  })
}

export const GlossaryService = {
  list(options: GlossaryListOptions = {}) {
    const db = useDb()
    const conditions: string[] = []
    const params: any[] = []
    const scopeType = options.scopeType ? normalizeScopeType(options.scopeType) : ''
    if (scopeType) {
      conditions.push('scope_type = ?')
      params.push(scopeType)
    }
    if (options.scopeKey !== undefined && options.scopeKey !== '') {
      conditions.push('scope_key = ?')
      params.push(String(options.scopeKey))
    }
    if (options.q) {
      conditions.push('(source LIKE ? OR target LIKE ?)')
      const like = `%${String(options.q).trim()}%`
      params.push(like, like)
    }
    if (options.sourceLang) {
      conditions.push('source_lang = ?')
      params.push(normalizeLanguage(options.sourceLang))
    }
    if (options.targetLang) {
      conditions.push('target_lang = ?')
      params.push(normalizeLanguage(options.targetLang))
    }
    if (options.enabled !== undefined) {
      conditions.push('enabled = ?')
      params.push(options.enabled ? 1 : 0)
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const pageSize = Math.min(500, Math.max(1, Math.floor(Number(options.pageSize) || 50)))
    const page = Math.max(1, Math.floor(Number(options.page) || 1))
    const offset = (page - 1) * pageSize
    const totalRow = db.prepare(`SELECT COUNT(*) AS count FROM glossary_entries ${where}`).get(...params) as { count?: number } | undefined
    const rows = db.prepare(`
      SELECT * FROM glossary_entries
      ${where}
      ORDER BY scope_type ASC, scope_key ASC, priority DESC, source ASC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset) as any[]
    return { entries: rows.map(mapEntry), total: Number(totalRow?.count || 0), page, pageSize }
  },

  get(id: number): GlossaryEntry | null {
    const row = useDb().prepare('SELECT * FROM glossary_entries WHERE id = ?').get(id) as any
    return row ? mapEntry(row) : null
  },

  create(input: GlossaryEntryInput, actor = ''): GlossaryEntry {
    const normalized = normalizeInput(input)
    if (!normalized.source || !normalized.target) throw new Error('原文和译文不能为空')
    if (normalized.scopeType === 'series' && !normalized.scopeKey) throw new Error('系列术语必须填写系列 Key')
    const db = useDb()
    db.exec('BEGIN')
    try {
      const result = applyRow(db, normalized, actor)
      db.exec('COMMIT')
      if (normalized.scopeType === 'global') syncLegacyGlossary()
      else if (normalized.scopeKey) syncLegacySeries(normalized.scopeKey)
      return result.entry
    } catch (error) {
      try { db.exec('ROLLBACK') } catch { /* ignore */ }
      throw error
    }
  },

  update(id: number, input: GlossaryEntryInput, actor = ''): GlossaryEntry | null {
    const existing = this.get(id)
    if (!existing) return null
    if (existing.locked && normalizeBoolean(input.locked, existing.locked)) {
      throw new Error('该术语已锁定，请先解锁再修改')
    }
    const normalized = normalizeInput({
      ...existing,
      ...input,
      source: input.source === undefined ? existing.source : input.source,
      target: input.target === undefined ? existing.target : input.target,
      sourceLang: input.sourceLang === undefined ? existing.sourceLang : input.sourceLang,
      targetLang: input.targetLang === undefined ? existing.targetLang : input.targetLang,
      scopeType: input.scopeType === undefined ? existing.scopeType : input.scopeType,
      scopeKey: input.scopeKey === undefined ? existing.scopeKey : input.scopeKey
    })
    if (!normalized.source || !normalized.target) throw new Error('原文和译文不能为空')
    if (normalized.scopeType === 'series' && !normalized.scopeKey) throw new Error('系列术语必须填写系列 Key')
    const db = useDb()
    const conflict = findExisting(db, normalized)
    if (conflict && Number(conflict.id) !== id) throw new Error('相同作用域和语言对下已存在该原文术语')
    db.exec('BEGIN')
    try {
      const nextVersion = Number(existing.version || 1) + 1
      db.prepare(`
        UPDATE glossary_entries
        SET source = ?, target = ?, source_lang = ?, target_lang = ?, scope_type = ?, scope_key = ?,
            category = ?, notes = ?, priority = ?, enabled = ?, locked = ?, version = ?,
            updated_by = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        normalized.source, normalized.target, normalized.sourceLang, normalized.targetLang,
        normalized.scopeType, normalized.scopeKey, normalized.category, normalized.notes,
        normalized.priority, normalized.enabled ? 1 : 0, normalized.locked ? 1 : 0,
        nextVersion, actor, id
      )
      const after = mapEntry(db.prepare('SELECT * FROM glossary_entries WHERE id = ?').get(id))
      recordVersion(db, id, nextVersion, 'update', existing, after, actor)
      db.exec('COMMIT')
      if (existing.scopeType === 'global' || normalized.scopeType === 'global') syncLegacyGlossary()
      if (existing.scopeType === 'series' && existing.scopeKey) syncLegacySeries(existing.scopeKey)
      if (normalized.scopeType === 'series' && normalized.scopeKey && normalized.scopeKey !== existing.scopeKey) syncLegacySeries(normalized.scopeKey)
      return after
    } catch (error) {
      try { db.exec('ROLLBACK') } catch { /* ignore */ }
      throw error
    }
  },

  delete(id: number, actor = ''): boolean {
    const existing = this.get(id)
    if (!existing) return false
    if (existing.locked) throw new Error('该术语已锁定，请先解锁再删除')
    const db = useDb()
    db.exec('BEGIN')
    try {
      db.prepare('DELETE FROM glossary_entries WHERE id = ?').run(id)
      recordVersion(db, id, existing.version, 'delete', existing, null, actor)
      db.exec('COMMIT')
      if (existing.scopeType === 'global') syncLegacyGlossary()
      else if (existing.scopeKey) syncLegacySeries(existing.scopeKey)
      return true
    } catch (error) {
      try { db.exec('ROLLBACK') } catch { /* ignore */ }
      throw error
    }
  },

  replaceScopeFromMap(scopeType: GlossaryScopeType, scopeKey: string, map: Record<string, string>, options: { deleteMissing?: boolean, actor?: string, syncLegacy?: boolean } = {}) {
    const db = useDb()
    const normalizedScope = normalizeScopeType(scopeType)
    const normalizedKey = normalizeScopeKey(normalizedScope, scopeKey)
    const entries = Object.entries(map || {})
      .map(([source, target]) => normalizeInput({ source, target, scopeType: normalizedScope, scopeKey: normalizedKey }))
      .filter(entry => entry.source && entry.target)
    if (!entries.length && options.deleteMissing === false) return
    db.exec('BEGIN')
    try {
      const existing = db.prepare("SELECT source FROM glossary_entries WHERE scope_type = ? AND scope_key = ? AND source_lang = '' AND target_lang = ''").all(normalizedScope, normalizedKey) as Array<{ source?: string }>
      const wanted = new Set(entries.map(entry => entry.source))
      if (options.deleteMissing !== false) {
        for (const row of existing) {
          if (!wanted.has(String(row.source || ''))) {
            db.prepare("DELETE FROM glossary_entries WHERE scope_type = ? AND scope_key = ? AND source_lang = '' AND target_lang = '' AND source = ?").run(normalizedScope, normalizedKey, String(row.source || ''))
          }
        }
      }
      for (const entry of entries) applyRow(db, entry, options.actor || 'legacy-sync')
      db.exec('COMMIT')
    } catch (error) {
      try { db.exec('ROLLBACK') } catch { /* ignore */ }
      throw error
    }
    if (options.syncLegacy !== false) {
      if (normalizedScope === 'global') syncLegacyGlossary()
      else if (normalizedKey) syncLegacySeries(normalizedKey)
    }
  },

  previewImport(content: string, format: string, scopeType: GlossaryScopeType, scopeKey: string): GlossaryImportPreview {
    const db = useDb()
    const normalizedScope = normalizeScopeType(scopeType)
    const normalizedKey = normalizeScopeKey(normalizedScope, scopeKey)
    const parsed = parseGlossaryImport(content, format)
    const preview: GlossaryImportPreview = { total: parsed.length, inserted: 0, updated: 0, skipped: 0, errors: [], rows: [] }
    for (const row of parsed) {
      const normalized = normalizeInput({ ...row, scopeType: normalizedScope, scopeKey: normalizedKey })
      if (!normalized.source || !normalized.target) {
        preview.skipped += 1
        preview.errors.push(`跳过空原文/译文：${row.source || '(空)'}`)
        preview.rows.push({ ...row, action: 'skip', reason: '原文或译文为空' })
        continue
      }
      const existing = findExisting(db, normalized)
      const action = existing ? 'update' : 'insert'
      if (action === 'insert') preview.inserted += 1
      else preview.updated += 1
      preview.rows.push({ ...row, action })
    }
    return preview
  },

  importEntries(content: string, format: string, scopeType: GlossaryScopeType, scopeKey: string, strategy: GlossaryImportStrategy = 'skip', options: { dryRun?: boolean, filename?: string, actor?: string } = {}) {
    const preview = this.previewImport(content, format, scopeType, scopeKey)
    if (options.dryRun) return preview
    const db = useDb()
    const normalizedScope = normalizeScopeType(scopeType)
    const normalizedKey = normalizeScopeKey(normalizedScope, scopeKey)
    const actor = options.actor || ''
    let inserted = 0
    let updated = 0
    let skipped = 0
    db.exec('BEGIN')
    try {
      for (const row of preview.rows) {
        if (row.action === 'skip') { skipped += 1; continue }
        const normalized = normalizeInput({ ...row, scopeType: normalizedScope, scopeKey: normalizedKey })
        const existing = findExisting(db, normalized)
        if (existing && strategy === 'skip') { skipped += 1; continue }
        const result = applyRow(db, normalized, actor)
        if (result.action === 'insert') inserted += 1
        else updated += 1
      }
      db.prepare(`
        INSERT INTO glossary_imports (filename, format, scope_type, scope_key, total, inserted, updated, skipped, errors_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(String(options.filename || ''), String(format || 'csv'), normalizedScope, normalizedKey, preview.total, inserted, updated, skipped, JSON.stringify(preview.errors))
      db.exec('COMMIT')
    } catch (error) {
      try { db.exec('ROLLBACK') } catch { /* ignore */ }
      throw error
    }
    if (normalizedScope === 'global') syncLegacyGlossary()
    else if (normalizedKey) syncLegacySeries(normalizedKey)
    return { ...preview, inserted, updated, skipped }
  },

  exportEntries(options: GlossaryListOptions & { format?: string } = {}) {
    const format = String(options.format || 'csv').toLowerCase() === 'json' ? 'json' : 'csv'
    const exported: GlossaryEntry[] = []
    for (let page = 1; page <= 200; page++) {
      const result = this.list({ ...options, page, pageSize: 500 })
      exported.push(...result.entries)
      if (!result.entries.length || exported.length >= result.total) break
    }
    if (format === 'json') {
      return {
        content: JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), entries: exported }, null, 2),
        contentType: 'application/json; charset=utf-8',
        filename: `subx-glossary-${new Date().toISOString().slice(0, 10)}.json`
      }
    }
    const rows: unknown[][] = [[
      'source', 'target', 'source_lang', 'target_lang', 'scope_type', 'scope_key',
      'category', 'notes', 'priority', 'enabled'
    ]]
    for (const entry of exported) {
      rows.push([
        entry.source, entry.target, entry.sourceLang, entry.targetLang, entry.scopeType, entry.scopeKey,
        entry.category, entry.notes, entry.priority, entry.enabled ? 1 : 0
      ])
    }
    return {
      content: `\uFEFF${stringifyCsv(rows)}`,
      contentType: 'text/csv; charset=utf-8',
      filename: `subx-glossary-${new Date().toISOString().slice(0, 10)}.csv`
    }
  },

  resolve(seriesKey: string, options: { configGlossary?: Record<string, string> | null, targetLanguage?: string } = {}): Record<string, string> {
    const result: Record<string, string> = { ...(options.configGlossary || {}) }
    try {
      const db = useDb()
      const targetLanguage = String(options.targetLanguage || '').trim()
      const languageClause = targetLanguage ? "AND (target_lang = '' OR target_lang = ?)" : ''
      const params = targetLanguage ? [targetLanguage] : []
      const globalRows = db.prepare(`
        SELECT source, target, enabled FROM glossary_entries
        WHERE scope_type = 'global' AND enabled = 1 ${languageClause}
        ORDER BY priority ASC, updated_at ASC
      `).all(...params) as any[]
      Object.assign(result, enabledMap(globalRows))
      if (seriesKey) {
        const seriesRows = db.prepare(`
          SELECT source, target, enabled FROM glossary_entries
          WHERE scope_type = 'series' AND scope_key = ? AND enabled = 1 ${languageClause}
          ORDER BY priority ASC, updated_at ASC
        `).all(seriesKey, ...params) as any[]
        Object.assign(result, enabledMap(seriesRows))
      }
    } catch { /* fall back to legacy config glossary */ }
    return result
  },

  versions(entryId?: number, limit = 100) {
    const db = useDb()
    const safeLimit = Math.min(500, Math.max(1, Number.isFinite(Number(limit)) ? Math.floor(Number(limit)) : 100))
    const rows = entryId
      ? db.prepare('SELECT * FROM glossary_versions WHERE entry_id = ? ORDER BY created_at DESC, id DESC LIMIT ?').all(entryId, safeLimit) as any[]
      : db.prepare('SELECT * FROM glossary_versions ORDER BY created_at DESC, id DESC LIMIT ?').all(safeLimit) as any[]
    return rows.map(row => ({
      id: Number(row.id),
      entryId: row.entry_id == null ? null : Number(row.entry_id),
      version: Number(row.version || 1),
      action: String(row.action || ''),
      before: safeParse(row.before_json),
      after: safeParse(row.after_json),
      batchId: row.batch_id ? String(row.batch_id) : null,
      createdBy: String(row.created_by || ''),
      createdAt: row.created_at ? toUtcIsoString(row.created_at) : undefined
    }))
  },

  snapshots(limit = 50) {
    const safeLimit = Math.min(200, Math.max(1, Number.isFinite(Number(limit)) ? Math.floor(Number(limit)) : 50))
    const rows = useDb().prepare('SELECT id, name, scope_type, scope_key, entry_count, note, created_by, created_at FROM glossary_snapshots ORDER BY created_at DESC, id DESC LIMIT ?').all(safeLimit) as any[]
    return rows.map(row => ({
      id: Number(row.id),
      name: String(row.name || ''),
      scopeType: normalizeScopeType(row.scope_type),
      scopeKey: String(row.scope_key || ''),
      entryCount: Number(row.entry_count || 0),
      note: String(row.note || ''),
      createdBy: String(row.created_by || ''),
      createdAt: row.created_at ? toUtcIsoString(row.created_at) : undefined
    }))
  },

  createSnapshot(input: { name?: string, scopeType?: string, scopeKey?: string, note?: string }, actor = '') {
    const scopeType = normalizeScopeType(input.scopeType)
    const scopeKey = normalizeScopeKey(scopeType, input.scopeKey)
    const db = useDb()
    const rows = db.prepare('SELECT * FROM glossary_entries WHERE scope_type = ? AND scope_key = ? ORDER BY source ASC').all(scopeType, scopeKey) as any[]
    const entries = rows.map(mapEntry)
    const info = db.prepare(`
      INSERT INTO glossary_snapshots (name, scope_type, scope_key, entries_json, entry_count, note, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(clampText(input.name, 160) || `快照 ${new Date().toISOString()}`, scopeType, scopeKey, JSON.stringify(entries), entries.length, clampText(input.note, 2000), actor)
    return Number(info.lastInsertRowid)
  },

  deleteSnapshot(id: number): boolean {
    return useDb().prepare('DELETE FROM glossary_snapshots WHERE id = ?').run(id).changes > 0
  },

  rollbackSnapshot(id: number, actor = ''): boolean {
    const db = useDb()
    const row = db.prepare('SELECT * FROM glossary_snapshots WHERE id = ?').get(id) as any
    if (!row) return false
    const scopeType = normalizeScopeType(row.scope_type)
    const scopeKey = String(row.scope_key || '')
    let entries: any[] = []
    try { entries = JSON.parse(String(row.entries_json || '[]')) } catch { entries = [] }
    db.exec('BEGIN')
    try {
      db.prepare('DELETE FROM glossary_entries WHERE scope_type = ? AND scope_key = ?').run(scopeType, scopeKey)
      for (const entry of entries) {
        const normalized = normalizeInput({ ...entry, scopeType, scopeKey })
        if (!normalized.source || !normalized.target) continue
        applyRow(db, normalized, actor)
      }
      recordVersion(db, null, Number(row.entry_count || 0), 'rollback', null, { snapshotId: id, scopeType, scopeKey }, actor)
      db.exec('COMMIT')
    } catch (error) {
      try { db.exec('ROLLBACK') } catch { /* ignore */ }
      throw error
    }
    if (scopeType === 'global') syncLegacyGlossary()
    else if (scopeKey) syncLegacySeries(scopeKey)
    return true
  }
}

function safeParse(value: unknown) {
  try { return JSON.parse(String(value ?? 'null')) } catch { return null }
}

export function glossaryActor(event: H3Event): string {
  const auth = event.context.auth as { name?: string, type?: string } | undefined
  return auth?.name || auth?.type || ''
}
