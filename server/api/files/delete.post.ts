import { readdir, rm, stat } from 'fs/promises'
import { safePath } from '../../utils/subtitle'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const relPath = String(body?.path || '').trim()

  if (!relPath) {
    throw createError({ statusCode: 400, message: '路径不能为空' })
  }

  const fullPath = safePath(relPath)
  let targetStat: Awaited<ReturnType<typeof stat>>

  try {
    targetStat = await stat(fullPath)
  } catch {
    throw createError({ statusCode: 404, message: '目标不存在' })
  }

  if (targetStat.isDirectory()) {
    const entries = await readdir(fullPath)
    if (entries.length > 0) {
      throw createError({ statusCode: 400, message: '目录非空，暂不允许删除' })
    }
    await rm(fullPath, { recursive: false, force: false })
  } else {
    await rm(fullPath, { force: false })
  }

  return { success: true }
})
