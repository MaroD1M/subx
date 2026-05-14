import { readdir, stat } from 'fs/promises'
import { join, relative, resolve, normalize } from 'path'
import type { FileNode } from '~~/types'

const SUPPORTED_EXTENSIONS = ['.mkv', '.mp4', '.avi', '.webm', '.ts', '.srt', '.ass', '.ssa', '.vtt']

let cachedFiles: FileNode[] | null = null
let cacheTimestamp = 0
const CACHE_TTL = 30000

export default defineEventHandler(async () => {
    const now = Date.now()
    if (cachedFiles && now - cacheTimestamp < CACHE_TTL) {
        return cachedFiles
    }

    const videoDir = process.env.VIDEO_DIR || '/data'

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
                    if (children.length > 0) {
                        nodes.push({
                            name: item,
                            path: relative(videoDir, fullPath),
                            isDir: true,
                            children: children
                        })
                    }
                } else if (SUPPORTED_EXTENSIONS.includes(ext)) {
                    const relPath = relative(videoDir, fullPath)
                    const resolved = normalize(resolve(videoDir, relPath))
                    const normalizedVideoDir = normalize(resolve(videoDir))
                    if (resolved.startsWith(normalizedVideoDir + '/') || resolved.startsWith(normalizedVideoDir + '\\') || resolved === normalizedVideoDir) {
                        nodes.push({
                            name: item,
                            path: relPath,
                            isDir: false
                        })
                    }
                }
            }

            return nodes
        } catch (e) {
            console.error('Scan failed:', e)
            return []
        }
    }

    cachedFiles = await scan(videoDir)
    cacheTimestamp = now
    return cachedFiles
})
