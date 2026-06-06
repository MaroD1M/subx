import { readdir, stat, access } from 'fs/promises'
import { constants } from 'fs'
import { join, relative, resolve, normalize } from 'path'
import type { FileNode, MediaRoot } from '~~/types'
import { getMediaRoot, getMediaRoots } from '../utils/mediaRoots'

const SUPPORTED_EXTENSIONS = ['.mkv', '.mp4', '.avi', '.webm', '.ts', '.srt', '.ass', '.ssa', '.vtt']

function isSupportedFile(name: string) {
  const ext = name.substring(name.lastIndexOf('.')).toLowerCase()
  return SUPPORTED_EXTENSIONS.includes(ext)
}

function isInsideRoot(rootPath: string, targetPath: string) {
  const resolvedRoot = normalize(resolve(rootPath))
  const resolvedTarget = normalize(resolve(targetPath))
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(resolvedRoot + '/') || resolvedTarget.startsWith(resolvedRoot + '\\')
}

async function readDirectoryNodes(root: MediaRoot, dirPath = ''): Promise<FileNode[]> {
  const normalizedRoot = normalize(resolve(root.path))

  try {
    await access(normalizedRoot, constants.R_OK)
  } catch (e: any) {
    throw createError({
      statusCode: 500,
      message: `视频目录不可读: ${normalizedRoot}，请检查挂载路径和权限 (${e?.code || 'UNKNOWN'})`
    })
  }

  const absoluteDir = dirPath ? resolve(normalizedRoot, dirPath) : normalizedRoot
  if (!isInsideRoot(normalizedRoot, absoluteDir)) {
    throw createError({ statusCode: 403, message: '目录路径越界' })
  }

  let items: string[]
  try {
    items = await readdir(absoluteDir)
  } catch (e: any) {
    throw createError({
      statusCode: 500,
      message: `目录读取失败: ${dirPath || '/'} (${e?.code || 'UNKNOWN'})`
    })
  }

  const nodes: FileNode[] = []

  for (const item of items) {
    if (item.startsWith('.')) continue
    const fullPath = join(absoluteDir, item)

    let stats
    try {
      stats = await stat(fullPath)
    } catch {
      continue
    }

    if (!isInsideRoot(normalizedRoot, fullPath)) continue
    const relPath = relative(normalizedRoot, fullPath).replaceAll('\\', '/')

    if (stats.isDirectory()) {
      let hasChildren = false
      try {
        const childNames = await readdir(fullPath)
        hasChildren = childNames.some(name => !name.startsWith('.'))
      } catch {
        hasChildren = false
      }

      nodes.push({
        name: item,
        path: relPath,
        isDir: true,
        children: [],
        hasChildren,
        loaded: false,
        rootId: root.id,
        rootName: root.name
      })
      continue
    }

    if (isSupportedFile(item)) {
      nodes.push({
        name: item,
        path: relPath,
        isDir: false,
        rootId: root.id,
        rootName: root.name
      })
    }
  }

  nodes.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name, 'zh-CN')
  })

  return nodes
}

export default defineEventHandler(async (event) => {
  const { rootId, path } = getQuery(event) as { rootId?: string, path?: string }

  if (rootId) {
    const root = await getMediaRoot(rootId)
    return readDirectoryNodes(root, path || '')
  }

  const roots = await getMediaRoots()
  return roots.map((root) => ({
    name: root.name,
    path: '',
    isDir: true,
    children: [],
    hasChildren: true,
    loaded: false,
    rootId: root.id,
    rootName: root.name
  }))
})
