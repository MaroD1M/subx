import { ConfigService } from '../../utils/config'

export default defineEventHandler(async () => {
  const config = await ConfigService.getConfig(true)
  const baseUrl = String(config.asrBaseUrl || '').trim().replace(/\/+$/, '')
  if (!baseUrl) {
    return { ok: false, message: 'ASR 地址未配置' }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const response = await fetch(`${baseUrl}/health`, { signal: controller.signal })
    const data = await response.json().catch(() => null)
    return {
      ok: response.ok,
      status: response.status,
      data
    }
  } catch (e: any) {
    return { ok: false, message: e?.message || 'ASR 服务不可达' }
  } finally {
    clearTimeout(timer)
  }
})
