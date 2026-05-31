import { readdir, stat, access } from 'fs/promises'
import { constants } from 'fs'
import { join, relative, resolve, normalize } from 'path'
import type { FileNode } from '~~/types'

const SUPPORTED_EXTENSIONS = ['.mkv', '.mp4', '.avi', '.webm', '.ts', '.srt', '.ass', '.ssa', '.vtt']

export default defineEventHandler(async () => {
    const videoDir = process.env.VIDEO_DIR || '/data'
    const normalizedVideoDir = normalize(resolve(videoDir))

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
                        path: relative(normalizedVideoDir, fullPath),
                        isDir: true,
                        children
                    })
                } else if (SUPPORTED_EXTENSIONS.includes(ext)) {
                    const relPath = relative(normalizedVideoDir, fullPath)
                    const resolved = normalize(resolve(normalizedVideoDir, relPath))
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
            console.error('Scan failed:', dir, e)
            return []
        }
    }

    return scan(normalizedVideoDir)
})
