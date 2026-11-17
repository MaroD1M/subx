import { apiError } from '../../utils/apiError'
import { requireScope } from '../../utils/apiTokens'
import { GlossaryService, glossaryActor } from '../../utils/glossary'
import { parseBody, glossaryBulkSchema } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  requireScope(event, 'glossary:write')
  const body = await parseBody(event, glossaryBulkSchema)
  const actor = body.actor || glossaryActor(event)
  let saved = 0
  const errors: string[] = []
  for (const entry of body.entries) {
    try {
      GlossaryService.create(entry, actor)
      saved += 1
    } catch (error: any) {
      errors.push(`${entry.source || '(空)'}: ${error?.message || error}`)
    }
  }
  if (!saved && errors.length) throw apiError(400, errors[0]!)
  return { saved, errors }
})
