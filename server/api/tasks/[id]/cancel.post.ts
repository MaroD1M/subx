import { TaskService, globalTaskQueue } from '../../../utils/task'

export default defineEventHandler(async (event) => {
    const taskId = getRouterParam(event, 'id')

    if (!taskId) {
        throw createError({ statusCode: 400, message: 'Task ID is required' })
    }

    try {
        const task = TaskService.getTask(taskId)

        if (task.status === 'done' || task.status === 'error' || task.status === 'cancelled') {
            return { success: false, message: '任务已结束，无法取消' }
        }

        const removedFromQueue = globalTaskQueue.cancel(taskId)

        await TaskService.updateStatus(taskId, 'cancelled', task.progress, {
            log: removedFromQueue ? '任务已被用户手动取消，并已从等待队列移除' : '任务已被用户手动取消，正在停止后台执行',
            level: 'warn'
        })

        const db = useDb()
        db.prepare("UPDATE tasks SET status = 'cancelled', error = ?, updated_at = datetime('now') WHERE task_id = ?").run('用户取消任务', taskId)

        return { success: true, removedFromQueue, status: 'cancelled' }
    } catch (e: any) {
        throw createError({
            statusCode: 500,
            message: e.message || '取消任务失败'
        })
    }
})
