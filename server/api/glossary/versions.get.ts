import { requireScope } from '../../utils/apiTokens'
import { GlossaryService } from '../../utils/glossary'

export default defineEventHandler((event) => {
  requireScope(event, 'glossary:read')
  const query = getQuery(event) as { entryId?: string, limit?: string }
  const entryId = query.entryId ? Number(query.entryId) : undefined
  return { versions: GlossaryService.versions(Number.isInteger(entryId) ? entryId : undefined, Number(query.limit || 100)) }
})
