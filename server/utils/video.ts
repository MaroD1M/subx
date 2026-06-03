import ffmpeg from 'fluent-ffmpeg'

import type { TrackInfo } from '../../types'
import { resolveMediaPath } from './mediaRoots'

const SUPPORTED_TEXT_CODECS = ['subrip', 'srt', 'ass', 'ssa', 'webvtt', 'mov_text']

// 针对 Windows 环境下可能找不到 ffprobe 的情况进行配置
// 如果环境变量中没有设置，尝试默认路径
if (process.platform === 'win32') {
    if (process.env.FFMPEG_PATH) {
        console.log('[VideoService] Setting FFmpeg path:', process.env.FFMPEG_PATH)
        ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH)
    }
    if (process.env.FFPROBE_PATH) {
        console.log('[VideoService] Setting ffprobe path:', process.env.FFPROBE_PATH)
        ffmpeg.setFfprobePath(process.env.FFPROBE_PATH)
    }
}

export const VideoService = {
    /**
     * Probe subtitle tracks for a video file
     */
    async probeTracks(filePath: string, rootId?: string | null): Promise<TrackInfo[]> {
        const fullPath = await resolveMediaPath(filePath, rootId)
        console.log('[VideoService] Probing tracks for:', fullPath)

        return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(fullPath, (err, metadata) => {
                if (err) {
                    console.error('[VideoService] ffprobe error:', err)
                    return reject(err)
                }

                const subtitleStreams = metadata.streams.filter(s => s.codec_type === 'subtitle')
                const tracks: TrackInfo[] = subtitleStreams.map(s => ({
                    index: s.index ?? 0,
                    codec: s.codec_name ?? 'unknown',
                    language: s.tags?.language ?? 'und',
                    title: s.tags?.title ?? '',
                    isSupported: SUPPORTED_TEXT_CODECS.includes(s.codec_name ?? '')
                }))

                resolve(tracks)
            })
        })
    },

    /**
     * Extract subtitle track as SRT
     */
    async extractSubtitle(videoFilePath: string, trackIndex: number, outputPath: string, rootId?: string | null): Promise<string> {
        const fullPath = await resolveMediaPath(videoFilePath, rootId)

        return new Promise((resolve, reject) => {
            ffmpeg(fullPath)
                .outputOptions([`-map 0:${trackIndex}`, '-c:s srt'])
                .output(outputPath)
                .on('error', (err) => reject(err))
                .on('end', () => resolve(outputPath))
                .run()
        })
    }
}
