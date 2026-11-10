import { apiError } from '../../utils/apiError'
import { useDb } from '../../utils/db'
import { taskEvents } from '../../utils/task'

export default defineEventHandler((event) => {
    const { taskId } = getQuery(event) as { taskId: string }

    if (!taskId) {
        throw apiError(400, 'TaskId is required')
    }

    const { res } = event.node
    const db = useDb()

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    })

    let closed = false
    let keepAliveTimer: ReturnType<typeof setInterval> | null = null

    function cleanup() {
        if (closed) return
        closed = true
        taskEvents.off('progress', onProgress)
        taskEvents.off('done', onDone)
        taskEvents.off('error', onError)
        taskEvents.off('cancelled', onCancelled)
        if (keepAliveTimer) clearInterval(keepAliveTimer)
        try { res.end() } catch { /* ignore closed stream */ }
    }

    function write(eventName: string, data: any) {
        if (closed) return
        res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    function writeInitialSnapshot() {
        try {
            const row = db.prepare(`
                SELECT status, progress, step_progress, step_message, done_chunks, total_chunks, error,
                       started_at, step_started_at, finished_at, paused_at, paused_total_ms
                FROM tasks WHERE task_id = ?
            `).get(taskId) as any
            if (!row) return
            write('progress', {
                taskId,
                step: row.status,
                progress: Number(row.progress || 0),
                stepProgress: Number(row.step_progress || 0),
                stepMessage: row.step_message || '',
                completedChunks: Number(row.done_chunks || 0),
                totalChunks: Number(row.total_chunks || 0),
                error: row.error || null,
                startedAt: row.started_at || null,
                stepStartedAt: row.step_started_at || null,
                finishedAt: row.finished_at || null,
                pausedAt: row.paused_at || null,
                pausedTotalMs: Number(row.paused_total_ms || 0),
                snapshot: true
            })
        } catch { /* keep the stream alive */ }
    }

    function onProgress(data: any) {
        if (data.taskId === taskId) write('progress', data)
    }

    function onDone(data: any) {
        if (data.taskId !== taskId) return
        write('done', data)
        cleanup()
    }

    function onError(data: any) {
        if (data.taskId !== taskId) return
        write('task-error', data)
        cleanup()
    }

    function onCancelled(data: any) {
        if (data.taskId !== taskId) return
        write('cancelled', data)
        cleanup()
    }

    taskEvents.on('progress', onProgress)
    taskEvents.on('done', onDone)
    taskEvents.on('error', onError)
    taskEvents.on('cancelled', onCancelled)

    writeInitialSnapshot()
    keepAliveTimer = setInterval(() => {
        if (!closed) res.write(`: keepalive\n\n`)
    }, 15000)

    res.on('close', cleanup)
    event.node.req.on('aborted', cleanup)
})
