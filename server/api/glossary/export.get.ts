import { requireScope } from '../../utils/apiTokens'
import { GlossaryService } from '../../utils/glossary'

export default defineEventHandler((event) => {
  requireScope(event, 'glossary:read')
  const query = getQuery(event) as Record<string, string>
  return GlossaryService.exportEntries({
    scopeType: query.scopeType,
    scopeKey: query.scopeKey,
    q: query.q,
    sourceLang: query.sourceLang,
    targetLang: query.targetLang,
    enabled: query.enabled === undefined ? undefined : query.enabled === 'true' || query.enabled === '1',
    format: query.format
  })
})
