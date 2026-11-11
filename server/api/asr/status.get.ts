import { ConfigService } from '../../utils/config'
import { mergeAsrHealth } from '../../utils/asr/status'

export default defineEventHandler(async () => {
  const config = await ConfigService.getConfig(true)
  const baseUrl = String(config.asrBaseUrl || process.env.ASR_INTERNAL_URL || '').trim().replace(/\/+$/, '')
  if (!baseUrl) {
    return { ok: false, message: 'ASR 地址未配置' }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  const headers: Record<string, string> = {}
  if (config.asrApiKey) headers.Authorization = `Bearer ${config.asrApiKey}`
  try {
    const response = await fetch(`${baseUrl}/health`, { headers, signal: controller.signal })
    const data = await response.json().catch(() => null)
    return {
      ok: response.ok,
      status: response.status,
      data: mergeAsrHealth(config, data)
    }
  } catch (e: any) {
    return { ok: false, message: e?.message || 'ASR 服务不可达' }
  } finally {
    clearTimeout(timer)
  }
})
