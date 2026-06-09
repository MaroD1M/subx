import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dbState = new Map<string, { status: string, progress: number, error?: string | null, forceRetranslate?: number }>()
const emitted: Array<{ event: string, payload: any }> = []

const mockDb = {
  prepare(sql: string) {
    return {
      get(taskId: string) {
        if (sql.includes('SELECT status FROM tasks')) {
          const row = dbState.get(taskId)
          return row ? { status: row.status } : undefined
        }

        if (sql.includes('SELECT * FROM tasks')) {
          const row = dbState.get(taskId)
          if (!row) return undefined
          return {
            task_id: taskId,
            file_path: '/tmp/demo.srt',
            root_id: 'root-1',
            source_type: 'external',
            track_index: 0,
            model: 'gpt-test',
            target_lang: 'zh-CN',
            output_mode: 'translated',
            style_preset: 'default',
            translation_mode: 'non_stream',
            subtitle_format: 'srt',
            subtitle_style_preset: 'bilingual_simple',
            bilingual_layout: 'translated_first',
            force_retranslate: row.forceRetranslate ?? 0,
            total_chunks: 0,
            done_chunks: 0,
            created_at: '2025-01-01 00:00:00',
            updated_at: '2025-01-01 00:00:00',
            status: row.status,
            progress: row.progress,
            error: row.error ?? null
          }
        }

        return undefined
      },
      run(...args: any[]) {
        if (sql.includes('INSERT INTO tasks')) {
          const [taskId, filePath, rootId, sourceType, trackIndex, model, targetLang, outputMode, stylePreset, translationMode, subtitleFormat, subtitleStylePreset, bilingualLayout, forceRetranslate, status, progress] = args
          dbState.set(String(taskId), { status: String(status), progress: Number(progress), error: null, forceRetranslate: Number(forceRetranslate) })
          return { changes: 1 }
        }

        if (sql.includes('UPDATE tasks SET status = ?, progress = ?')) {
          const [status, progress, taskId] = args
          const current = dbState.get(taskId) ?? { status: 'queued', progress: 0, error: null }
          dbState.set(taskId, { ...current, status: String(status), progress: Number(progress) })
          return { changes: 1 }
        }

        if (sql.includes("UPDATE tasks SET status = 'cancelled'")) {
          const [error, taskId] = args
          const current = dbState.get(taskId) ?? { status: 'queued', progress: 0, error: null }
          dbState.set(taskId, { ...current, status: 'cancelled', error: String(error) })
          return { changes: 1 }
        }

        if (sql.includes('INSERT INTO task_logs')) {
          return { changes: 1 }
        }

        return { changes: 0 }
      },
      all() {
        return []
      }
    }
  }
}

vi.mock('../db', () => ({
  useDb: () => mockDb
}))

vi.mock('../config', () => ({
  ConfigService: {
    getConfig: vi.fn(async () => ({ concurrency: 3 })),
    cleanupLogsIfNeeded: vi.fn(async () => undefined)
  }
}))

vi.mock('../mediaRoots', () => ({
  getMediaRoot: vi.fn().mockResolvedValue({ path: '/tmp', name: 'Test Root' }),
  resolveMediaPath: vi.fn()
}))

vi.mock('../video', () => ({ VideoService: {} }))
vi.mock('../subtitle', () => ({ SubtitleService: {} }))
vi.mock('../translation', () => ({ TranslationService: {} }))
vi.mock('../taskError', () => ({ classifyTaskError: (message: string) => ({ summary: message }) }))
vi.mock('~~/shared/stylePresets', () => ({ STYLE_PRESETS: {} }))
vi.mock('~~/types', () => ({}))

let TaskService: typeof import('../task').TaskService
let globalTaskQueue: typeof import('../task').globalTaskQueue
let taskEvents: typeof import('../task').taskEvents

beforeEach(async () => {
  dbState.clear()
  emitted.length = 0
  vi.resetModules()
  const taskModule = await import('../task')
  TaskService = taskModule.TaskService
  globalTaskQueue = taskModule.globalTaskQueue
  taskEvents = taskModule.taskEvents
  taskEvents.removeAllListeners()
  taskEvents.on('progress', (payload) => emitted.push({ event: 'progress', payload }))
  taskEvents.on('done', (payload) => emitted.push({ event: 'done', payload }))
  taskEvents.on('error', (payload) => emitted.push({ event: 'error', payload }))
  taskEvents.on('cancelled', (payload) => emitted.push({ event: 'cancelled', payload }))
})

afterEach(() => {
  taskEvents?.removeAllListeners?.()
  vi.restoreAllMocks()
})

describe('Task cancellation guards', () => {
  it('does not overwrite cancelled tasks with later progress updates', async () => {
    dbState.set('task-cancelled', { status: 'cancelled', progress: 42, error: '用户取消任务' })

    await TaskService.updateStatus('task-cancelled', 'translating', 65, {
      log: '这条更新应被丢弃'
    })

    expect(dbState.get('task-cancelled')).toEqual({
      status: 'cancelled',
      progress: 42,
      error: '用户取消任务'
    })
    expect(emitted).toHaveLength(0)
  })

  it('emits cancelled as a terminal event', async () => {
    dbState.set('task-terminal', { status: 'queued', progress: 10, error: null })

    await TaskService.updateStatus('task-terminal', 'cancelled', 10, {
      log: '任务已被用户手动取消',
      level: 'warn'
    })

    expect(dbState.get('task-terminal')?.status).toBe('cancelled')
    expect(emitted.some(entry => entry.event === 'cancelled')).toBe(true)
    expect(emitted.at(-1)?.payload?.step).toBe('cancelled')
  })


  it('persists forceRetranslate for retried tasks', async () => {
    await TaskService.createTask({
      taskId: 'task-force-retranslate',
      filePath: '/tmp/demo.srt',
      rootId: 'root-1',
      sourceType: 'external',
      trackIndex: 0,
      model: 'gpt-test',
      targetLanguage: 'zh-CN',
      outputMode: 'translated',
      stylePreset: 'default',
      translationMode: 'non_stream',
      subtitleFormat: 'srt',
      subtitleStylePreset: 'bilingual_simple',
      bilingualLayout: 'translated_first',
      forceRetranslate: true
    })

    const task = TaskService.getTask('task-force-retranslate')
    expect(task.forceRetranslate).toBe(true)
    expect(dbState.get('task-force-retranslate')?.forceRetranslate).toBe(1)
  })



  it('keeps review as terminal-like status for later progress updates', async () => {
    dbState.set('task-review', { status: 'review', progress: 96, error: '待字幕核对' })

    await TaskService.updateStatus('task-review', 'done', 100, {
      log: '这条完成更新应被丢弃'
    })

    expect(dbState.get('task-review')).toEqual({
      status: 'review',
      progress: 96,
      error: '待字幕核对'
    })
  })

  it('skips queued tasks that were cancelled before execution starts', async () => {
    dbState.set('task-queued-cancelled', { status: 'queued', progress: 0, error: null })

    const processSpy = vi.spyOn(TaskService, 'process').mockResolvedValue(undefined)

    const promise = globalTaskQueue.add('task-queued-cancelled', { apiKey: 'k' })
    const removed = globalTaskQueue.cancel('task-queued-cancelled')
    await promise

    expect(removed).toBe(true)
    expect(processSpy).not.toHaveBeenCalled()
  })
})
