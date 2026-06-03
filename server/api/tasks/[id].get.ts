import { TaskService } from '../../utils/task'
import { getMediaRoot } from '../../utils/mediaRoots'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') || event.context.params?.id
  if (!id) {
    throw createError({ statusCode: 400, message: 'Task ID is required' })
  }

  try {
    const task = TaskService.getTask(id)
    let rootName = '默认媒体库'
    try {
      const root = await getMediaRoot(task.rootId)
      rootName = root.name
    } catch {
      // ignore fallback
    }

    return {
      task: {
        ...task,
        rootName
      }
    }
  } catch {
    throw createError({ statusCode: 404, message: 'Task not found' })
  }
})
