export function apiError(statusCode: number, message: string, data?: unknown) {
  return createError({
    statusCode,
    statusMessage: message,
    message,
    data
  })
}

export function normalizeApiError(error: unknown, fallbackMessage = '请求失败', fallbackStatus = 500) {
  const candidate = error as any
  if (candidate?.statusCode) return candidate
  return apiError(fallbackStatus, String(candidate?.message || fallbackMessage))
}
