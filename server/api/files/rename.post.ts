import { rename, stat } from 'fs/promises'
import { dirname, join, resolve, normalize } from 'path'
import { safePath } from '../../utils/subtitle'

function validateName(name: string) {
  if (!name || !name.trim()) {
    throw createError({ statusCode: 400, message: '新名称不能为空' })
  }
  if (name.includes('/') || name.includes('\\') || name.includes('..')) {
    throw createError({ statusCode: 400, message: '新名称不合法' })
  }
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const fromPath = String(body?.path || '').trim()
  const newName = String(body?.newName || '').trim()

  if (!fromPath) {
    throw createError({ statusCode: 400, message: '原路径不能为空' })
  }
  validateName(newName)

  const sourceFullPath = safePath(fromPath)
  const sourceDir = dirname(sourceFullPath)
  const targetFullPath = join(sourceDir, newName)

  const videoDir = normalize(resolve(process.env.VIDEO_DIR || '/data'))
  const normalizedTarget = normalize(resolve(targetFullPath))
  if (!normalizedTarget.startsWith(videoDir + '/') && !normalizedTarget.startsWith(videoDir + '\\') && normalizedTarget !== videoDir) {
    throw createError({ statusCode: 403, message: '路径越权' })
  }

  try {
    await stat(sourceFullPath)
  } catch {
    throw createError({ statusCode: 404, message: '源文件/目录不存在' })
  }

  await rename(sourceFullPath, normalizedTarget)
  return { success: true }
})
