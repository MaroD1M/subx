import { describe, expect, it } from 'vitest'
import {
  buildOriginalSubtitleCandidates,
  deriveOutputBaseName,
  getMediaBaseName,
  isKnownLanguageTag,
  stripKnownLanguageSuffix
} from '../outputNaming'

const f1File = 'Formula1.2026.Round20.Brazil.Drivers.Press.Conference.Part1.F1TV.WEB-DL.1080p.H264.English-MWR.mkv'
const f1Base = 'Formula1.2026.Round20.Brazil.Drivers.Press.Conference.Part1.F1TV.WEB-DL.1080p.H264.English-MWR'

describe('output naming', () => {
  it('keeps the full video release name', () => {
    expect(getMediaBaseName(f1File)).toBe(f1Base)
    expect(deriveOutputBaseName(f1File, 'asr')).toBe(f1Base)
    expect(deriveOutputBaseName(f1File, 'embedded')).toBe(f1Base)
    expect(deriveOutputBaseName(f1File, 'ocr')).toBe(f1Base)
    expect(`${deriveOutputBaseName(f1File, 'asr')}.original.srt`).toBe(`${f1Base}.original.srt`)
  })

  it('does not mistake release tags for language codes', () => {
    expect(isKnownLanguageTag('English-MWR')).toBe(false)
    expect(isKnownLanguageTag('WEB-DL')).toBe(false)
    expect(isKnownLanguageTag('BluRay')).toBe(false)
    expect(isKnownLanguageTag('HEVC')).toBe(false)
    expect(isKnownLanguageTag('AAC')).toBe(false)
    expect(isKnownLanguageTag('H264')).toBe(false)
    expect(stripKnownLanguageSuffix(`${f1Base.replace('.English-MWR', '')}.WEB-DL`)).toBe(`${f1Base.replace('.English-MWR', '')}.WEB-DL`)
  })

  it('recognizes real language suffixes', () => {
    expect(isKnownLanguageTag('en')).toBe(true)
    expect(isKnownLanguageTag('eng')).toBe(true)
    expect(isKnownLanguageTag('English')).toBe(true)
    expect(isKnownLanguageTag('zh-CN')).toBe(true)
    expect(isKnownLanguageTag('zh-Hans')).toBe(true)
    expect(isKnownLanguageTag('chs')).toBe(true)
    expect(isKnownLanguageTag('简体')).toBe(true)
    expect(isKnownLanguageTag('中文')).toBe(true)
  })

  it('does not confuse four-letter release groups with script codes', () => {
    expect(isKnownLanguageTag('English-YIFY')).toBe(false)
    expect(isKnownLanguageTag('English-CMRG')).toBe(false)
    expect(stripKnownLanguageSuffix('Show.S01E01.English-YIFY')).toBe('Show.S01E01.English-YIFY')
    expect(stripKnownLanguageSuffix('Show.S01E01.简体')).toBe('Show.S01E01')
  })

  it('only strips known language suffixes for external subtitle sources', () => {
    expect(stripKnownLanguageSuffix('Show.S01E01.zh-CN')).toBe('Show.S01E01')
    expect(stripKnownLanguageSuffix('Show.S01E01.eng')).toBe('Show.S01E01')
    expect(stripKnownLanguageSuffix('Show.S01E01.English-MWR')).toBe('Show.S01E01.English-MWR')
    expect(deriveOutputBaseName('Shows/Demo.Show.S01E01.zh-CN.srt', 'external')).toBe('Demo.Show.S01E01')
    expect(deriveOutputBaseName('Shows/Demo.Show.S01E01.English-MWR.srt', 'external')).toBe('Demo.Show.S01E01.English-MWR')
  })

  it('avoids collisions between different release versions', () => {
    const english = deriveOutputBaseName('Show.S01E01.H264.English-MWR.mkv', 'asr')
    const japanese = deriveOutputBaseName('Show.S01E01.H264.Japanese-XYZ.mkv', 'asr')
    expect(english).not.toBe(japanese)
  })

  it('builds original-subtitle candidates inside the media directory', () => {
    const releaseCandidates = buildOriginalSubtitleCandidates('Shows/Demo Show/Demo.Show.S01E01.H264.English-MWR.mkv', 'embedded')
    expect(releaseCandidates).toContain('Shows/Demo Show/Demo.Show.S01E01.H264.English-MWR.original.srt')
    expect(releaseCandidates).toContain('Shows/Demo Show/Demo.Show.S01E01.H264.English-MWR.srt')
    expect(releaseCandidates.every(candidate => candidate.startsWith('Shows/Demo Show/'))).toBe(true)

    const languageCandidates = buildOriginalSubtitleCandidates('Shows/Demo Show/Demo.Show.S01E01.zh-CN.mkv', 'embedded')
    expect(languageCandidates).toContain('Shows/Demo Show/Demo.Show.S01E01.zh-CN.original.srt')
    expect(languageCandidates).toContain('Shows/Demo Show/Demo.Show.S01E01.srt')
  })
})
