import { apiError } from '../../utils/apiError'
import { ConfigService } from '../../utils/config'
import { IntegrationService, parseIntegrationPayload, type IntegrationSource } from '../../utils/integrations'

const SOURCES = new Set(['sonarr', 'radarr', 'jellyfin', 'plex', 'emby', 'bazarr'])

async function readPayload(event: any): Promise<any> {
  const contentType = String(getHeader(event, 'content-type') || '')
  if (contentType.includes('multipart/form-data')) {
    const parts = await readMultipartFormData(event) || []
    const result: Record<string, string> = {}
    for (const part of parts) {
      if (!part.name) continue
      result[part.name] = part.data.toString('utf-8')
    }
    if (result.payload) {
      try { return JSON.parse(result.payload) } catch { return result }
    }
    return result
  }
  return await readBody(event).catch(() => ({}))
}

export default defineEventHandler(async (event) => {
  const source = String(getRouterParam(event, 'source') || '') as IntegrationSource
  if (!SOURCES.has(source)) throw apiError(404, '未知集成来源')
  const config = await ConfigService.getConfig(true)
  const expected = String(config.integrationWebhookToken || '').trim()
  if (!expected) throw apiError(403, '集成 Webhook Token 未配置')
  const query = getQuery(event) as { token?: string }
  const provided = String(query.token || getHeader(event, 'x-subx-token') || (getHeader(event, 'authorization') || '').replace(/^Bearer\s+/i, '') || '').trim()
  if (!IntegrationService.verifyToken(provided, config)) {
    throw apiError(401, '集成 Token 无效')
  }

  let body: any
  try {
    body = await readPayload(event)
  } catch {
    throw apiError(400, '无法解析回调内容')
  }
  const payload = parseIntegrationPayload(source, body)
  if (payload.isTest) return { ok: true, test: true, source }
  if (!payload.filePath) throw apiError(400, '回调未包含可识别的文件路径')

  try {
    const result = await IntegrationService.enqueue(source, payload)
    return { ok: true, source, event: payload.event, ...result }
  } catch (error: any) {
    IntegrationService.recordFailure(source, payload, String(error?.message || error))
    throw apiError(400, String(error?.message || error))
  }
})
