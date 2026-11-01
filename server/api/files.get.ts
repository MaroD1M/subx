import { readdir, lstat, access } from 'fs/promises'
import { constants } from 'fs'
import { join, relative, resolve, normalize } from 'path'
import type { FileNode, MediaRoot } from '~~/types'
import { getMediaRoot, getMediaRoots } from '../utils/mediaRoots'
import { resolveInsideRoot } from '../utils/pathSafety'

const SUPPORTED_EXTENSIONS = ['.mkv', '.mp4', '.avi', '.webm', '.ts', '.m2ts', '.mts', '.mov', '.srt', '.ass', '.ssa', '.vtt']

function isSupportedFile(name: string) {
  const ext = name.substring(name.lastIndexOf('.')).toLowerCase()
  return SUPPORTED_EXTENSIONS.includes(ext)
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

  await resolveInsideRoot(normalizedRoot, dirPath || '.', { allowMissing: false })
  const absoluteDir = dirPath ? normalize(resolve(normalizedRoot, dirPath)) : normalizedRoot

  let entries
  try {
    entries = await readdir(absoluteDir, { withFileTypes: true })
  } catch (e: any) {
    throw createError({
      statusCode: 500,
      message: `目录读取失败: ${dirPath || '/'} (${e?.code || 'UNKNOWN'})`
    })
  }

  const nodes: FileNode[] = []

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    if (entry.isSymbolicLink()) continue

    const fullPath = join(absoluteDir, entry.name)

    let stats
    try {
      stats = await lstat(fullPath)
    } catch {
      continue
    }
    if (stats.isSymbolicLink()) continue

    const relPath = relative(normalizedRoot, fullPath).replaceAll('\\', '/')

    if (stats.isDirectory()) {
      let hasChildren = false
      try {
        const childEntries = await readdir(fullPath, { withFileTypes: true })
        hasChildren = childEntries.some(child => !child.name.startsWith('.') && !child.isSymbolicLink())
      } catch {
        hasChildren = false
      }

      nodes.push({
        name: entry.name,
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

    if (isSupportedFile(entry.name)) {
      nodes.push({
        name: entry.name,
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
