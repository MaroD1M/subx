import { apiError } from '../../utils/apiError'
import { searchMediaFiles } from '../../utils/fileScan'

export default defineEventHandler(async (event) => {
  const query = getQuery(event) as { rootId?: string, q?: string, limit?: string }
  const rootId = String(query.rootId || '').trim()
  const keyword = String(query.q || '').trim()
  if (!rootId) throw apiError(400, '缺少媒体库 ID')
  if (keyword.length < 2) throw apiError(400, '搜索关键词至少需要 2 个字符')

  const controller = new AbortController()
  const abort = () => {
    if (!controller.signal.aborted) controller.abort()
  }
  const req = event.node.req
  const res = event.node.res
  const onReqAborted = () => abort()
  const onReqClose = () => {
    if (req.destroyed && !req.complete) abort()
  }
  const onResClose = () => {
    if (!res.writableEnded) abort()
  }
  req.once('aborted', onReqAborted)
  req.once('close', onReqClose)
  res.once('close', onResClose)

  try {
    return await searchMediaFiles(rootId, keyword, Number(query.limit) || 200, controller.signal)
  } finally {
    req.removeListener('aborted', onReqAborted)
    req.removeListener('close', onReqClose)
    res.removeListener('close', onResClose)
  }
})
