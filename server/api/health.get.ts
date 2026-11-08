import { apiError } from '../utils/apiError'
import { ConfigService } from '../utils/config'
import { useDb } from '../utils/db'

type ComponentStatus = 'ok' | 'disabled' | 'unreachable' | `http-${number}`

async function checkService(name: 'asr' | 'ocr', url: string, apiKey: string, enabled: boolean, components: Record<string, ComponentStatus>) {
  if (!enabled) {
    components[name] = 'disabled'
    return true
  }
  if (!url) {
    components[name] = 'unreachable'
    return false
  }
  try {
    const response = await fetch(`${url.replace(/\/+$/, '')}/health`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
      signal: AbortSignal.timeout(3000)
    })
    components[name] = response.ok ? 'ok' : `http-${response.status}`
    return response.ok
  } catch {
    components[name] = 'unreachable'
    return false
  }
}

export default defineEventHandler(async (event) => {
  try {
    useDb().prepare('SELECT 1').get()
  } catch (e: any) {
    throw apiError(503, e?.message || 'database unavailable')
  }

  const query = getQuery(event)
  const deep = ['1', 'true'].includes(String(query.deep || '').toLowerCase())
  if (!deep) {
    return { ok: true, status: 'ok' }
  }

  const config = await ConfigService.getConfig()
  const components: Record<string, ComponentStatus> = { database: 'ok' }
  const [asrOk, ocrOk] = await Promise.all([
    checkService('asr', config.asrBaseUrl || process.env.ASR_INTERNAL_URL || '', config.asrApiKey || '', config.asrEnabled === true, components),
    checkService('ocr', config.ocrBaseUrl || process.env.OCR_INTERNAL_URL || '', config.ocrApiKey || '', config.ocrEnabled === true, components)
  ])
  const ok = asrOk && ocrOk
  const payload = { ok, status: ok ? 'ok' : 'degraded', components }
  if (!ok) {
    throw apiError(503, '部分依赖服务不可用', payload)
  }
  return payload
})
