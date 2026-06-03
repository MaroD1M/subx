import { rm, stat } from 'fs/promises'
import { safePath } from '../../utils/subtitle'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const relPath = String(body?.path || '').trim()
  const rootId = String(body?.rootId || '').trim() || undefined

  if (!relPath) {
    throw createError({ statusCode: 400, message: '路径不能为空' })
  }

  const fullPath = await safePath(relPath, rootId)
  let targetStat: Awaited<ReturnType<typeof stat>>

  try {
    targetStat = await stat(fullPath)
  } catch {
    throw createError({ statusCode: 404, message: '目标不存在' })
  }

  if (targetStat.isDirectory()) {
    await rm(fullPath, { recursive: true, force: false })
  } else {
    await rm(fullPath, { force: false })
  }

  return { success: true }
})
