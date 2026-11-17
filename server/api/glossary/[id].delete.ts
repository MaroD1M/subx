import { apiError } from '../../utils/apiError'
import { requireScope } from '../../utils/apiTokens'
import { GlossaryService, glossaryActor } from '../../utils/glossary'

export default defineEventHandler((event) => {
  requireScope(event, 'glossary:write')
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw apiError(400, '术语 ID 不合法')
  try {
    if (!GlossaryService.delete(id, glossaryActor(event))) throw apiError(404, '术语不存在')
    return { success: true }
  } catch (error: any) {
    if (error?.statusCode) throw error
    throw apiError(400, error?.message || '删除术语失败')
  }
})
