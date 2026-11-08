import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { findExternalSubtitle } from '../taskSource'

const dirs: string[] = []

function makeRoot() {
  const dir = mkdtempSync(join(tmpdir(), 'subx-source-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('findExternalSubtitle', () => {
  it('prefers a matching preferred language subtitle', () => {
    const root = makeRoot()
    writeFileSync(join(root, 'Movie.mkv'), '')
    writeFileSync(join(root, 'Movie.en.srt'), '')
    writeFileSync(join(root, 'Movie.zh.srt'), '')

    expect(findExternalSubtitle(join(root, 'Movie.mkv'), root, 'zh')).toBe('Movie.zh.srt')
  })

  it('falls back to format priority when language does not match', () => {
    const root = makeRoot()
    writeFileSync(join(root, 'Movie.mkv'), '')
    writeFileSync(join(root, 'Movie.ass'), '')
    writeFileSync(join(root, 'Movie.srt'), '')

    expect(findExternalSubtitle(join(root, 'Movie.mkv'), root, 'fr')).toBe('Movie.srt')
  })

  it('ignores unrelated, hidden and nested files', () => {
    const root = makeRoot()
    mkdirSync(join(root, 'Subs'))
    writeFileSync(join(root, 'Movie.mkv'), '')
    writeFileSync(join(root, '.Movie.srt'), '')
    writeFileSync(join(root, 'Other.srt'), '')
    writeFileSync(join(root, 'Subs', 'Movie.srt'), '')

    expect(findExternalSubtitle(join(root, 'Movie.mkv'), root)).toBeNull()
  })
})
