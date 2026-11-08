import { apiError } from '../../utils/apiError'
import { rename, lstat } from 'fs/promises'
import { dirname, join, resolve, normalize, relative } from 'path'
import { getMediaRoot } from '../../utils/mediaRoots'
import { resolveInsideRoot, resolvePathEntry } from '../../utils/pathSafety'
import { parseBody, fileRenameSchema } from '../../utils/validation'

function validateName(name: string) {
  if (!name || !name.trim()) {
    throw apiError(400, '新名称不能为空')
  }
  if (name.includes('/') || name.includes('\\') || name.includes('..')) {
    throw apiError(400, '新名称不合法')
  }
}

export default defineEventHandler(async (event) => {
  const body = await parseBody(event, fileRenameSchema)
  const fromPath = String(body?.path || '').trim()
  const newName = String(body?.newName || '').trim()
  const rootId = String(body?.rootId || '').trim() || undefined

  if (!fromPath) {
    throw apiError(400, '原路径不能为空')
  }
  validateName(newName)

  const root = await getMediaRoot(rootId)
  const videoDir = normalize(resolve(root.path))
  const sourceFullPath = await resolvePathEntry(videoDir, fromPath)
  if (resolve(sourceFullPath) === videoDir) {
    throw apiError(400, '不能重命名媒体库根目录')
  }
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
    throw apiError(404, '源文件/目录不存在')
  }

  try {
    await lstat(normalizedTarget)
    throw apiError(409, '目标名称已存在，拒绝覆盖')
  } catch (e: any) {
    if (e?.statusCode) throw e
    // target does not exist: safe to rename
  }

  await rename(sourceFullPath, normalizedTarget)
  return { success: true }
})
