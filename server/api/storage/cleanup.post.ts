import { StorageService } from '../../utils/storage'
import { parseBody, storageCleanupSchema } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  const body = await parseBody(event, storageCleanupSchema)
  const result = await StorageService.cleanup(body.targets, { days: body.days, all: body.all })
  const summary = await StorageService.summary()
  return { success: true, ...result, summary }
})
