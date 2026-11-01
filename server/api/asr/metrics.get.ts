import { useDb } from '../../utils/db'

export default defineEventHandler(() => {
  const db = useDb()
  const summary = db.prepare(`
    SELECT
      COUNT(*) AS runs,
      COALESCE(SUM(duration_ms), 0) AS audio_ms,
      COALESCE(AVG(NULLIF(rtf, 0)), 0) AS avg_rtf,
      COALESCE(AVG(NULLIF(confidence, 0)), 0) AS avg_confidence,
      COALESCE(SUM(CASE WHEN confidence > 0 AND confidence < 0.6 THEN 1 ELSE 0 END), 0) AS low_confidence_runs
    FROM transcription_runs
  `).get() as any
  const engines = db.prepare(`
    SELECT COALESCE(NULLIF(engine, ''), 'unknown') AS engine, COUNT(*) AS runs,
      COALESCE(AVG(NULLIF(rtf, 0)), 0) AS avg_rtf,
      COALESCE(AVG(NULLIF(confidence, 0)), 0) AS avg_confidence
    FROM transcription_runs
    GROUP BY COALESCE(NULLIF(engine, ''), 'unknown')
    ORDER BY runs DESC
  `).all() as any[]
  const recent = db.prepare(`
    SELECT tr.id, tr.task_id, tr.engine, tr.model, tr.device, tr.language, tr.duration_ms, tr.rtf, tr.confidence, tr.created_at,
      t.file_path
    FROM transcription_runs tr LEFT JOIN tasks t ON t.task_id = tr.task_id
    ORDER BY tr.id DESC LIMIT 20
  `).all() as any[]

  return {
    summary: {
      runs: Number(summary?.runs || 0),
      audioHours: Number(summary?.audio_ms || 0) / 3600000,
      avgRtf: Number(summary?.avg_rtf || 0),
      avgConfidence: Number(summary?.avg_confidence || 0),
      lowConfidenceRuns: Number(summary?.low_confidence_runs || 0)
    },
    engines: engines.map(row => ({
      engine: row.engine,
      runs: Number(row.runs || 0),
      avgRtf: Number(row.avg_rtf || 0),
      avgConfidence: Number(row.avg_confidence || 0)
    })),
    recent: recent.map(row => ({
      id: Number(row.id),
      taskId: row.task_id,
      filePath: row.file_path || '',
      engine: row.engine || '',
      model: row.model || '',
      device: row.device || '',
      language: row.language || '',
      durationMs: Number(row.duration_ms || 0),
      rtf: Number(row.rtf || 0),
      confidence: Number(row.confidence || 0),
      createdAt: row.created_at
    }))
  }
})
