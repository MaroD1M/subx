import { apiError } from '../../../utils/apiError'
import { useDb } from '../../../utils/db'
import { mergeChunkResults } from '../../../utils/asr/chunked'
import type { AsrResult, AsrSegment } from '../../../utils/asr/types'
import { toUtcIsoString } from '~~/shared/time'

function mapSegment(segment: AsrSegment) {
  return {
    id: segment.id,
    startMs: Math.round(Number(segment.start || 0) * 1000),
    endMs: Math.round(Number(segment.end || 0) * 1000),
    text: segment.text,
    confidence: segment.confidence,
    noSpeechProb: segment.noSpeechProb,
    speaker: segment.speaker
  }
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw apiError(400, 'Task ID is required')
  }

  const db = useDb()
  const task = db.prepare('SELECT status, source_type, asr_checkpoint_key, pause_requested_at FROM tasks WHERE task_id = ?').get(id) as {
    status?: string
    source_type?: string
    asr_checkpoint_key?: string | null
    pause_requested_at?: string | null
  } | undefined

  const run = db.prepare(`
    SELECT id, task_id, engine, model, device, language, duration_ms, rtf, confidence, created_at
    FROM transcription_runs
    WHERE task_id = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(id) as any

  if (run) {
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
        createdAt: toUtcIsoString(run.created_at)
      },
      segments: segments.map(segment => ({
        id: segment.id,
        startMs: segment.start_ms,
        endMs: segment.end_ms,
        text: segment.text,
        confidence: segment.confidence,
        noSpeechProb: segment.no_speech_prob,
        speaker: segment.speaker
      })),
      partial: null
    }
  }

  const checkpointKey = String(task?.asr_checkpoint_key || '')
  if (!checkpointKey) {
    return { run: null, segments: [], partial: null }
  }

  const rows = db.prepare(`
    SELECT chunk_index, start_ms, end_ms, language, confidence, engine, model, segments_json, updated_at
    FROM asr_checkpoints
    WHERE checkpoint_key = ? AND status = 'done'
    ORDER BY chunk_index ASC
  `).all(checkpointKey) as any[]

  const results: Array<{ plan: { index: number, startMs: number, endMs: number }, result: AsrResult, reused: boolean }> = []
  for (const row of rows) {
    let segments: AsrSegment[] = []
    try {
      const parsed = JSON.parse(String(row.segments_json || '[]'))
      if (Array.isArray(parsed)) segments = parsed
    } catch { /* ignore malformed checkpoint */ }
    results.push({
      plan: {
        index: Number(row.chunk_index || 0),
        startMs: Number(row.start_ms || 0),
        endMs: Number(row.end_ms || 0)
      },
      reused: true,
      result: {
        task: 'transcribe',
        engine: String(row.engine || ''),
        model: String(row.model || ''),
        language: String(row.language || 'unknown'),
        duration: Math.max(0, (Number(row.end_ms || 0) - Number(row.start_ms || 0)) / 1000),
        text: '',
        segments
      }
    })
  }

  const merged = rows.length ? mergeChunkResults(results) : null
  const partialSegments = (merged?.segments || []).slice(0, 500).map(mapSegment)
  const status = String(task?.status || '')
  const active = ['extracting_audio', 'transcribing'].includes(status)
  const updatedAt = rows.length > 0 ? toUtcIsoString(rows[rows.length - 1]?.updated_at) : ''

  return {
    run: null,
    segments: partialSegments,
    partial: {
      active,
      status,
      checkpointKey,
      doneChunks: rows.length,
      totalSegments: merged?.segments.length || 0,
      segments: partialSegments,
      updatedAt,
      pauseRequested: Boolean(task?.pause_requested_at),
      pauseRequestedAt: task?.pause_requested_at ? toUtcIsoString(task.pause_requested_at) : null
    }
  }
})
