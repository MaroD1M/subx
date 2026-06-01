import { rm, stat } from 'fs/promises'
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

  // 目录支持递归删除，避免“创建成功但无法删除非空目录”的体验问题。
  if (targetStat.isDirectory()) {
    await rm(fullPath, { recursive: true, force: false })
  } else {
    await rm(fullPath, { force: false })
  }

  return { success: true }
})
