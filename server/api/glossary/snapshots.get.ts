import { requireScope } from '../../utils/apiTokens'
import { GlossaryService } from '../../utils/glossary'

export default defineEventHandler((event) => {
  requireScope(event, 'glossary:read')
  const query = getQuery(event) as { limit?: string }
  return { snapshots: GlossaryService.snapshots(Number(query.limit || 50)) }
})
