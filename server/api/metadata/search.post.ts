import { apiError } from '../../utils/apiError'
import { MetadataService } from '../../utils/metadata'
import { ConfigService } from '../../utils/config'
import { requireScope } from '../../utils/apiTokens'

export default defineEventHandler(async (event) => {
  requireScope(event, 'tasks:write')
  const body = await readBody(event)
  const filePath = String(body?.filePath || '').trim()
  if (!filePath) throw apiError(400, '缺少视频文件路径')
  const config = await ConfigService.getConfig()
  if (config.metadataEnabled !== true) throw apiError(400, '请先在「设置 → 智能增强 → 媒体元数据」启用 TMDB 元数据')
  const apiKey = String(config.metadataApiKey || '').trim()
  if (!apiKey) throw apiError(400, '请先在「设置 → 智能增强 → 媒体元数据」填写 TMDB API Key')

  try {
    const metadata = await MetadataService.enrich(filePath, config, {
      query: String(body?.query || '').trim() || undefined,
      manual: true
    })
    if (!metadata) throw apiError(404, '未匹配到 TMDB 结果，请调整关键词后重试')
    return { metadata }
  } catch (error: any) {
    if (error?.statusCode) throw error
    throw apiError(400, `TMDB 搜索失败：${error?.message || error}`)
  }
})
