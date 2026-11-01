import { rename, lstat } from 'fs/promises'
import { dirname, join, resolve, normalize, relative } from 'path'
import { getMediaRoot } from '../../utils/mediaRoots'
import { resolveInsideRoot, resolvePathEntry } from '../../utils/pathSafety'
import { parseBody, fileRenameSchema } from '../../utils/validation'

function validateName(name: string) {
  if (!name || !name.trim()) {
    throw createError({ statusCode: 400, message: '新名称不能为空' })
  }
  if (name.includes('/') || name.includes('\\') || name.includes('..')) {
    throw createError({ statusCode: 400, message: '新名称不合法' })
  }
}

export default defineEventHandler(async (event) => {
  const body = await parseBody(event, fileRenameSchema)
  const fromPath = String(body?.path || '').trim()
  const newName = String(body?.newName || '').trim()
  const rootId = String(body?.rootId || '').trim() || undefined

  if (!fromPath) {
    throw createError({ statusCode: 400, message: '原路径不能为空' })
  }
  validateName(newName)

  const root = await getMediaRoot(rootId)
  const videoDir = normalize(resolve(root.path))
  const sourceFullPath = await resolvePathEntry(videoDir, fromPath)
  const sourceDir = dirname(sourceFullPath)
  const targetFullPath = join(sourceDir, newName)
  const normalizedTarget = await resolveInsideRoot(
    videoDir,
    relative(videoDir, targetFullPath),
    { allowMissing: true }
  )

  try {
    await lstat(sourceFullPath)
  } catch {
    throw createError({ statusCode: 404, message: '源文件/目录不存在' })
  }

  try {
    await lstat(normalizedTarget)
    throw createError({ statusCode: 409, message: '目标名称已存在，拒绝覆盖' })
  } catch (e: any) {
    if (e?.statusCode) throw e
    // target does not exist: safe to rename
  }

  await rename(sourceFullPath, normalizedTarget)
  return { success: true }
})
