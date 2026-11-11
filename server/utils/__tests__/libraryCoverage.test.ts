import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  buildLibraryCoverage,
  clearLibraryCoverageCache,
  deriveCoverageStatus,
  deriveSeriesKey,
  deriveSeriesLabel,
  deriveSeriesTitle
} from '../libraryCoverage'

const mockState = vi.hoisted(() => ({
  rootPath: '',
  targetLanguage: 'zh-CN',
  files: [] as Array<{
    name: string
    path: string
    isDir: false
    rootId: string
    rootName: string
    size: number
  }>,
  tasks: [] as any[]
}))

vi.mock('../fileScan', () => ({
  scanMediaFolder: vi.fn(async (rootId: string) => ({
    rootId,
    rootName: 'Test Root',
    path: '',
    files: mockState.files,
    total: mockState.files.length,
    truncated: false
  }))
}))

vi.mock('../mediaRoots', () => ({
  getMediaRoot: vi.fn(async (rootId: string) => ({
    id: rootId,
    name: 'Test Root',
    path: mockState.rootPath,
    enabled: true,
    order: 0,
    isDefault: true
  }))
}))

vi.mock('../config', () => ({
  ConfigService: {
    getConfig: vi.fn(async () => ({ targetLanguage: mockState.targetLanguage }))
  }
}))

vi.mock('../db', () => ({
  useDb: vi.fn(() => ({
    prepare: vi.fn(() => ({
      all: vi.fn(() => mockState.tasks)
    }))
  }))
}))

let workDir = ''

function videoEntry(path: string) {
  return {
    name: path.split('/').pop() || path,
    path,
    isDir: false as const,
    rootId: 'root-1',
    rootName: 'Test Root',
    size: 100
  }
}

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'subx-coverage-'))
})

beforeEach(() => {
  mockState.rootPath = workDir
  mockState.targetLanguage = 'zh-CN'
  mockState.files = []
  mockState.tasks = []
  clearLibraryCoverageCache()
})

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true })
})

describe('deriveCoverageStatus', () => {
  it('maps missing tasks and subtitles', () => {
    expect(deriveCoverageStatus(null, true)).toBe('done')
    expect(deriveCoverageStatus(undefined, false)).toBe('missing')
  })

  it('maps done tasks based on subtitle presence', () => {
    expect(deriveCoverageStatus({ status: 'done' }, true)).toBe('done')
    expect(deriveCoverageStatus({ status: 'done' }, false)).toBe('missing')
    expect(deriveCoverageStatus('done', false)).toBe('missing')
  })

  it('maps review, processing and failed statuses', () => {
    expect(deriveCoverageStatus({ status: 'review' }, false)).toBe('review')
    for (const status of [
      'queued',
      'probing',
      'extracting',
      'extracting_audio',
      'transcribing',
      'ocr',
      'parsing',
      'translating',
      'exporting',
      'paused'
    ]) {
      expect(deriveCoverageStatus({ status }, false)).toBe('processing')
    }
    expect(deriveCoverageStatus({ status: 'error' }, true)).toBe('failed')
    expect(deriveCoverageStatus({ status: 'cancelled' }, true)).toBe('failed')
  })
})

describe('series derivation', () => {
  it('groups episodes in the same directory with one key', () => {
    const key = deriveSeriesKey('Shows/Demo Show/Demo.Show.S01E01.mkv')
    expect(deriveSeriesKey('Shows/Demo Show/Demo.Show.S01E02.mkv')).toBe(key)
    expect(deriveSeriesKey('Shows\\Demo Show\\Demo.Show.E03.mkv')).toBe(key)
    expect(deriveSeriesKey('Shows/Other Show/Demo.Show.S01E01.mkv')).not.toBe(key)
  })

  it('derives readable series labels', () => {
    expect(deriveSeriesTitle('Shows/Demo Show/Demo.Show.S01E01.mkv')).toBe('Demo Show')
    expect(deriveSeriesLabel('Shows/Demo Show/Demo.Show.S01E01.mkv')).toBe('Demo Show')
    expect(deriveSeriesLabel('Demo.Show.S01E01.mkv')).toBe('Demo Show')
    expect(deriveSeriesLabel('Shows/Demo Show/Season 1/Demo.Show.S01E01.mkv')).toBe('Demo Show')
  })
})

describe('buildLibraryCoverage', () => {
  it('detects subtitles, uses the latest task and includes task info', async () => {
    const directory = join(workDir, 'Shows', 'Demo Show')
    mkdirSync(join(directory, 'SubX'), { recursive: true })
    writeFileSync(join(directory, 'Demo.Show.S01E01.mkv'), '')
    writeFileSync(join(directory, 'Demo.Show.S01E01.srt'), '')
    writeFileSync(join(directory, 'Demo.Show.S01E02.mkv'), '')
    writeFileSync(join(directory, 'SubX', 'Demo.Show.S01E02.zh-CN.ass'), '')
    writeFileSync(join(directory, 'Demo.Show.S01E03.mkv'), '')

    mockState.files = [
      videoEntry('Shows/Demo Show/Demo.Show.S01E01.mkv'),
      videoEntry('Shows/Demo Show/Demo.Show.S01E02.mkv'),
      videoEntry('Shows/Demo Show/Demo.Show.S01E03.mkv')
    ]
    mockState.tasks = [
      {
        task_id: 'old',
        file_path: 'Shows/Demo Show/Demo.Show.S01E01.mkv',
        target_lang: 'zh-CN',
        status: 'error',
        created_at: '2024-01-01 00:00:00',
        updated_at: '2024-01-01 00:00:00'
      },
      {
        task_id: 'new',
        file_path: 'Shows/Demo Show/Demo.Show.S01E01.mkv',
        target_lang: 'zh-CN',
        status: 'done',
        created_at: '2024-02-01 00:00:00',
        updated_at: '2024-02-01 00:00:00'
      },
      {
        task_id: 'review-1',
        file_path: 'Shows/Demo Show/Demo.Show.S01E02.mkv',
        target_lang: 'zh-CN',
        status: 'review',
        created_at: '2024-02-02 00:00:00',
        updated_at: '2024-02-02 00:00:00'
      },
      {
        task_id: 'done-missing',
        file_path: 'Shows/Demo Show/Demo.Show.S01E03.mkv',
        target_lang: 'zh-CN',
        status: 'done',
        created_at: '2024-02-03 00:00:00',
        updated_at: '2024-02-03 00:00:00'
      }
    ]

    const result = await buildLibraryCoverage('root-1')

    expect(result.rootId).toBe('root-1')
    expect(result.rootName).toBe('Test Root')
    expect(result.targetLanguage).toBe('zh-CN')
    expect(result.scanned).toBe(3)
    expect(result.summary).toEqual({
      total: 3,
      done: 1,
      review: 1,
      processing: 0,
      failed: 0,
      missing: 1
    })
    expect(result.series).toHaveLength(1)
    expect(result.series[0]!.seriesTitle).toBe('Demo Show')

    const [first, second, third] = result.files
    expect(first!.status).toBe('done')
    expect(first!.taskId).toBe('new')
    expect(first!.subtitlePath).toBe('Shows/Demo Show/Demo.Show.S01E01.srt')
    expect(second!.status).toBe('review')
    expect(second!.subtitlePath).toBe('Shows/Demo Show/SubX/Demo.Show.S01E02.zh-CN.ass')
    expect(third!.status).toBe('missing')
    expect(third!.taskId).toBe('done-missing')
    expect(third!.taskStatus).toBe('done')
    expect(third!.subtitlePath).toBeUndefined()
  })

  it('caches results and refreshes on request', async () => {
    const directory = join(workDir, 'Movies')
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'Example.Movie.mkv'), '')

    mockState.files = [videoEntry('Movies/Example.Movie.mkv')]

    const first = await buildLibraryCoverage('root-cache')
    expect(first.files[0]!.status).toBe('missing')

    mockState.tasks = [{
      task_id: 'review-cache',
      file_path: 'Movies/Example.Movie.mkv',
      target_lang: 'zh-CN',
      status: 'review',
      created_at: '2024-03-01 00:00:00',
      updated_at: '2024-03-01 00:00:00'
    }]

    const cached = await buildLibraryCoverage('root-cache')
    expect(cached.files[0]!.status).toBe('missing')

    const refreshed = await buildLibraryCoverage('root-cache', { refresh: true })
    expect(refreshed.files[0]!.status).toBe('review')
    expect(refreshed.files[0]!.taskId).toBe('review-cache')
  })

  it('uses the configured target language when none is provided', async () => {
    const directory = join(workDir, 'Shows', 'Other Show')
    mkdirSync(join(directory, 'SubX'), { recursive: true })
    writeFileSync(join(directory, 'Other.Show.E01.mkv'), '')
    writeFileSync(join(directory, 'SubX', 'Other.Show.E01.ja.srt'), '')

    mockState.targetLanguage = 'ja'
    mockState.files = [videoEntry('Shows/Other Show/Other.Show.E01.mkv')]

    const result = await buildLibraryCoverage('root-lang')
    expect(result.targetLanguage).toBe('ja')
    expect(result.files[0]!.status).toBe('done')
  })
})
