import { apiError } from '../utils/apiError'
import { requireScope } from '../utils/apiTokens'
import { GlossaryService, glossaryActor } from '../utils/glossary'
import { parseBody, glossaryEntrySchema } from '../utils/validation'

export default defineEventHandler(async (event) => {
  requireScope(event, 'glossary:write')
  const body = await parseBody(event, glossaryEntrySchema)
  try {
    return { entry: GlossaryService.create(body, glossaryActor(event)) }
  } catch (error: any) {
    throw apiError(400, error?.message || '保存术语失败')
  }
})
