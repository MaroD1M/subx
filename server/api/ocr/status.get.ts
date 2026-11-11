import { ConfigService } from '../../utils/config'
import { mergeOcrHealth } from '../../utils/ocr/status'

export default defineEventHandler(async () => {
  const config = await ConfigService.getConfig(true)
  const baseUrl = String(config.ocrBaseUrl || process.env.OCR_INTERNAL_URL || '').trim().replace(/\/+$/, '')
  if (!baseUrl) {
    return { ok: false, message: 'OCR 地址未配置' }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const headers: Record<string, string> = {}
    if (config.ocrApiKey) headers.Authorization = `Bearer ${config.ocrApiKey}`
    const response = await fetch(`${baseUrl}/health`, { headers, signal: controller.signal })
    const data = await response.json().catch(() => null)
    return {
      ok: response.ok,
      status: response.status,
      data: mergeOcrHealth(config, data)
    }
  } catch (e: any) {
    return { ok: false, message: e?.message || 'OCR 服务不可达' }
  } finally {
    clearTimeout(timer)
  }
})
