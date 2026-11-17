import { apiError } from '../../utils/apiError'
import { requireScope } from '../../utils/apiTokens'
import { GlossaryService, glossaryActor } from '../../utils/glossary'
import { parseBody, glossarySnapshotSchema } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  requireScope(event, 'glossary:write')
  const body = await parseBody(event, glossarySnapshotSchema)
  try {
    const id = GlossaryService.createSnapshot(body, glossaryActor(event))
    return { id, snapshots: GlossaryService.snapshots(50) }
  } catch (error: any) {
    throw apiError(400, error?.message || '创建术语快照失败')
  }
})
