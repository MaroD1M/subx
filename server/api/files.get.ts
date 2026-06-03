import { readdir, stat, access } from 'fs/promises'
import { constants } from 'fs'
import { join, relative, resolve, normalize } from 'path'
import type { FileNode, MediaRoot } from '~~/types'
import { getMediaRoot, getMediaRoots } from '../utils/mediaRoots'

const SUPPORTED_EXTENSIONS = ['.mkv', '.mp4', '.avi', '.webm', '.ts', '.srt', '.ass', '.ssa', '.vtt']

async function scanRoot(root: MediaRoot): Promise<FileNode[]> {
  const normalizedVideoDir = normalize(resolve(root.path))

  try {
    await access(normalizedVideoDir, constants.R_OK)
  } catch (e: any) {
    throw createError({
      statusCode: 500,
      message: `视频目录不可读: ${normalizedVideoDir}，请检查挂载路径和权限 (${e?.code || 'UNKNOWN'})`
    })
  }

  async function scan(dir: string): Promise<FileNode[]> {
    try {
      const items = await readdir(dir)
      const nodes: FileNode[] = []

      for (const item of items) {
        if (item.startsWith('.')) continue
        const fullPath = join(dir, item)
        const stats = await stat(fullPath)
        const isDir = stats.isDirectory()
        const ext = item.substring(item.lastIndexOf('.')).toLowerCase()

        if (isDir) {
          const children = await scan(fullPath)
          nodes.push({
            name: item,
            path: relative(normalizedVideoDir, fullPath).replaceAll('\\', '/'),
            isDir: true,
            children,
            rootId: root.id,
            rootName: root.name
          })
        } else if (SUPPORTED_EXTENSIONS.includes(ext)) {
          const relPath = relative(normalizedVideoDir, fullPath).replaceAll('\\', '/')
          const resolved = normalize(resolve(normalizedVideoDir, relPath))
          if (resolved.startsWith(normalizedVideoDir + '/') || resolved.startsWith(normalizedVideoDir + '\\') || resolved === normalizedVideoDir) {
            nodes.push({
              name: item,
              path: relPath,
              isDir: false,
              rootId: root.id,
              rootName: root.name
            })
          }
        }
      }

      return nodes
    } catch (e) {
      console.error('Scan failed:', dir, e)
      return []
    }
  }

  return scan(normalizedVideoDir)
}

export default defineEventHandler(async (event) => {
  const { rootId } = getQuery(event) as { rootId?: string }

  if (rootId) {
    const root = await getMediaRoot(rootId)
    return scanRoot(root)
  }

  const roots = await getMediaRoots()
  const scanned = await Promise.all(roots.map(scanRoot))

  return scanned.map((children, index) => ({
    name: roots[index].name,
    path: '',
    isDir: true,
    children,
    rootId: roots[index].id,
    rootName: roots[index].name
  }))
})
