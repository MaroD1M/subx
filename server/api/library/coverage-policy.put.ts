import { apiError } from '../../utils/apiError'
import { CoverageAutoFillService, computeCoverageNextRun } from '../../utils/coverageAutoFill'
import { getMediaRoot } from '../../utils/mediaRoots'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const rootId = String(body?.rootId || '').trim()
  if (!rootId) throw apiError(400, '缺少媒体库 ID')
  await getMediaRoot(rootId)
  try {
    const policy = await CoverageAutoFillService.savePolicy(rootId, body)
    const nextRunAt = computeCoverageNextRun(policy)
    return { ...policy, nextRunAt: nextRunAt ? nextRunAt.toISOString() : undefined }
  } catch (error: any) {
    throw apiError(400, error?.message || '保存自动补齐策略失败')
  }
})
