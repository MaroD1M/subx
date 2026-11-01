import { createError } from 'h3'
import type { AppConfig } from '../../../types'

export function getAsrBaseUrl(config: AppConfig) {
  return String(config.asrBaseUrl || '').trim().replace(/\/+$/, '')
}

interface AsrAdminRequestOptions {
  method?: string
  body?: BodyInit | null
  headers?: Record<string, string>
  timeoutMs?: number
}

export async function requestAsrAdmin<T = any>(
  config: AppConfig,
  path: string,
  options: AsrAdminRequestOptions = {}
): Promise<T> {
  const baseUrl = getAsrBaseUrl(config)
  if (!baseUrl) {
    throw createError({ statusCode: 400, message: 'ASR 地址未配置' })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000)
  const headers: Record<string, string> = { ...(options.headers || {}) }
  if (config.asrApiKey) headers.Authorization = `Bearer ${config.asrApiKey}`

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ?? null,
      signal: controller.signal
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      throw createError({
        statusCode: response.status,
        message: data?.detail || data?.message || 'ASR 管理接口请求失败'
      })
    }
    return data as T
  } catch (e: any) {
    if (e?.statusCode) throw e
    if (e?.name === 'AbortError') {
      throw createError({ statusCode: 504, message: 'ASR 管理接口超时' })
    }
    throw createError({ statusCode: 502, message: e?.message || '无法连接 ASR 服务' })
  } finally {
    clearTimeout(timeout)
  }
}
