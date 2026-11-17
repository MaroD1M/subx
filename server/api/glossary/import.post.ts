import { apiError } from '../../utils/apiError'
import { requireScope } from '../../utils/apiTokens'
import { GlossaryService, glossaryActor } from '../../utils/glossary'
import { NotificationService } from '../../utils/notifications'
import { parseBody, glossaryImportSchema } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  requireScope(event, 'glossary:write')
  const body = await parseBody(event, glossaryImportSchema)
  if ((body.scopeType || 'global') === 'series' && !String(body.scopeKey || '').trim()) {
    throw apiError(400, '系列术语导入必须填写系列 Key')
  }
  try {
    const result = GlossaryService.importEntries(
      body.content,
      body.format || 'csv',
      body.scopeType || 'global',
      body.scopeKey || '',
      body.strategy || 'skip',
      { dryRun: body.dryRun === true, filename: body.filename, actor: glossaryActor(event) }
    )
    if (body.dryRun !== true) {
      void NotificationService.notifyGlossaryEvent('glossary_imported', {
        glossary: {
          scopeType: body.scopeType || 'global',
          scopeKey: body.scopeKey || '',
          total: result.total,
          inserted: result.inserted,
          updated: result.updated,
          skipped: result.skipped
        }
      })
    }
    return result
  } catch (error: any) {
    throw apiError(400, error?.message || '导入术语失败')
  }
})
