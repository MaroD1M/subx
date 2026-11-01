import { useDb } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Task ID is required' })
  }

  const db = useDb()
  const run = db.prepare(`
    SELECT id, task_id, engine, model, device, language, duration_ms, rtf, confidence, created_at
    FROM transcription_runs
    WHERE task_id = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(id) as any

  if (!run) {
    return { run: null, segments: [] }
  }

  const segments = db.prepare(`
    SELECT id, start_ms, end_ms, text, confidence, no_speech_prob, speaker
    FROM asr_segments
    WHERE run_id = ?
    ORDER BY start_ms ASC
    LIMIT 500
  `).all(run.id) as any[]

  return {
    run: {
      id: run.id,
      taskId: run.task_id,
      engine: run.engine,
      model: run.model,
      device: run.device,
      language: run.language,
      durationMs: run.duration_ms,
      rtf: run.rtf,
      confidence: run.confidence,
      createdAt: run.created_at
    },
    segments: segments.map(segment => ({
      id: segment.id,
      startMs: segment.start_ms,
      endMs: segment.end_ms,
      text: segment.text,
      confidence: segment.confidence,
      noSpeechProb: segment.no_speech_prob,
      speaker: segment.speaker
    }))
  }
})
