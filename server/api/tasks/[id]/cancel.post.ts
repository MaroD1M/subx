import { apiError } from '../../../utils/apiError'
import { TaskService, globalTaskQueue } from '../../../utils/task'

export default defineEventHandler(async (event) => {
    const taskId = getRouterParam(event, 'id')

    if (!taskId) {
        throw apiError(400, 'Task ID is required')
    }

    try {
        const task = TaskService.getTask(taskId)

        if (task.status === 'done' || task.status === 'error' || task.status === 'cancelled') {
            return { success: false, message: '任务已结束，无法取消' }
        }

        const removedFromQueue = globalTaskQueue.cancel(taskId)

        await TaskService.updateStatus(taskId, 'cancelled', task.progress, {
            error: '用户取消任务',
            stepMessage: '任务已取消',
            log: removedFromQueue ? '任务已被用户手动取消，并已从等待队列移除' : '任务已被用户手动取消，正在停止后台执行',
            level: 'warn'
        })

        return { success: true, removedFromQueue, status: 'cancelled' }
    } catch (e: any) {
        if (e?.statusCode) throw e
        throw apiError(500, e.message || '取消任务失败')
    }
})
