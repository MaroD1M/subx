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

export interface MediaProbeInfo {
    duration: number
    subtitleTracks: TrackInfo[]
    audioTracks: TrackInfo[]
}

export const VideoService = {
    /**
     * Probe media streams for subtitles and audio tracks.
     */
    async probeMedia(filePath: string, rootId?: string | null): Promise<MediaProbeInfo> {
        const fullPath = await resolveMediaPath(filePath, rootId)
        console.log('[VideoService] Probing media for:', fullPath)

        return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(fullPath, (err, metadata) => {
                if (err) {
                    console.error('[VideoService] ffprobe error:', err)
                    return reject(err)
                }

                const streams = metadata.streams || []
                const subtitleTracks: TrackInfo[] = streams
                    .filter(s => s.codec_type === 'subtitle')
                    .map(s => ({
                        index: s.index ?? 0,
                        codec: s.codec_name ?? 'unknown',
                        language: s.tags?.language ?? 'und',
                        title: s.tags?.title ?? '',
                        isSupported: SUPPORTED_TEXT_CODECS.includes(s.codec_name ?? ''),
                        isDefault: Boolean((s as any).disposition?.default)
                    }))

                const audioTracks: TrackInfo[] = streams
                    .filter(s => s.codec_type === 'audio')
                    .map(s => ({
                        index: s.index ?? 0,
                        codec: s.codec_name ?? 'unknown',
                        language: s.tags?.language ?? 'und',
                        title: s.tags?.title ?? '',
                        channels: s.channels ?? 0,
                        sampleRate: Number(s.sample_rate || 0),
                        isDefault: Boolean((s as any).disposition?.default),
                        isSupported: true
                    }))

                resolve({
                    duration: Number(metadata.format?.duration || 0),
                    subtitleTracks,
                    audioTracks
                })
            })
        })
    },

    /**
     * Backward-compatible subtitle track probe.
     */
    async probeTracks(filePath: string, rootId?: string | null): Promise<TrackInfo[]> {
        const media = await this.probeMedia(filePath, rootId)
        return media.subtitleTracks
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
    },

    /**
     * Extract a short audio clip for subtitle review playback.
     */
    async extractAudioClip(videoFilePath: string, startSec: number, durationSec: number, outputPath: string, rootId?: string | null, audioTrackIndex?: number | null): Promise<string> {
        const fullPath = await resolveMediaPath(videoFilePath, rootId)
        return new Promise((resolve, reject) => {
            ffmpeg(fullPath)
                .seekInput(Math.max(0, startSec))
                .duration(Math.max(1, durationSec))
                .outputOptions([
                    audioTrackIndex != null ? `-map 0:${audioTrackIndex}` : '-map 0:a:0',
                    '-vn',
                    '-ac 1',
                    '-ar 16000',
                    '-c:a libmp3lame',
                    '-b:a 48k'
                ])
                .output(outputPath)
                .on('error', (err) => reject(err))
                .on('end', () => resolve(outputPath))
                .run()
        })
    },

    /**
     * Compress extracted audio for cloud ASR uploads.
     */
    async compressAudioForCloud(inputPath: string, outputPath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .outputOptions([
                    '-vn',
                    '-ac 1',
                    '-ar 16000',
                    '-c:a libmp3lame',
                    '-b:a 32k'
                ])
                .output(outputPath)
                .on('error', (err) => reject(err))
                .on('end', () => resolve(outputPath))
                .run()
        })
    },

    /**
     * Extract a single audio stream as 16kHz mono PCM WAV for ASR.
     */
    async extractAudio(videoFilePath: string, audioTrackIndex: number, outputPath: string, rootId?: string | null): Promise<string> {
        const fullPath = await resolveMediaPath(videoFilePath, rootId)

        return new Promise((resolve, reject) => {
            ffmpeg(fullPath)
                .outputOptions([
                    `-map 0:${audioTrackIndex}`,
                    '-vn',
                    '-ac 1',
                    '-ar 16000',
                    '-c:a pcm_s16le'
                ])
                .output(outputPath)
                .on('error', (err) => reject(err))
                .on('end', () => resolve(outputPath))
                .run()
        })
    }
}
