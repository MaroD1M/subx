import { describe, expect, it } from 'vitest'
import { dedupeBatchEntries, episodeGroupKey, isSubtitleFile, isVideoFile } from '../fileScan'

describe('file scan helpers', () => {
  it('recognizes media extensions', () => {
    expect(isVideoFile('Show.S01E01.mkv')).toBe(true)
    expect(isVideoFile('Show.S01E01.MP4')).toBe(true)
    expect(isVideoFile('Show.S01E01.zh-CN.ass')).toBe(false)
    expect(isSubtitleFile('Show.S01E01.zh-CN.ass')).toBe(true)
  })

  it('groups common episode naming variants', () => {
    expect(episodeGroupKey('Shows/Demo Show/Demo.Show.S01E01.1080p.mkv'))
      .toBe(episodeGroupKey('Shows/Demo Show/Demo Show - S01E01 - WEB-DL.mp4'))
    expect(episodeGroupKey('Shows/Demo Show/Demo.Show.E02.mkv')).toContain('::e0002')
    expect(episodeGroupKey('Shows/Demo Show/动画 第03集.mkv')).toContain('::e0003')
  })

  it('does not group movies without episode markers', () => {
    expect(episodeGroupKey('Movies/Example.Movie.2024.mkv')).toBe('')
  })

  it('keeps the largest episode version and preserves subtitles', async () => {
    const files = [
      { path: 'Shows/Demo.S01E01.HDTV.mkv', rootId: 'default' },
      { path: 'Shows/Demo.S01E01.WEB.mp4', rootId: 'default' },
      { path: 'Shows/Demo.S01E02.mkv', rootId: 'default' },
      { path: 'Shows/Demo.S01E01.zh-CN.srt', rootId: 'default' }
    ]
    const sizes: Record<string, number> = {
      'Shows/Demo.S01E01.HDTV.mkv': 100,
      'Shows/Demo.S01E01.WEB.mp4': 500,
      'Shows/Demo.S01E02.mkv': 300
    }
    const result = await dedupeBatchEntries(files, async entry => sizes[entry.path] || 0)
    expect(result.files.map(entry => entry.path)).toContain('Shows/Demo.S01E01.WEB.mp4')
    expect(result.files.map(entry => entry.path)).not.toContain('Shows/Demo.S01E01.HDTV.mkv')
    expect(result.files.map(entry => entry.path)).toContain('Shows/Demo.S01E01.zh-CN.srt')
    expect(result.skipped).toHaveLength(1)
    expect(result.duplicateGroups).toBe(1)
  })

  it('does not dedupe the same episode across different roots', async () => {
    const files = [
      { path: 'Shows/Demo.S01E01.mkv', rootId: 'root-a' },
      { path: 'Shows/Demo.S01E01.mkv', rootId: 'root-b' }
    ]
    const result = await dedupeBatchEntries(files, async () => 100)
    expect(result.files).toHaveLength(2)
    expect(result.skipped).toHaveLength(0)
  })
})
