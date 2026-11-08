import { logError } from '../utils/logger'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error, context) => {
    const event = context.event
    logError(error, {
      method: event?.method,
      path: event?.path,
      statusCode: (error as any)?.statusCode || 500
    })
  })
})
