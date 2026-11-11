import { createHash } from 'crypto'
import { readdir, stat } from 'fs/promises'
import { join, resolve } from 'path'
import type { SubtitleEntry, TranslationMemoryStats } from '../../types'
import { useDb } from './db'
import { getMediaRoot } from './mediaRoots'
import { SubtitleService } from './subtitle'

function normalizeSource(value: string) {
  return String(value || '')
    .replace(/__SUBX_FMT_\d+__/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function sourceHash(targetLanguage: string, sourceText: string) {
  return createHash('sha256').update(`${targetLanguage}\u0000${normalizeSource(sourceText)}`).digest('hex')
}

function cjkCount(value: string) {
  return (String(value || '').match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) || []).length
}

function latinCount(value: string) {
  return (String(value || '').match(/[A-Za-z]{2,}/g) || []).length
}

export interface TranslationMemoryPair {
  sourceText: string
  translatedText: string
}

export const TranslationMemoryService = {
  hash(targetLanguage: string, sourceText: string) {
    return sourceHash(targetLanguage, sourceText)
  },

  lookup(entries: SubtitleEntry[], targetLanguage: string, seriesKey = ''): Map<string, string> {
    const result = new Map<string, string>()
    const wanted = new Map<string, string>()
    for (const entry of entries) {
      const normalized = normalizeSource(entry.text)
      if (!normalized || normalized.length < 2) continue
      wanted.set(sourceHash(targetLanguage, normalized), String(entry.id))
    }
    if (!wanted.size) return result
    try {
      const db = useDb()
      const hashes = [...wanted.keys()]
      for (let offset = 0; offset < hashes.length; offset += 400) {
        const batch = hashes.slice(offset, offset + 400)
        const rows = db.prepare(`
          SELECT source_hash, translated_text, series_key, confidence, use_count
          FROM translation_memory
          WHERE target_language = ? AND source_hash IN (${batch.map(() => '?').join(',')})
            AND (series_key = '' OR series_key = ?)
          ORDER BY CASE WHEN series_key = ? THEN 0 ELSE 1 END, use_count DESC, confidence DESC, updated_at DESC
        `).all(targetLanguage, ...batch, seriesKey, seriesKey) as any[]
        for (const row of rows) {
          const id = wanted.get(String(row.source_hash))
          if (!id || result.has(id)) continue
          const rowSeries = String(row.series_key || '')
          if (rowSeries && rowSeries !== seriesKey) continue
          const translated = String(row.translated_text || '').trim()
          if (translated) result.set(id, translated)
        }
      }
    } catch (error: any) {
      console.warn('[Memory] Lookup failed:', error?.message || error)
    }
    return result
  },

  learnPairs(pairs: TranslationMemoryPair[], targetLanguage: string, options: { seriesKey?: string, sourceKind?: string, confidence?: number } = {}) {
    if (!pairs.length) return 0
    const db = useDb()
    const seriesKey = String(options.seriesKey || '')
    const confidence = Math.max(0, Math.min(1, Number(options.confidence ?? 0.9)))
    const sourceKind = String(options.sourceKind || 'review')
    const stmt = db.prepare(`
      INSERT INTO translation_memory (
        target_language, source_hash, source_text, translated_text, series_key, source_kind, confidence, use_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
      ON CONFLICT(target_language, source_hash, series_key) DO UPDATE SET
        translated_text=CASE WHEN excluded.confidence >= translation_memory.confidence THEN excluded.translated_text ELSE translation_memory.translated_text END,
        confidence=CASE WHEN excluded.confidence >= translation_memory.confidence THEN excluded.confidence ELSE translation_memory.confidence END,
        source_kind=CASE WHEN excluded.confidence >= translation_memory.confidence THEN excluded.source_kind ELSE translation_memory.source_kind END,
        use_count=translation_memory.use_count + 1,
        updated_at=datetime('now')
    `)
    let learned = 0
    db.exec('BEGIN')
    try {
      for (const pair of pairs) {
        const source = normalizeSource(pair.sourceText)
        const translated = String(pair.translatedText || '').trim()
        if (!source || source.length < 2 || !translated) continue
        if (SubtitleService.isLowValueText(source)) continue
        stmt.run(targetLanguage, sourceHash(targetLanguage, source), source, translated, seriesKey, sourceKind, confidence)
        learned += 1
      }
      db.exec('COMMIT')
    } catch (error) {
      try { db.exec('ROLLBACK') } catch { /* ignore rollback failure */ }
      throw error
    }
    return learned
  },

  learnFromReviewTask(taskId: string) {
    try {
      const db = useDb()
      const task = db.prepare('SELECT target_lang, series_key FROM tasks WHERE task_id = ?').get(taskId) as { target_lang?: string, series_key?: string } | undefined
      if (!task?.target_lang) return 0
      const rows = db.prepare(`
        SELECT original_text, final_text, translated_text
        FROM task_review_entries
        WHERE task_id = ? AND edited = 1
      `).all(taskId) as any[]
      return this.learnPairs(rows.map(row => ({
        sourceText: String(row.original_text || ''),
        translatedText: String(row.final_text || row.translated_text || '')
      })), String(task.target_lang), {
        seriesKey: String(task.series_key || ''),
        sourceKind: 'review',
        confidence: 0.98
      })
    } catch (error: any) {
      console.warn('[Memory] Failed to learn from review task:', error?.message || error)
      return 0
    }
  },

  async learnFromLibrary(rootId: string, targetLanguage: string, options: { limitFiles?: number, limitPairs?: number } = {}) {
    if (!/^zh/i.test(targetLanguage)) {
      return { scannedFiles: 0, learned: 0, skippedFiles: 0, message: '目前仅支持从双语字幕学习简体/繁体中文译法' }
    }
    const root = await getMediaRoot(rootId)
    const rootPath = resolve(root.path)
    const maxFiles = Math.max(1, Math.min(500, Number(options.limitFiles) || 200))
    const maxPairs = Math.max(1, Math.min(50000, Number(options.limitPairs) || 20000))
    let scannedFiles = 0
    let skippedFiles = 0
    let learned = 0
    const pairs: TranslationMemoryPair[] = []

    const walk = async (dir: string) => {
      if (scannedFiles >= maxFiles || pairs.length >= maxPairs) return
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
      for (const entry of entries) {
        if (scannedFiles >= maxFiles || pairs.length >= maxPairs) return
        if (entry.name.startsWith('.') || entry.name === 'SubX' || entry.name === '@eaDir' || entry.name === '#recycle') continue
        const full = join(dir, entry.name)
        const info = await stat(full).catch(() => null)
        if (!info || info.isSymbolicLink()) continue
        if (info.isDirectory()) {
          await walk(full)
          continue
        }
        if (!/\.(?:srt|ass|ssa|vtt)$/i.test(entry.name)) continue
        scannedFiles += 1
        try {
          const subs = await SubtitleService.parseSubtitle(full)
          for (const sub of subs) {
            const lines = String(sub.text || '').split('\n').map(line => line.trim()).filter(Boolean)
            if (lines.length < 2) continue
            const chinese = lines.filter(line => cjkCount(line) > 0)
            const foreign = lines.filter(line => cjkCount(line) === 0 && latinCount(line) > 0)
            if (!chinese.length || !foreign.length) continue
            for (let index = 0; index < Math.min(chinese.length, foreign.length); index += 1) {
              pairs.push({ sourceText: foreign[index]!, translatedText: chinese[index]! })
              if (pairs.length >= maxPairs) break
            }
          }
        } catch {
          skippedFiles += 1
        }
      }
    }

    await walk(rootPath)
    if (pairs.length) {
      learned = this.learnPairs(pairs, targetLanguage, { seriesKey: '', sourceKind: 'library', confidence: 0.8 })
    }
    return {
      scannedFiles,
      learned,
      skippedFiles,
      message: `扫描 ${scannedFiles} 个字幕文件，学习 ${learned} 条双语对照`
    }
  },

  stats(): TranslationMemoryStats {
    try {
      const db = useDb()
      const rows = db.prepare(`
        SELECT target_language, COUNT(*) AS entries, COALESCE(SUM(use_count), 0) AS uses, MAX(updated_at) AS updated_at
        FROM translation_memory GROUP BY target_language ORDER BY entries DESC
      `).all() as any[]
      let total = 0
      let lastUpdatedAt = ''
      const byLanguage = rows.map(row => {
        total += Number(row.entries || 0)
        if (String(row.updated_at || '') > lastUpdatedAt) lastUpdatedAt = String(row.updated_at || '')
        return {
          targetLanguage: String(row.target_language || ''),
          entries: Number(row.entries || 0),
          uses: Number(row.uses || 0)
        }
      })
      let topTerms: Array<{ sourceText: string, translatedText: string, uses: number }> = []
      try {
        const rows = db.prepare(`
          SELECT source_text, translated_text, use_count
          FROM translation_memory
          WHERE LENGTH(source_text) <= 40
            AND source_text NOT LIKE '% % % % %'
          ORDER BY use_count DESC, updated_at DESC
          LIMIT 12
        `).all() as any[]
        topTerms = rows.map(row => ({
          sourceText: String(row.source_text || ''),
          translatedText: String(row.translated_text || ''),
          uses: Number(row.use_count || 0)
        })).filter(item => item.sourceText && item.translatedText)
      } catch { /* optional term suggestions */ }
      return { total, byLanguage, topTerms, lastUpdatedAt: lastUpdatedAt || undefined }
    } catch {
      return { total: 0, byLanguage: [], topTerms: [] }
    }
  },

  clear(targetLanguage?: string) {
    const db = useDb()
    return targetLanguage
      ? db.prepare('DELETE FROM translation_memory WHERE target_language = ?').run(targetLanguage).changes
      : db.prepare('DELETE FROM translation_memory').run().changes
  }
}
