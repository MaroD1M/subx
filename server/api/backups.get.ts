import { BackupService, backupRoot } from '../utils/backup'
import { ConfigService } from '../utils/config'

export default defineEventHandler(async () => {
  const config = await ConfigService.getConfig()
  return {
    enabled: config.autoBackupEnabled === true,
    intervalHours: Number(config.autoBackupIntervalHours || 24),
    keep: Number(config.autoBackupKeep || 10),
    root: backupRoot(),
    backups: BackupService.list()
  }
})
