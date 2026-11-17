import { apiError } from '../../utils/apiError'
import { requireScope } from '../../utils/apiTokens'
import { GlossaryService, glossaryActor } from '../../utils/glossary'
import { parseBody, glossaryUpdateSchema } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  requireScope(event, 'glossary:write')
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw apiError(400, '术语 ID 不合法')
  const body = await parseBody(event, glossaryUpdateSchema)
  try {
    const entry = GlossaryService.update(id, body, glossaryActor(event))
    if (!entry) throw apiError(404, '术语不存在')
    return { entry }
  } catch (error: any) {
    if (error?.statusCode) throw error
    throw apiError(400, error?.message || '更新术语失败')
  }
})
