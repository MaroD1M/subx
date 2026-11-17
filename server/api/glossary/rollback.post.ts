import { apiError } from '../../utils/apiError'
import { requireScope } from '../../utils/apiTokens'
import { GlossaryService, glossaryActor } from '../../utils/glossary'
import { useDb } from '../../utils/db'
import { NotificationService } from '../../utils/notifications'
import { parseBody, glossaryRollbackSchema } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  requireScope(event, 'glossary:write')
  const body = await parseBody(event, glossaryRollbackSchema)
  try {
    const snapshot = useDb().prepare('SELECT scope_type, scope_key, entry_count FROM glossary_snapshots WHERE id = ?').get(body.snapshotId) as any
    if (!GlossaryService.rollbackSnapshot(body.snapshotId, glossaryActor(event))) throw apiError(404, '快照不存在')
    void NotificationService.notifyGlossaryEvent('glossary_updated', {
      glossary: {
        scopeType: snapshot?.scope_type || 'global',
        scopeKey: snapshot?.scope_key || '',
        total: Number(snapshot?.entry_count || 0),
        inserted: 0,
        updated: 0,
        skipped: 0
      }
    }).catch(error => console.warn('[Glossary] Failed to enqueue rollback notification:', error?.message || error))
    return { success: true }
  } catch (error: any) {
    if (error?.statusCode) throw error
    throw apiError(400, error?.message || '回滚术语快照失败')
  }
})
