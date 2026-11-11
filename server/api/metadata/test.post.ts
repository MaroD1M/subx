import { apiError } from '../../utils/apiError'
import { MetadataService } from '../../utils/metadata'
import { ConfigService } from '../../utils/config'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const config = await ConfigService.getConfig()
  const apiKey = String(body?.apiKey || config.metadataApiKey || '').trim()
  if (!apiKey) throw apiError(400, '请先填写 TMDB API Key')
  try {
    return await MetadataService.test(apiKey, String(body?.language || config.metadataLanguage || 'zh-CN'))
  } catch (error: any) {
    throw apiError(400, `TMDB 检测失败：${error?.message || error}`)
  }
})
