import { apiError } from '../../utils/apiError'
import { TranslationMemoryService } from '../../utils/translationMemory'
import { ConfigService } from '../../utils/config'
import { getMediaRoot } from '../../utils/mediaRoots'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const rootId = String(body?.rootId || '').trim()
  if (!rootId) throw apiError(400, '缺少媒体库 ID')
  await getMediaRoot(rootId)
  const config = await ConfigService.getConfig()
  const targetLanguage = String(body?.targetLanguage || config.targetLanguage || 'zh-CN')
  return TranslationMemoryService.learnFromLibrary(rootId, targetLanguage, {
    limitFiles: Number(body?.limitFiles || 200),
    limitPairs: Number(body?.limitPairs || 20000)
  })
})
