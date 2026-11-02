import { createHash } from 'crypto'
import { existsSync, mkdirSync, renameSync, rmSync, statSync } from 'fs'
import { join, sep } from 'path'
import { resolveMediaPath } from '../mediaRoots'
import { VideoService } from '../video'

export type AudioProgressCallback = (progress: number, message: string) => void

export function getAsrAudioCacheDir() {
  return join(process.cwd(), 'temp', 'asr-audio')
}

function cacheKey(fullPath: string, size: number, mtimeMs: number, trackIndex: number) {
  return createHash('sha256')
    .update(`${fullPath}|${size}|${Math.floor(mtimeMs)}|${trackIndex}`)
    .digest('hex')
    .slice(0, 32)
}

/**
 * Extract a 16kHz mono WAV once and reuse it across retries of the same media
 * file/audio track. The cache key includes file size and mtime so replacing the
 * source video invalidates it automatically.
 */
export async function extractAudioCached(
  videoFilePath: string,
  audioTrackIndex: number,
  rootId?: string | null,
  onProgress?: AudioProgressCallback
): Promise<string> {
  const fullPath = await resolveMediaPath(videoFilePath, rootId)
  const sourceStat = statSync(fullPath)
  const outputPath = join(
    getAsrAudioCacheDir(),
    `${cacheKey(fullPath, sourceStat.size, sourceStat.mtimeMs, audioTrackIndex)}.wav`
  )

  if (existsSync(outputPath)) {
    try {
      if (statSync(outputPath).size > 44) {
        onProgress?.(100, '已复用上次提取的音频')
        return outputPath
      }
    } catch { /* treat unreadable cache as missing */ }
    rmSync(outputPath, { force: true })
  }

  mkdirSync(getAsrAudioCacheDir(), { recursive: true })
  const partialPath = `${outputPath}.${process.pid}.${Date.now()}.partial.wav`
  try {
    await VideoService.extractAudio(videoFilePath, audioTrackIndex, partialPath, rootId, onProgress)
    if (statSync(partialPath).size <= 44) {
      throw new Error('提取的音频为空')
    }
    renameSync(partialPath, outputPath)
    onProgress?.(100, '音频提取完成')
    return outputPath
  } catch (error) {
    rmSync(partialPath, { force: true })
    throw error
  }
}

export function removeCachedAudio(audioPath?: string | null) {
  if (!audioPath) return
  if (!audioPath.startsWith(`${getAsrAudioCacheDir()}${sep}`)) return
  try {
    rmSync(audioPath, { force: true })
  } catch { /* ignore cache cleanup failures */ }
}
