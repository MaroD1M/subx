import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  buildLibraryCoverage,
  clearEmbeddedSubtitleCache,
  clearLibraryCoverageCache,
  deriveCoverageStatus,
  deriveSeriesKey,
  deriveSeriesLabel,
  deriveSeriesTitle,
  getCachedLibraryCoverage,
  scanLibraryCoverage
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
  tasks: [] as any[],
  coverageIndex: [] as any[],
  snapshots: new Map<string, any>(),
  embeddedTracks: {} as Record<string, any[]>,
  probeCalls: [] as string[],
  probeFailures: new Set<string>()
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

vi.mock('../db', () => {
  const snapshotKey = (rootId: unknown, targetLanguage: unknown, includeEmbedded: unknown) => (
    `${String(rootId)}\u0000${String(targetLanguage)}\u0000${Number(includeEmbedded) ? 1 : 0}`
  )
  return {
    useDb: vi.fn(() => ({
      exec: vi.fn(() => {}),
      prepare: vi.fn((sql: string) => {
        const text = String(sql).replace(/\s+/g, ' ').trim()
        return {
          all: (...params: any[]) => {
            if (/FROM tasks\b/i.test(text)) return mockState.tasks
            if (/FROM library_coverage_index/i.test(text)) {
              const [rootId, targetLanguage] = params
              return mockState.coverageIndex.filter(row => (
                row.root_id === rootId && row.target_language === targetLanguage
              ))
            }
            return []
          },
          get: (...params: any[]) => {
            if (/FROM coverage_snapshots/i.test(text)) {
              const [rootId, targetLanguage, includeEmbedded] = params
              return mockState.snapshots.get(snapshotKey(rootId, targetLanguage, includeEmbedded))
            }
            return undefined
          },
          run: (...params: any[]) => {
            if (/DELETE FROM library_coverage_index/i.test(text)) {
              const [rootId, targetLanguage] = params
              mockState.coverageIndex = mockState.coverageIndex.filter(row => (
                !(row.root_id === rootId && row.target_language === targetLanguage)
              ))
              return { changes: 1 }
            }
            if (/INSERT INTO library_coverage_index/i.test(text)) {
              const [
                root_id, target_language, path, status, task_id, task_status, subtitle_path,
                subtitle_source, matched_language, embedded_track_title, file_mtime, scanned_at
              ] = params
              const row = {
                root_id, target_language, path, status, task_id, task_status, subtitle_path,
                subtitle_source, matched_language, embedded_track_title, file_mtime, scanned_at
              }
              const index = mockState.coverageIndex.findIndex(item => (
                item.root_id === root_id
                && item.target_language === target_language
                && item.path === path
              ))
              if (index >= 0) mockState.coverageIndex[index] = row
              else mockState.coverageIndex.push(row)
              return { changes: 1 }
            }
            if (/INSERT INTO coverage_snapshots/i.test(text)) {
              const [root_id, target_language, include_embedded, scanned_at, truncated, result_json] = params
              mockState.snapshots.set(snapshotKey(root_id, target_language, include_embedded), {
                root_id,
                target_language,
                include_embedded,
                scanned_at,
                truncated,
                result_json
              })
              return { changes: 1 }
            }
            return { changes: 0 }
          }
        }
      })
    }))
  }
})

vi.mock('../video', () => ({
  VideoService: {
    probeMedia: vi.fn(async (filePath: string) => {
      mockState.probeCalls.push(filePath)
      if (mockState.probeFailures.has(filePath)) throw new Error('ffprobe failed')
      return {
        duration: 0,
        width: 0,
        height: 0,
        fps: 0,
        subtitleTracks: mockState.embeddedTracks[filePath] || [],
        audioTracks: []
      }
    })
  }
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
  mockState.coverageIndex = []
  mockState.snapshots.clear()
  mockState.embeddedTracks = {}
  mockState.probeCalls = []
  mockState.probeFailures = new Set()
  clearLibraryCoverageCache()
  clearEmbeddedSubtitleCache()
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

  it('detects same-directory language-tagged sidecars and prefers them over generic files', async () => {
    const directory = join(workDir, 'Sidecar Show')
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'Sidecar.Show.E01.mkv'), '')
    writeFileSync(join(directory, 'Sidecar.Show.E01.srt'), '')
    writeFileSync(join(directory, 'Sidecar.Show.E01.zh-CN.ass'), '')
    writeFileSync(join(directory, 'Sidecar.Show.E02.mkv'), '')
    writeFileSync(join(directory, 'Sidecar.Show.E02.zh_CN.srt'), '')

    mockState.files = [
      videoEntry('Sidecar Show/Sidecar.Show.E01.mkv'),
      videoEntry('Sidecar Show/Sidecar.Show.E02.mkv')
    ]

    const result = await buildLibraryCoverage('root-sidecar')
    expect(result.files[0]!.status).toBe('done')
    expect(result.files[0]!.subtitleSource).toBe('sidecar')
    expect(result.files[0]!.subtitlePath).toBe('Sidecar Show/Sidecar.Show.E01.zh-CN.ass')
    expect(result.files[0]!.matchedLanguage).toBe('zh-CN')
    expect(result.files[1]!.status).toBe('done')
    expect(result.files[1]!.subtitlePath).toBe('Sidecar Show/Sidecar.Show.E02.zh_CN.srt')
    expect(mockState.probeCalls).toHaveLength(0)
  })

  it('does not count forced sidecars as full coverage', async () => {
    const directory = join(workDir, 'Forced Sidecar')
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'Forced.Sidecar.E01.mkv'), '')
    writeFileSync(join(directory, 'Forced.Sidecar.E01.zh-CN.forced.ass'), '')

    mockState.files = [videoEntry('Forced Sidecar/Forced.Sidecar.E01.mkv')]

    const result = await buildLibraryCoverage('root-sidecar-forced')
    expect(result.files[0]!.status).toBe('missing')
    expect(result.files[0]!.subtitleSource).toBeUndefined()
    expect(mockState.probeCalls).toHaveLength(1)
  })

  it('detects language-tagged sidecars in the SubX directory', async () => {
    const directory = join(workDir, 'SubX Show')
    mkdirSync(join(directory, 'SubX'), { recursive: true })
    writeFileSync(join(directory, 'SubX.Show.E01.mkv'), '')
    writeFileSync(join(directory, 'SubX', 'SubX.Show.E01.zh-CN.ass'), '')

    mockState.files = [videoEntry('SubX Show/SubX.Show.E01.mkv')]

    const result = await buildLibraryCoverage('root-subx')
    expect(result.files[0]!.status).toBe('done')
    expect(result.files[0]!.subtitleSource).toBe('sidecar')
    expect(result.files[0]!.subtitlePath).toBe('SubX Show/SubX/SubX.Show.E01.zh-CN.ass')
    expect(mockState.probeCalls).toHaveLength(0)
  })

  it('detects normalized embedded Simplified Chinese tracks', async () => {
    const directory = join(workDir, 'Embedded Show')
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'Embedded.Show.E01.mkv'), '')

    mockState.files = [videoEntry('Embedded Show/Embedded.Show.E01.mkv')]
    mockState.embeddedTracks['Embedded Show/Embedded.Show.E01.mkv'] = [
      { index: 2, codec: 'subrip', language: 'chi', title: 'Simplified', isForced: false }
    ]

    const result = await buildLibraryCoverage('root-embedded-zh')
    expect(result.files[0]!.status).toBe('done')
    expect(result.files[0]!.subtitleSource).toBe('embedded')
    expect(result.files[0]!.matchedLanguage).toBe('zh-CN')
    expect(result.files[0]!.embeddedTrackTitle).toBe('Simplified')
    expect(result.files[0]!.subtitlePath).toBeUndefined()
    expect(mockState.probeCalls).toEqual(['Embedded Show/Embedded.Show.E01.mkv'])
  })

  it('does not count embedded Traditional Chinese tracks for a Simplified target', async () => {
    const directory = join(workDir, 'Embedded Traditional')
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'Embedded.Traditional.E01.mkv'), '')

    mockState.files = [videoEntry('Embedded Traditional/Embedded.Traditional.E01.mkv')]
    mockState.embeddedTracks['Embedded Traditional/Embedded.Traditional.E01.mkv'] = [
      { index: 3, codec: 'ass', language: 'chi', title: 'Traditional', isForced: false }
    ]

    const result = await buildLibraryCoverage('root-embedded-zh-tw')
    expect(result.files[0]!.status).toBe('missing')
    expect(result.files[0]!.subtitleSource).toBeUndefined()
  })

  it('does not count forced-only embedded tracks as coverage', async () => {
    const directory = join(workDir, 'Embedded Forced')
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'Embedded.Forced.E01.mkv'), '')

    mockState.files = [videoEntry('Embedded Forced/Embedded.Forced.E01.mkv')]
    mockState.embeddedTracks['Embedded Forced/Embedded.Forced.E01.mkv'] = [
      { index: 4, codec: 'subrip', language: 'chi', title: 'Simplified', isForced: true }
    ]

    const result = await buildLibraryCoverage('root-embedded-forced')
    expect(result.files[0]!.status).toBe('missing')
    expect(result.files[0]!.subtitleSource).toBeUndefined()
  })

  it('skips embedded probing when includeEmbedded is false', async () => {
    const directory = join(workDir, 'Embedded Disabled')
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'Embedded.Disabled.E01.mkv'), '')

    mockState.files = [videoEntry('Embedded Disabled/Embedded.Disabled.E01.mkv')]
    mockState.embeddedTracks['Embedded Disabled/Embedded.Disabled.E01.mkv'] = [
      { index: 1, codec: 'subrip', language: 'chi', title: 'Simplified', isForced: false }
    ]

    const result = await buildLibraryCoverage('root-embedded-disabled', { includeEmbedded: false })
    expect(result.files[0]!.status).toBe('missing')
    expect(result.files[0]!.subtitleSource).toBeUndefined()
    expect(mockState.probeCalls).toHaveLength(0)
  })

  it('treats ffprobe failures as no embedded target', async () => {
    const directory = join(workDir, 'Embedded Failure')
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'Embedded.Failure.E01.mkv'), '')

    mockState.files = [videoEntry('Embedded Failure/Embedded.Failure.E01.mkv')]
    mockState.probeFailures.add('Embedded Failure/Embedded.Failure.E01.mkv')

    const result = await buildLibraryCoverage('root-embedded-failure')
    expect(result.files[0]!.status).toBe('missing')
    expect(result.files[0]!.subtitleSource).toBeUndefined()
  })
})

describe('coverage snapshot caching', () => {
  it('returns null before an explicit scan', async () => {
    mockState.files = [videoEntry('Movies/Unscanned.Movie.mkv')]

    await expect(getCachedLibraryCoverage('root-snapshot-none')).resolves.toBeNull()
  })

  it('reads files and hasCache after a scan', async () => {
    const directory = join(workDir, 'Movies')
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'Snapshot.Movie.mkv'), '')

    mockState.files = [videoEntry('Movies/Snapshot.Movie.mkv')]

    const scanned = await scanLibraryCoverage('root-snapshot')
    expect(scanned.hasCache).toBe(true)

    const cached = await getCachedLibraryCoverage('root-snapshot')
    expect(cached).not.toBeNull()
    expect(cached!.hasCache).toBe(true)
    expect(cached!.cachedAt).toBeTruthy()
    expect(cached!.files).toHaveLength(1)
    expect(cached!.files[0]!.path).toBe('Movies/Snapshot.Movie.mkv')
    expect(cached!.summary.total).toBe(1)
  })

  it('keeps snapshots separate for includeEmbedded variants', async () => {
    const directory = join(workDir, 'Embedded Snapshot')
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'Embedded.Snapshot.E01.mkv'), '')

    const path = 'Embedded Snapshot/Embedded.Snapshot.E01.mkv'
    mockState.files = [videoEntry(path)]
    mockState.embeddedTracks[path] = [
      { index: 1, codec: 'subrip', language: 'chi', title: 'Simplified', isForced: false }
    ]

    const withEmbedded = await scanLibraryCoverage('root-snapshot-embedded', { includeEmbedded: true })
    expect(withEmbedded.files[0]!.status).toBe('done')
    expect(withEmbedded.files[0]!.subtitleSource).toBe('embedded')

    const cachedWithEmbedded = await getCachedLibraryCoverage('root-snapshot-embedded', { includeEmbedded: true })
    expect(cachedWithEmbedded!.files[0]!.status).toBe('done')
    expect(cachedWithEmbedded!.files[0]!.subtitleSource).toBe('embedded')

    const withoutEmbedded = await scanLibraryCoverage('root-snapshot-embedded', {
      includeEmbedded: false,
      refresh: true
    })
    expect(withoutEmbedded.files[0]!.status).toBe('missing')

    const cachedWithoutEmbedded = await getCachedLibraryCoverage('root-snapshot-embedded', { includeEmbedded: false })
    expect(cachedWithoutEmbedded!.files[0]!.status).toBe('missing')

    const cachedWithEmbeddedAgain = await getCachedLibraryCoverage('root-snapshot-embedded', { includeEmbedded: true })
    expect(cachedWithEmbeddedAgain!.files[0]!.status).toBe('done')
    expect(cachedWithEmbeddedAgain!.files[0]!.subtitleSource).toBe('embedded')
    expect(mockState.snapshots.size).toBe(2)
  })

  it('overlays newer coverage index task status onto a cached snapshot', async () => {
    const directory = join(workDir, 'Movies')
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'Overlay.Movie.mkv'), '')

    const path = 'Movies/Overlay.Movie.mkv'
    mockState.files = [videoEntry(path)]

    const scanned = await scanLibraryCoverage('root-snapshot-overlay')
    expect(scanned.files[0]!.status).toBe('missing')

    const row = mockState.coverageIndex.find(item => (
      item.root_id === 'root-snapshot-overlay' && item.path === path
    ))
    expect(row).toBeTruthy()
    row.status = 'processing'
    row.task_id = 'task-new'
    row.task_status = 'transcribing'
    row.scanned_at = new Date(Date.now() + 1000).toISOString()

    const cached = await getCachedLibraryCoverage('root-snapshot-overlay')
    expect(cached!.files[0]!.status).toBe('processing')
    expect(cached!.files[0]!.taskId).toBe('task-new')
    expect(cached!.files[0]!.taskStatus).toBe('transcribing')
    expect(cached!.summary).toMatchObject({ total: 1, processing: 1, missing: 0 })
    expect(cached!.series[0]!.files[0]!.status).toBe('processing')

    row.task_status = 'error'
    const failed = await getCachedLibraryCoverage('root-snapshot-overlay')
    expect(failed!.files[0]!.status).toBe('failed')
  })

  it('does not leak embedded coverage across includeEmbedded variants', async () => {
    const directory = join(workDir, 'Variant Leak')
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'Variant.Leak.E01.mkv'), '')

    const path = 'Variant Leak/Variant.Leak.E01.mkv'
    mockState.files = [videoEntry(path)]
    mockState.embeddedTracks[path] = [
      { index: 1, codec: 'subrip', language: 'chi', title: 'Simplified', isForced: false }
    ]

    await scanLibraryCoverage('root-variant-leak', { includeEmbedded: true })
    await scanLibraryCoverage('root-variant-leak', { includeEmbedded: false, refresh: true })

    const row = mockState.coverageIndex.find(item => item.root_id === 'root-variant-leak' && item.path === path)
    expect(row).toBeTruthy()
    row.task_id = 'task-variant-leak'
    row.task_status = 'done'
    row.status = 'missing'

    const cachedWithEmbedded = await getCachedLibraryCoverage('root-variant-leak', { includeEmbedded: true })
    expect(cachedWithEmbedded!.files[0]!.status).toBe('done')
    expect(cachedWithEmbedded!.files[0]!.subtitleSource).toBe('embedded')
    expect(cachedWithEmbedded!.files[0]!.taskId).toBe('task-variant-leak')

    const cachedWithoutEmbedded = await getCachedLibraryCoverage('root-variant-leak', { includeEmbedded: false })
    expect(cachedWithoutEmbedded!.files[0]!.status).toBe('missing')
    expect(cachedWithoutEmbedded!.files[0]!.subtitleSource).toBeUndefined()
    expect(cachedWithoutEmbedded!.files[0]!.taskId).toBe('task-variant-leak')
  })
})
