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
    width: number
    height: number
    fps: number
    subtitleTracks: TrackInfo[]
    audioTracks: TrackInfo[]
}

function parseFrameRate(value: unknown): number {
    const match = String(value || '').match(/^(\d+)(?:\/(\d+))?$/)
    if (!match) return 0
    const numerator = Number(match[1])
    const denominator = match[2] ? Number(match[2]) : 1
    if (!denominator || !Number.isFinite(numerator / denominator)) return 0
    return Math.round((numerator / denominator) * 1000) / 1000
}

function readRotation(stream: any): number {
    const sideDataRotation = Array.isArray(stream?.side_data_list)
        ? Number(stream.side_data_list.find((item: any) => item?.rotation != null)?.rotation)
        : 0
    const tagRotation = Number(stream?.tags?.rotate)
    return Number.isFinite(sideDataRotation) && sideDataRotation !== 0
        ? sideDataRotation
        : (Number.isFinite(tagRotation) ? tagRotation : 0)
}

const VIDEO_EXTRACT_TIMEOUT_MS = 2 * 60 * 60 * 1000

function guardMediaCommand(command: any, label: string, reject: (error: Error) => void) {
    let settled = false
    const timer = setTimeout(() => {
        if (settled) return
        settled = true
        try { command.kill('SIGKILL') } catch { /* ignore kill failure */ }
        reject(new Error(`${label}超时`))
    }, VIDEO_EXTRACT_TIMEOUT_MS)
    return () => {
        settled = true
        clearTimeout(timer)
    }
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
                const videoStream = streams.find(stream => stream.codec_type === 'video') as any
                const rotation = videoStream ? readRotation(videoStream) : 0
                const rotated = Math.abs(rotation) % 180 === 90
                const rawWidth = Number(videoStream?.width || 0)
                const rawHeight = Number(videoStream?.height || 0)
                const width = rotated ? rawHeight : rawWidth
                const height = rotated ? rawWidth : rawHeight
                const subtitleTracks: TrackInfo[] = streams
                    .filter(s => s.codec_type === 'subtitle')
                    .map(s => ({
                        index: s.index ?? 0,
                        codec: s.codec_name ?? 'unknown',
                        language: s.tags?.language ?? 'und',
                        title: s.tags?.title ?? '',
                        isSupported: SUPPORTED_TEXT_CODECS.includes(s.codec_name ?? ''),
                        isDefault: Boolean((s as any).disposition?.default),
                        isForced: Boolean((s as any).disposition?.forced)
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
                    width: Number.isFinite(width) ? width : 0,
                    height: Number.isFinite(height) ? height : 0,
                    fps: parseFrameRate(videoStream?.avg_frame_rate || videoStream?.r_frame_rate),
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
            const command = ffmpeg(fullPath)
                .outputOptions([`-map 0:${trackIndex}`, '-c:s srt'])
                .output(outputPath)
            const cleanup = guardMediaCommand(command, '字幕提取', reject)
            command
                .on('error', (err) => { cleanup(); reject(err) })
                .on('end', () => { cleanup(); resolve(outputPath) })
                .run()
        })
    },

    /**
     * Extract a short audio clip for subtitle review playback.
     */
    async extractAudioClip(videoFilePath: string, startSec: number, durationSec: number, outputPath: string, rootId?: string | null, audioTrackIndex?: number | null): Promise<string> {
        const fullPath = await resolveMediaPath(videoFilePath, rootId)
        return new Promise((resolve, reject) => {
            const command = ffmpeg(fullPath)
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
            const cleanup = guardMediaCommand(command, '音频片段提取', reject)
            command
                .on('error', (err) => { cleanup(); reject(err) })
                .on('end', () => { cleanup(); resolve(outputPath) })
                .run()
        })
    },

    /**
     * Compress extracted audio for cloud ASR uploads.
     */
    async compressAudioForCloud(inputPath: string, outputPath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const command = ffmpeg(inputPath)
                .outputOptions([
                    '-vn',
                    '-ac 1',
                    '-ar 16000',
                    '-c:a libmp3lame',
                    '-b:a 32k'
                ])
                .output(outputPath)
            const cleanup = guardMediaCommand(command, '音频压缩', reject)
            command
                .on('error', (err) => { cleanup(); reject(err) })
                .on('end', () => { cleanup(); resolve(outputPath) })
                .run()
        })
    },

    /**
     * Extract a single audio stream as 16kHz mono PCM WAV for ASR.
     */
    async extractAudio(
        videoFilePath: string,
        audioTrackIndex: number,
        outputPath: string,
        rootId?: string | null,
        onProgress?: (progress: number, message: string) => void
    ): Promise<string> {
        const fullPath = await resolveMediaPath(videoFilePath, rootId)

        return new Promise((resolve, reject) => {
            let lastPercent = -1
            const report = (value: number, message: string) => {
                const percent = Math.max(0, Math.min(100, Math.round(value)))
                if (percent === lastPercent) return
                lastPercent = percent
                try { onProgress?.(percent, message) } catch { /* progress must not break extraction */ }
            }
            report(0, '正在提取音频...')
            const command = ffmpeg(fullPath)
                .outputOptions([
                    `-map 0:${audioTrackIndex}`,
                    '-vn',
                    '-ac 1',
                    '-ar 16000',
                    '-c:a pcm_s16le'
                ])
                .output(outputPath)
            const cleanup = guardMediaCommand(command, '音频提取', reject)
            command
                .on('progress', (progress: any) => {
                    const percent = Number(progress?.percent)
                    if (!Number.isFinite(percent)) return
                    report(percent, `正在提取音频 ${Math.floor(percent)}%`)
                })
                .on('error', (err) => { cleanup(); reject(err) })
                .on('end', () => {
                    cleanup()
                    report(100, '音频提取完成')
                    resolve(outputPath)
                })
                .run()
        })
    }
}
