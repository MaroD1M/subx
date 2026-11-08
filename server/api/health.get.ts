import { apiError } from '../utils/apiError'
import { useDb } from '../utils/db'

export default defineEventHandler(() => {
  try {
    useDb().prepare('SELECT 1').get()
    return { ok: true, status: 'ok' }
  } catch (e: any) {
    throw apiError(503, e?.message || 'database unavailable')
  }
})
