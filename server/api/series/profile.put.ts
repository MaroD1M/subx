import { z } from 'zod'
import { apiError } from '../../utils/apiError'
import { parseBody } from '../../utils/validation'
import { SeriesService } from '../../utils/series'

const seriesProfileInputSchema = z.object({
  rootId: z.string().max(200).optional(),
  filePath: z.string().max(4096).optional(),
  seriesKey: z.string().max(4096).optional(),
  title: z.string().max(500).optional(),
  background: z.string().max(20000).optional(),
  glossary: z.record(z.string(), z.unknown()).optional(),
  summary: z.string().max(20000).optional()
}).passthrough()

export default defineEventHandler(async (event) => {
  const body = await parseBody(event, seriesProfileInputSchema)
  const filePath = body.filePath ? String(body.filePath).trim() : ''
  const seriesKey = body.seriesKey ? String(body.seriesKey).trim() : ''
  if (!filePath && !seriesKey) {
    throw apiError(400, 'filePath or seriesKey is required')
  }

  try {
    const profile = SeriesService.saveProfile({
      rootId: body.rootId,
      filePath: filePath || undefined,
      seriesKey: seriesKey || undefined,
      title: body.title,
      background: body.background,
      glossary: body.glossary as Record<string, string> | undefined,
      summary: body.summary
    })
    return { ok: true, profile }
  } catch (error: any) {
    throw apiError(400, String(error?.message || '保存系列档案失败'))
  }
})
