import { StorageService } from '../utils/storage'

export default defineEventHandler(async () => {
  return StorageService.summary()
})
