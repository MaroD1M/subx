import { apiError } from '../utils/apiError'
import { BackupService } from '../utils/backup'
import { ConfigService } from '../utils/config'

export default defineEventHandler(async () => {
  const config = await ConfigService.getConfig()
  try {
    const backup = await BackupService.create({
      keep: Number(config.autoBackupKeep || 10),
      includeLogs: false
    })
    return { success: true, backup }
  } catch (error: any) {
    throw apiError(500, error?.message || '备份失败')
  }
})
