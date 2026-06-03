import { mkdir, stat } from 'fs/promises'
import { join, resolve, normalize } from 'path'
import { safePath } from '../../utils/subtitle'
import { getMediaRoot } from '../../utils/mediaRoots'

function validateName(name: string) {
  if (!name || !name.trim()) {
    throw createError({ statusCode: 400, message: '文件夹名称不能为空' })
  }
  if (name.includes('/') || name.includes('\\') || name.includes('..')) {
    throw createError({ statusCode: 400, message: '文件夹名称不合法' })
  }
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const folderName = String(body?.name || '').trim()
  const parentPath = String(body?.parentPath || '').trim()
  const rootId = String(body?.rootId || '').trim() || undefined

  validateName(folderName)

  const root = await getMediaRoot(rootId)
  const videoDir = normalize(resolve(root.path))
  const parentFullPath = parentPath ? await safePath(parentPath, rootId) : videoDir

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
  const normalizedTarget = normalize(resolve(targetPath))
  if (!normalizedTarget.startsWith(videoDir + '/') && !normalizedTarget.startsWith(videoDir + '\\') && normalizedTarget !== videoDir) {
    throw createError({ statusCode: 403, message: '路径越权' })
  }

  await mkdir(normalizedTarget, { recursive: false })
  return { success: true }
})
