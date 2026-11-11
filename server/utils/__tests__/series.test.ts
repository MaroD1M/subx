import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  inferSeriesTitle,
  resolveSeriesTranslationContext,
  SeriesService,
  seriesKeyFromPath
} from '../series'
import { useDb } from '../db'

let workDir = ''
const originalDbPath = process.env.DB_PATH

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'subx-series-'))
  process.env.DB_PATH = join(workDir, 'subx.db')
})

afterAll(() => {
  try { useDb().close() } catch { /* ignore */ }
  if (originalDbPath === undefined) delete process.env.DB_PATH
  else process.env.DB_PATH = originalDbPath
  rmSync(workDir, { recursive: true, force: true })
})

describe('seriesKeyFromPath', () => {
  it('groups different episode markers from the same series', () => {
    const base = '/media/Anime/My Show/My.Show.S01E01.mkv'
    const key = seriesKeyFromPath(base)
    expect(key).toBeTruthy()
    expect(seriesKeyFromPath('/media/Anime/My Show/My.Show.S01E02.mkv')).toBe(key)
    expect(seriesKeyFromPath('/media/Anime/My Show/My.Show.E03.mkv')).toBe(key)
    expect(seriesKeyFromPath('/media/Anime/My Show/My.Show.EP04.mkv')).toBe(key)
    expect(seriesKeyFromPath('/media/Anime/My Show/My.Show.第05集.mkv')).toBe(key)
  })

  it('groups episodes across season directories', () => {
    expect(seriesKeyFromPath('/tv/Show/Season 1/Show.S01E01.mkv'))
      .toBe(seriesKeyFromPath('/tv/Show/Season 2/Show.S02E01.mkv'))
  })

  it('separates different series and roots', () => {
    const file = '/media/Anime/My Show/My.Show.S01E01.mkv'
    expect(seriesKeyFromPath(file)).not.toBe(seriesKeyFromPath('/media/Anime/Other Show/My.Show.S01E01.mkv'))
    expect(seriesKeyFromPath(file, 'root-a')).not.toBe(seriesKeyFromPath(file, 'root-b'))
  })

  it('normalizes path separators and keeps movie paths stable', () => {
    expect(seriesKeyFromPath('C:\\media\\Show\\Show.S01E01.mkv'))
      .toBe(seriesKeyFromPath('C:/media/Show/Show.S01E01.mkv'))
    const movie = seriesKeyFromPath('/movies/Inception.2010.mkv', 'root-1')
    expect(movie).toBeTruthy()
    expect(seriesKeyFromPath('/movies/Inception.2010.mkv', 'root-1')).toBe(movie)
  })
})

describe('inferSeriesTitle', () => {
  it('strips common episode markers', () => {
    expect(inferSeriesTitle('/tv/My.Show.S01E01.mkv')).toBe('My Show')
    expect(inferSeriesTitle('/tv/My.Show.E02.mkv')).toBe('My Show')
    expect(inferSeriesTitle('/tv/My.Show.EP03.mkv')).toBe('My Show')
    expect(inferSeriesTitle('/tv/剧名.第03集.mkv')).toBe('剧名')
    expect(inferSeriesTitle('/tv/剧名.第04话.mkv')).toBe('剧名')
    expect(inferSeriesTitle('/tv/剧名.第05話.mkv')).toBe('剧名')
  })
})

describe('resolveSeriesTranslationContext', () => {
  const profile = {
    seriesKey: 'series-key',
    title: '系列标题',
    background: '系列背景',
    glossary: { shared: '系列术语', seriesOnly: '仅系列' },
    summary: '系列摘要'
  }

  it('merges glossary with the series taking precedence', () => {
    const resolved = resolveSeriesTranslationContext(
      { contentTitle: '', contentBackground: '', customInstructions: '保留人名' },
      { shared: '全局术语', globalOnly: '仅全局' },
      profile
    )
    expect(resolved.glossary).toEqual({
      shared: '系列术语',
      globalOnly: '仅全局',
      seriesOnly: '仅系列'
    })
    expect(resolved.title).toBe('系列标题')
    expect(resolved.background).toContain('系列背景')
    expect(resolved.background).toContain('系列摘要')
    expect(resolved.instructions).toBe('保留人名')
  })

  it('prefers task fields over the profile', () => {
    const resolved = resolveSeriesTranslationContext(
      { contentTitle: '任务标题', contentBackground: '任务背景', customInstructions: '' },
      {},
      profile
    )
    expect(resolved.title).toBe('任务标题')
    expect(resolved.background.startsWith('任务背景')).toBe(true)
    expect(resolved.background).toContain('系列摘要')
  })
})

describe('SeriesService', () => {
  it('saves, updates and lists series profiles', () => {
    const first = SeriesService.saveProfile({
      rootId: 'root-1',
      filePath: '/media/Show/Show.S01E01.mkv',
      background: '背景资料',
      glossary: { '   ': 'dropped', term: 'term-value' }
    })

    expect(first.seriesKey).toBe(seriesKeyFromPath('/media/Show/Show.S01E01.mkv', 'root-1'))
    expect(first.title).toBe('Show')
    expect(first.glossary).toEqual({ term: 'term-value' })

    const sameSeries = SeriesService.getProfile('root-1', '/media/Show/Show.S01E02.mkv')
    expect(sameSeries?.background).toBe('背景资料')
    expect(SeriesService.ensureProfile('root-1', '/media/Show/Show.S01E03.mkv').seriesKey).toBe(first.seriesKey)

    const updated = SeriesService.updateFromTask('root-1', '/media/Show/Show.S01E01.mkv', 'task-9', '新标题', '')
    expect(updated.title).toBe('新标题')
    expect(updated.background).toBe('背景资料')
    expect(updated.lastTaskId).toBe('task-9')

    const patched = SeriesService.saveProfile({ seriesKey: first.seriesKey, title: '新标题', summary: '摘要' })
    expect(patched.title).toBe('新标题')
    expect(patched.summary).toBe('摘要')
    expect(SeriesService.listProfiles().some(profile => profile.seriesKey === first.seriesKey)).toBe(true)
  })

  it('caps glossary entries at 200', () => {
    const glossary: Record<string, string> = {}
    for (let index = 0; index < 250; index += 1) {
      glossary[`key-${index}`] = `value-${index}`
    }
    const profile = SeriesService.saveProfile({
      rootId: 'root-cap',
      filePath: '/media/Cap/Cap.E01.mkv',
      glossary
    })
    expect(Object.keys(profile.glossary)).toHaveLength(200)
  })
})
