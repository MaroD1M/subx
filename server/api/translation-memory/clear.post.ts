import { TranslationMemoryService } from '../../utils/translationMemory'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const targetLanguage = String(body?.targetLanguage || '').trim()
  const removed = TranslationMemoryService.clear(targetLanguage || undefined)
  return { success: true, removed }
})
