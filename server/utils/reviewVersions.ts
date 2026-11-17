import { createHash } from 'crypto'
import { useDb } from './db'
import { toUtcIsoString } from '~~/shared/time'

export interface ReviewVersionEntry {
  subtitleId: string
  startTime: string
  endTime: string
  originalText: string
  translatedText: string
  finalText: string
  reviewStatus: string
  reviewReasons: string[]
  asrConfidence: number | null
  qualityScore: number | null
  qualityIssues: string[]
  sortOrder: number
  selected: boolean
  edited: boolean
}

export interface ReviewVersionSettings {
  outputMode?: string
  subtitleFormat?: string
  subtitleStylePreset?: string
  subtitleStyleJson?: string
  bilingualLayout?: string
}

export interface ReviewVersionMeta {
  id: number
  taskId: string
  versionNo: number
  label: string
  kind: string
  source: string
  model: string
  providerType: string
  entryCount: number
  editedCount: number
  qualityAvg: number | null
  note: string
  createdBy: string
  createdAt?: string
}

export interface ReviewVersion extends ReviewVersionMeta {
  entries: ReviewVersionEntry[]
  settings: ReviewVersionSettings
}

const AUTO_KEEP = 20

function parseJson<T>(value: unknown, fallback: T): T {
  try { return JSON.parse(String(value ?? '')) as T } catch { return fallback }
}

function mapMeta(row: any): ReviewVersionMeta {
  return {
    id: Number(row.id),
    taskId: String(row.task_id || ''),
    versionNo: Number(row.version_no || 1),
    label: String(row.label || ''),
    kind: String(row.kind || 'manual'),
    source: String(row.source || 'system'),
    model: String(row.model || ''),
    providerType: String(row.provider_type || ''),
    entryCount: Number(row.entry_count || 0),
    editedCount: Number(row.edited_count || 0),
    qualityAvg: row.quality_avg == null ? null : Number(row.quality_avg),
    note: String(row.note || ''),
    createdBy: String(row.created_by || ''),
    createdAt: row.created_at ? toUtcIsoString(row.created_at) : undefined
  }
}

function readEntries(taskId: string): ReviewVersionEntry[] {
  const rows = useDb().prepare(`
    SELECT subtitle_id, start_time, end_time, original_text, translated_text, final_text,
           review_status, review_reasons, asr_confidence, quality_score, quality_issues,
           sort_order, selected, edited
    FROM task_review_entries
    WHERE task_id = ?
    ORDER BY sort_order ASC, CAST(subtitle_id AS INTEGER) ASC, id ASC
  `).all(taskId) as any[]
  return rows.map(row => ({
    subtitleId: String(row.subtitle_id),
    startTime: String(row.start_time || ''),
    endTime: String(row.end_time || ''),
    originalText: String(row.original_text || ''),
    translatedText: String(row.translated_text || ''),
    finalText: String(row.final_text || ''),
    reviewStatus: String(row.review_status || 'translated'),
    reviewReasons: parseJson<string[]>(row.review_reasons, []),
    asrConfidence: row.asr_confidence == null ? null : Number(row.asr_confidence),
    qualityScore: row.quality_score == null ? null : Number(row.quality_score),
    qualityIssues: parseJson<string[]>(row.quality_issues, []),
    sortOrder: Number(row.sort_order || 0),
    selected: Number(row.selected || 0) === 1,
    edited: Number(row.edited || 0) === 1
  }))
}

function readSettings(taskId: string): ReviewVersionSettings {
  const row = useDb().prepare('SELECT output_mode, subtitle_format, subtitle_style_preset, subtitle_style_json, bilingual_layout FROM tasks WHERE task_id = ?').get(taskId) as any
  return {
    outputMode: String(row?.output_mode || 'translated'),
    subtitleFormat: String(row?.subtitle_format || 'srt'),
    subtitleStylePreset: String(row?.subtitle_style_preset || 'bilingual_simple'),
    subtitleStyleJson: String(row?.subtitle_style_json || ''),
    bilingualLayout: String(row?.bilingual_layout || 'translated_first')
  }
}

function fingerprintOf(entries: ReviewVersionEntry[], settings: ReviewVersionSettings) {
  return createHash('sha256').update(JSON.stringify({ entries, settings })).digest('hex')
}

function trimAutoVersions(taskId: string) {
  try {
    const db = useDb()
    const rows = db.prepare(`
      SELECT id FROM task_review_versions
      WHERE task_id = ? AND kind <> 'manual'
      ORDER BY version_no DESC, id DESC
    `).all(taskId) as Array<{ id?: number }>
    const remove = rows.slice(AUTO_KEEP).map(row => Number(row.id)).filter(Boolean)
    for (const id of remove) db.prepare('DELETE FROM task_review_versions WHERE id = ?').run(id)
  } catch { /* retention is best effort */ }
}


function insertVersion(taskId: string, entries: ReviewVersionEntry[], settings: ReviewVersionSettings, options: {
  kind?: string
  label?: string
  source?: string
  model?: string
  providerType?: string
  note?: string
  createdBy?: string
  skipIfSame?: boolean
}): ReviewVersionMeta | null {
  if (!entries.length) return null
  const fingerprint = fingerprintOf(entries, settings)
  const db = useDb()
  if (options.skipIfSame) {
    const latest = db.prepare(`
      SELECT * FROM task_review_versions
      WHERE task_id = ?
      ORDER BY version_no DESC, id DESC
      LIMIT 1
    `).get(taskId) as any
    if (latest && String(latest.fingerprint || '') === fingerprint && String(latest.kind || '') === String(options.kind || 'manual')) {
      return mapMeta(latest)
    }
  }
  const editedCount = entries.filter(entry => entry.edited).length
  const scored = entries.filter(entry => typeof entry.qualityScore === 'number' && Number.isFinite(entry.qualityScore))
  const qualityAvg = scored.length ? scored.reduce((sum, entry) => sum + Number(entry.qualityScore), 0) / scored.length : null
  db.exec('BEGIN')
  try {
    const row = db.prepare('SELECT COALESCE(MAX(version_no), 0) AS version_no FROM task_review_versions WHERE task_id = ?').get(taskId) as { version_no?: number } | undefined
    const versionNo = Number(row?.version_no || 0) + 1
    const info = db.prepare(`
      INSERT INTO task_review_versions (
        task_id, version_no, label, kind, source, model, provider_type, fingerprint,
        settings_json, entries_json, entry_count, edited_count, quality_avg, note, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      taskId,
      versionNo,
      String(options.label || '').slice(0, 160),
      String(options.kind || 'manual'),
      String(options.source || 'system'),
      String(options.model || '').slice(0, 160),
      String(options.providerType || '').slice(0, 80),
      fingerprint,
      JSON.stringify(settings),
      JSON.stringify(entries),
      entries.length,
      editedCount,
      qualityAvg,
      String(options.note || '').slice(0, 2000),
      String(options.createdBy || '').slice(0, 120)
    )
    db.exec('COMMIT')
    trimAutoVersions(taskId)
    const saved = db.prepare('SELECT * FROM task_review_versions WHERE id = ?').get(info.lastInsertRowid) as any
    return mapMeta(saved)
  } catch (error) {
    try { db.exec('ROLLBACK') } catch { /* ignore */ }
    throw error
  }
}

export const ReviewVersionService = {
  list(taskId: string): ReviewVersionMeta[] {
    const rows = useDb().prepare(`
      SELECT id, task_id, version_no, label, kind, source, model, provider_type,
             entry_count, edited_count, quality_avg, note, created_by, created_at
      FROM task_review_versions
      WHERE task_id = ?
      ORDER BY version_no DESC, id DESC
    `).all(taskId) as any[]
    return rows.map(mapMeta)
  },

  get(taskId: string, versionId: number): ReviewVersion | null {
    const row = useDb().prepare('SELECT * FROM task_review_versions WHERE task_id = ? AND id = ?').get(taskId, versionId) as any
    if (!row) return null
    return {
      ...mapMeta(row),
      entries: parseJson<ReviewVersionEntry[]>(row.entries_json, []),
      settings: parseJson<ReviewVersionSettings>(row.settings_json, {})
    }
  },

  snapshot(taskId: string, options: {
    kind?: string
    label?: string
    source?: string
    model?: string
    providerType?: string
    settings?: ReviewVersionSettings
    note?: string
    createdBy?: string
    skipIfSame?: boolean
  } = {}): ReviewVersionMeta | null {
    return insertVersion(taskId, readEntries(taskId), options.settings || readSettings(taskId), options)
  },

  snapshotWithTranslations(taskId: string, translations: Array<{
    subtitleId: string
    translatedText: string
    finalText?: string
    reviewStatus?: string
    reviewReasons?: string[]
  }>, options: {
    kind?: string
    label?: string
    source?: string
    model?: string
    providerType?: string
    settings?: ReviewVersionSettings
    note?: string
    createdBy?: string
  } = {}): ReviewVersionMeta | null {
    const byId = new Map(translations.map(item => [String(item.subtitleId), item]))
    const entries = readEntries(taskId).map(entry => {
      const translated = byId.get(entry.subtitleId)
      if (!translated) return entry
      return {
        ...entry,
        translatedText: String(translated.translatedText || ''),
        finalText: String(translated.finalText || translated.translatedText || entry.originalText),
        reviewStatus: String(translated.reviewStatus || 'translated'),
        reviewReasons: translated.reviewReasons || [],
        qualityScore: null,
        qualityIssues: [],
        edited: false
      }
    })
    return insertVersion(taskId, entries, options.settings || readSettings(taskId), options)
  },

  apply(taskId: string, versionId: number, options: { createdBy?: string } = {}): { version: ReviewVersionMeta | null, applied: number } {
    const version = this.get(taskId, versionId)
    if (!version) throw new Error('版本不存在')
    if (!version.entries.length) throw new Error('版本没有字幕条目')
    const db = useDb()
    const settings = version.settings || {}
    db.exec('BEGIN')
    try {
      db.prepare('DELETE FROM task_review_entries WHERE task_id = ?').run(taskId)
      const stmt = db.prepare(`
        INSERT INTO task_review_entries (
          task_id, subtitle_id, start_time, end_time, original_text, translated_text, final_text,
          review_status, review_reasons, asr_confidence, quality_score, quality_issues,
          sort_order, selected, edited, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `)
      for (const entry of version.entries) {
        stmt.run(
          taskId,
          entry.subtitleId,
          entry.startTime,
          entry.endTime,
          entry.originalText,
          entry.translatedText,
          entry.finalText,
          entry.reviewStatus,
          JSON.stringify(entry.reviewReasons || []),
          entry.asrConfidence ?? null,
          entry.qualityScore ?? null,
          JSON.stringify(entry.qualityIssues || []),
          Number(entry.sortOrder || 0),
          entry.selected ? 1 : 0,
          entry.edited ? 1 : 0
        )
      }
      if (settings.outputMode || settings.subtitleFormat || settings.subtitleStylePreset || settings.subtitleStyleJson || settings.bilingualLayout) {
        db.prepare(`
          UPDATE tasks SET
            output_mode = COALESCE(?, output_mode),
            subtitle_format = COALESCE(?, subtitle_format),
            subtitle_style_preset = COALESCE(?, subtitle_style_preset),
            subtitle_style_json = COALESCE(?, subtitle_style_json),
            bilingual_layout = COALESCE(?, bilingual_layout),
            updated_at = datetime('now')
          WHERE task_id = ?
        `).run(
          settings.outputMode || null,
          settings.subtitleFormat || null,
          settings.subtitleStylePreset || null,
          settings.subtitleStyleJson || null,
          settings.bilingualLayout || null,
          taskId
        )
      }
      db.exec('COMMIT')
    } catch (error) {
      try { db.exec('ROLLBACK') } catch { /* ignore */ }
      throw error
    }

    const snapshot = this.snapshot(taskId, {
      kind: 'rollback',
      label: `回滚到 v${version.versionNo}${version.label ? ` · ${version.label}` : ''}`,
      source: 'system',
      model: version.model,
      providerType: version.providerType,
      settings,
      createdBy: options.createdBy || ''
    })
    return { version: snapshot, applied: version.entries.length }
  }
}
