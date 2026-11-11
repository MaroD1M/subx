import { apiError } from '../../utils/apiError'
import { CoverageAutoFillService, computeCoverageNextRun } from '../../utils/coverageAutoFill'
import { getMediaRoot } from '../../utils/mediaRoots'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const rootId = String(query.rootId || '').trim()
  if (!rootId) throw apiError(400, '缺少媒体库 ID')
  await getMediaRoot(rootId)
  const policy = await CoverageAutoFillService.getPolicy(rootId)
  const nextRunAt = computeCoverageNextRun(policy)
  return {
    ...policy,
    nextRunAt: nextRunAt ? nextRunAt.toISOString() : undefined
  }
})
