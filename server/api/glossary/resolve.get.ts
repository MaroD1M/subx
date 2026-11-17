import { requireScope } from '../../utils/apiTokens'
import { ConfigService } from '../../utils/config'
import { GlossaryService } from '../../utils/glossary'

export default defineEventHandler(async (event) => {
  requireScope(event, 'glossary:read')
  const query = getQuery(event) as { seriesKey?: string, targetLanguage?: string }
  const config = await ConfigService.getConfig()
  return {
    glossary: GlossaryService.resolve(String(query.seriesKey || ''), {
      configGlossary: config.glossary || {},
      targetLanguage: String(query.targetLanguage || '')
    })
  }
})
