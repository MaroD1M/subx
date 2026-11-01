import { ConfigService } from '../utils/config'
import { globalTaskQueue, taskEvents } from '../utils/task'
import { WatchService } from '../utils/watchService'
import { NotificationService } from '../utils/notifications'
import { IntegrationService } from '../utils/integrations'

let automationListenersRegistered = false

function registerAutomationListeners() {
  if (automationListenersRegistered) return
  automationListenersRegistered = true
  taskEvents.on('done', ({ taskId }: { taskId: string }) => {
    WatchService.finishTask(taskId, 'done')
    IntegrationService.finishTask(taskId, 'done')
    void NotificationService.notifyTaskEvent(taskId, 'task_done')
    void NotificationService.notifyTaskEvent(taskId, 'low_confidence')
  })
  taskEvents.on('error', ({ taskId }: { taskId: string }) => {
    WatchService.finishTask(taskId, 'error')
    IntegrationService.finishTask(taskId, 'error')
    void NotificationService.notifyTaskEvent(taskId, 'task_error')
  })
  taskEvents.on('cancelled', ({ taskId }: { taskId: string }) => {
    WatchService.finishTask(taskId, 'cancelled')
    IntegrationService.finishTask(taskId, 'cancelled')
    void NotificationService.notifyTaskEvent(taskId, 'task_cancelled')
  })
}

export default defineNitroPlugin(async () => {
  try {
    await globalTaskQueue.recoverInterrupted()
    await ConfigService.cleanupLogs()
    registerAutomationListeners()
    await WatchService.start()
  } catch (e) {
    console.error('[Reconcile] Failed to recover interrupted tasks:', e)
  }
})
