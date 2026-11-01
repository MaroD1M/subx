import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WATCH_OUTPUT_POLICY,
  buildDedupeKey,
  evaluateWatchCandidate,
  isIgnoredRelativePath,
  sanitizeOutputPolicy,
  sanitizeWatchRules
} from '../watchRules'

const now = Date.parse('2026-10-31T12:00:00Z')
const oldMtime = now - 60_000
const baseInput = {
  relativePath: 'Movies/Example.Movie.2024.mkv',
  size: 1024 * 1024 * 800,
  mtimeMs: oldMtime,
  createdMs: oldMtime,
  now,
  siblingNames: ['Example.Movie.2024.mkv'],
  rules: sanitizeWatchRules({ stableSeconds: 10 }),
  policy: sanitizeOutputPolicy({ targetLanguage: 'zh-CN', subtitleFormat: 'srt' })
}

describe('watch rules', () => {
  it('accepts a stable supported video with no existing subtitle', () => {
    const result = evaluateWatchCandidate(baseInput)
    expect(result.accepted).toBe(true)
    expect(result.dedupeKey).toHaveLength(64)
  })

  it('ignores temporary files and SubX output folders', () => {
    expect(isIgnoredRelativePath('Movies/Example.mkv.part')).toBe(true)
    expect(isIgnoredRelativePath('Movies/.hidden/Example.mkv')).toBe(true)
    expect(isIgnoredRelativePath('Movies/SubX/Example.mkv')).toBe(true)
    expect(isIgnoredRelativePath('Movies/Example.mkv')).toBe(false)
  })

  it('rejects unsupported extensions and unstable files', () => {
    expect(evaluateWatchCandidate({ ...baseInput, relativePath: 'Movies/Example.txt' }).accepted).toBe(false)
    const unstable = evaluateWatchCandidate({ ...baseInput, mtimeMs: now - 1000 })
    expect(unstable.accepted).toBe(false)
    expect(unstable.reason).toBe('文件尚未稳定')
  })

  it('applies size and regex filters', () => {
    const rules = sanitizeWatchRules({ minSizeMb: 1000, stableSeconds: 0 })
    expect(evaluateWatchCandidate({ ...baseInput, rules }).reason).toBe('文件小于最小体积')
    const include = sanitizeWatchRules({ includeRegex: 'S02', stableSeconds: 0 })
    expect(evaluateWatchCandidate({ ...baseInput, rules: include }).reason).toBe('不匹配包含规则')
    const exclude = sanitizeWatchRules({ excludeRegex: '2024', stableSeconds: 0 })
    expect(evaluateWatchCandidate({ ...baseInput, rules: exclude }).reason).toBe('匹配排除规则')
  })

  it('skips existing subtitles and target output', () => {
    expect(evaluateWatchCandidate({
      ...baseInput,
      siblingNames: ['Example.Movie.2024.mkv', 'Example.Movie.2024.en.srt']
    }).reason).toBe('已存在同名字幕')

    expect(evaluateWatchCandidate({
      ...baseInput,
      siblingNames: ['Example.Movie.2024.mkv', 'Example.Movie.2024.zh-CN.srt']
    }).reason).toBe('已存在目标输出字幕')
  })

  it('allows explicitly disabling subtitle and output skipping', () => {
    const rules = sanitizeWatchRules({ skipExistingSubtitles: false, skipExistingOutput: false, stableSeconds: 0 })
    expect(evaluateWatchCandidate({
      ...baseInput,
      rules,
      siblingNames: ['Example.Movie.2024.mkv', 'Example.Movie.2024.zh-CN.srt']
    }).accepted).toBe(true)
  })

  it('enforces created and modified time boundaries', () => {
    const rules = sanitizeWatchRules({ createdAfter: '2026-11-01T00:00:00Z', stableSeconds: 0 })
    expect(evaluateWatchCandidate({ ...baseInput, rules }).reason).toBe('创建时间早于起始范围')
  })

  it('normalizes invalid rule values and rejects invalid regex', () => {
    const rules = sanitizeWatchRules({ extensions: ['mkv', '.MP4'], stableSeconds: -10, minSizeMb: 'x' })
    expect(rules.extensions).toEqual(['.mkv', '.mp4'])
    expect(rules.stableSeconds).toBe(0)
    expect(rules.minSizeMb).toBe(0)
    expect(() => sanitizeWatchRules({ includeRegex: '[' })).toThrow('合法')
  })

  it('builds stable dedupe keys from path, size and mtime', () => {
    const first = buildDedupeKey('Movies/A.mkv', 10, 1234)
    const second = buildDedupeKey('Movies/A.mkv', 10, 1234)
    const changed = buildDedupeKey('Movies/A.mkv', 11, 1234)
    expect(first).toBe(second)
    expect(first).not.toBe(changed)
  })

  it('provides safe output policy defaults', () => {
    expect(sanitizeOutputPolicy({ outputMode: 'bad', subtitleFormat: 'bad', notifyChannelIds: [1, 1, -1, '2'] })).toEqual({
      ...DEFAULT_WATCH_OUTPUT_POLICY,
      notifyChannelIds: [1, 2]
    })
  })
})
