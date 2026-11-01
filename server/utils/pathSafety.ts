import { basename, dirname, isAbsolute, join, normalize, relative, resolve } from 'path'
import { lstat, realpath } from 'fs/promises'
import { createError } from 'h3'

export function isPathInside(rootPath: string, targetPath: string): boolean {
  const rel = relative(normalize(resolve(rootPath)), normalize(resolve(targetPath)))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

async function safeRealpath(path: string): Promise<string | null> {
  try {
    return await realpath(path)
  } catch {
    return null
  }
}

export async function resolveInsideRoot(
  rootPath: string,
  userPath = '.',
  options: { allowMissing?: boolean } = {}
): Promise<string> {
  const allowMissing = options.allowMissing !== false
  const lexicalRoot = normalize(resolve(rootPath))
  const resolved = normalize(resolve(lexicalRoot, userPath || '.'))

  if (!isPathInside(lexicalRoot, resolved)) {
    throw createError({ statusCode: 403, message: '路径越权' })
  }

  const realRoot = await safeRealpath(lexicalRoot)
  const realResolved = await safeRealpath(resolved)

  if (realResolved) {
    if (realRoot && !isPathInside(realRoot, realResolved)) {
      throw createError({ statusCode: 403, message: '路径越权' })
    }
    return realResolved
  }

  if (!allowMissing) {
    throw createError({ statusCode: 404, message: '目标路径不存在' })
  }

  const parentReal = await safeRealpath(dirname(resolved))
  if (!parentReal) {
    throw createError({ statusCode: 404, message: '父目录不存在' })
  }
  if (realRoot && !isPathInside(realRoot, parentReal)) {
    throw createError({ statusCode: 403, message: '路径越权' })
  }

  return join(parentReal, basename(resolved))
}

export async function isSymbolicLink(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isSymbolicLink()
  } catch {
    return false
  }
}

export async function resolvePathEntry(rootPath: string, userPath: string): Promise<string> {
  const lexicalRoot = normalize(resolve(rootPath))
  const resolved = normalize(resolve(lexicalRoot, userPath || '.'))
  if (!isPathInside(lexicalRoot, resolved)) {
    throw createError({ statusCode: 403, message: '路径越权' })
  }

  const realRoot = await safeRealpath(lexicalRoot)
  const parentReal = await safeRealpath(dirname(resolved))
  if (!parentReal) {
    throw createError({ statusCode: 404, message: '目标路径不存在' })
  }
  if (realRoot && !isPathInside(realRoot, parentReal)) {
    throw createError({ statusCode: 403, message: '路径越权' })
  }

  return resolved
}
