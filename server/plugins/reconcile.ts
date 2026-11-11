import { ConfigService } from '../utils/config'
import { globalTaskQueue, taskEvents } from '../utils/task'
import { WatchService } from '../utils/watchService'
import { NotificationService } from '../utils/notifications'
import { IntegrationService } from '../utils/integrations'
import { ReviewJobService } from '../utils/reviewJobs'
import { startAutoBackupScheduler } from '../utils/backup'
import { CoverageAutoFillService } from '../utils/coverageAutoFill'
import { updateCoverageIndexForTask } from '../utils/libraryCoverage'

let automationListenersRegistered = false
const RECOVERY_INTERVAL_MS = 5 * 60 * 1000
const globalState = globalThis as any

function registerAutomationListeners() {
  if (automationListenersRegistered) return
  automationListenersRegistered = true
  taskEvents.on('done', ({ taskId }: { taskId: string }) => {
    WatchService.finishTask(taskId, 'done')
    IntegrationService.finishTask(taskId, 'done')
    updateCoverageIndexForTask(taskId)
    void NotificationService.notifyTaskEvent(taskId, 'task_done')
    void NotificationService.notifyTaskEvent(taskId, 'low_confidence')
  })
  taskEvents.on('review', ({ taskId }: { taskId: string }) => {
    updateCoverageIndexForTask(taskId)
  })
  taskEvents.on('error', ({ taskId }: { taskId: string }) => {
    WatchService.finishTask(taskId, 'error')
    IntegrationService.finishTask(taskId, 'error')
    updateCoverageIndexForTask(taskId)
    void NotificationService.notifyTaskEvent(taskId, 'task_error')
  })
  taskEvents.on('cancelled', ({ taskId }: { taskId: string }) => {
    WatchService.finishTask(taskId, 'cancelled')
    IntegrationService.finishTask(taskId, 'cancelled')
    updateCoverageIndexForTask(taskId)
    void NotificationService.notifyTaskEvent(taskId, 'task_cancelled')
  })
}

async function recoverRuntimeState() {
  try {
    await globalTaskQueue.recoverInterrupted()
  } catch (e) {
    console.error('[Reconcile] Failed to recover interrupted tasks:', e)
  }
  try {
    NotificationService.recoverStuck()
  } catch (e) {
    console.error('[Reconcile] Failed to recover stuck notifications:', e)
  }
}

export default defineNitroPlugin(async () => {
  await recoverRuntimeState()
  try {
    ReviewJobService.recoverInterrupted()
  } catch (e) {
    console.error('[Reconcile] Failed to recover review jobs:', e)
  }

  try {
    await ConfigService.cleanupLogs()
  } catch (e) {
    console.error('[Reconcile] Failed to cleanup logs:', e)
  }

  registerAutomationListeners()

  try {
    await WatchService.start()
  } catch (e) {
    console.error('[Reconcile] Failed to start watch service:', e)
  }

  if (!globalState.__subxRecoveryTimer) {
    globalState.__subxRecoveryTimer = setInterval(() => {
      void recoverRuntimeState()
    }, RECOVERY_INTERVAL_MS)
    globalState.__subxRecoveryTimer.unref?.()
  }

  try {
    startAutoBackupScheduler()
  } catch (e) {
    console.error('[Reconcile] Failed to start auto backup scheduler:', e)
  }

  try {
    CoverageAutoFillService.startScheduler()
  } catch (e) {
    console.error('[Reconcile] Failed to start coverage auto-fill scheduler:', e)
  }
})
