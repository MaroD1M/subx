import { mkdir, stat } from 'fs/promises'
import { join, resolve, normalize, relative } from 'path'
import { getMediaRoot } from '../../utils/mediaRoots'
import { resolveInsideRoot } from '../../utils/pathSafety'
import { parseBody, fileCreateSchema } from '../../utils/validation'

function validateName(name: string) {
  if (!name || !name.trim()) {
    throw createError({ statusCode: 400, message: '文件夹名称不能为空' })
  }
  if (name.includes('/') || name.includes('\\') || name.includes('..')) {
    throw createError({ statusCode: 400, message: '文件夹名称不合法' })
  }
}

export default defineEventHandler(async (event) => {
  const body = await parseBody(event, fileCreateSchema)
  const folderName = String(body?.name || '').trim()
  const parentPath = String(body?.parentPath || '').trim()
  const rootId = String(body?.rootId || '').trim() || undefined

  validateName(folderName)

  const root = await getMediaRoot(rootId)
  const videoDir = normalize(resolve(root.path))
  const parentFullPath = parentPath
    ? await resolveInsideRoot(videoDir, parentPath, { allowMissing: false })
    : await resolveInsideRoot(videoDir, '.', { allowMissing: false })

  try {
    const parentStats = await stat(parentFullPath)
    if (!parentStats.isDirectory()) {
      throw createError({ statusCode: 400, message: '目标路径不是目录' })
    }
  } catch (e: any) {
    if (e?.statusCode) throw e
    throw createError({ statusCode: 404, message: '目标目录不存在' })
  }

  const targetPath = join(parentFullPath, folderName)
  const normalizedTarget = await resolveInsideRoot(
    parentFullPath,
    relative(parentFullPath, targetPath),
    { allowMissing: true }
  )

  await mkdir(normalizedTarget, { recursive: false })
  return { success: true }
})
