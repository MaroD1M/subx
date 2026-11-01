import { rm, lstat } from 'fs/promises'
import { resolve, normalize } from 'path'
import { getMediaRoot } from '../../utils/mediaRoots'
import { resolvePathEntry } from '../../utils/pathSafety'
import { parseBody, fileDeleteSchema } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  const body = await parseBody(event, fileDeleteSchema)
  const relPath = String(body?.path || '').trim()
  const rootId = String(body?.rootId || '').trim() || undefined

  if (!relPath) {
    throw createError({ statusCode: 400, message: '路径不能为空' })
  }

  const root = await getMediaRoot(rootId)
  const videoDir = normalize(resolve(root.path))
  const fullPath = await resolvePathEntry(videoDir, relPath)
  let targetStat: Awaited<ReturnType<typeof lstat>>

  try {
    targetStat = await lstat(fullPath)
  } catch {
    throw createError({ statusCode: 404, message: '目标不存在' })
  }

  if (targetStat.isSymbolicLink()) {
    await rm(fullPath, { force: false })
  } else if (targetStat.isDirectory()) {
    await rm(fullPath, { recursive: true, force: false })
  } else {
    await rm(fullPath, { force: false })
  }

  return { success: true }
})
