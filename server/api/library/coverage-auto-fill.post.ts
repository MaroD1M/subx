import { apiError } from '../../utils/apiError'
import { CoverageAutoFillService } from '../../utils/coverageAutoFill'
import { getMediaRoot } from '../../utils/mediaRoots'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const rootId = String(body?.rootId || '').trim()
  if (!rootId) throw apiError(400, '缺少媒体库 ID')
  await getMediaRoot(rootId)
  return CoverageAutoFillService.run(rootId, {
    dryRun: body?.dryRun === true,
    force: body?.force === true
  })
})
