import pino from 'pino'

const level = process.env.NODE_ENV === 'production' ? 'info' : process.env.NODE_ENV === 'test' ? 'warn' : 'debug'

export const logger = pino({
  level,
  base: { service: 'subx' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'apiKey',
      'asrApiKey',
      'asrCloudApiKey',
      'ocrApiKey',
      'integrationWebhookToken',
      'req.headers.authorization',
      'req.headers.cookie',
      '*.apiKey',
      '*.token'
    ],
    censor: '[redacted]'
  }
})

export function logError(error: unknown, context: Record<string, unknown> = {}) {
  const statusCode = Number((error as any)?.statusCode || context.statusCode || 500)
  const payload = {
    ...context,
    statusCode,
    err: error
  }
  if (statusCode >= 500) {
    logger.error(payload, 'request failed')
  } else if (statusCode === 401 || statusCode === 404) {
    logger.debug(payload, 'request rejected')
  } else {
    logger.warn(payload, 'request rejected')
  }
}
