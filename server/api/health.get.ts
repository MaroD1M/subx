import { useDb } from '../utils/db'

export default defineEventHandler(() => {
  try {
    useDb().prepare('SELECT 1').get()
    return { ok: true, status: 'ok' }
  } catch (e: any) {
    throw createError({ statusCode: 503, message: e?.message || 'database unavailable' })
  }
})
