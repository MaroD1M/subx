import { apiError } from '../utils/apiError'
import { requireScope } from '../utils/apiTokens'
import { GlossaryService } from '../utils/glossary'
import { glossaryListQuerySchema } from '../utils/validation'

export default defineEventHandler((event) => {
  requireScope(event, 'glossary:read')
  const parsed = glossaryListQuerySchema.safeParse(getQuery(event))
  if (!parsed.success) throw apiError(400, '术语库查询参数不合法')
  return GlossaryService.list(parsed.data)
})
