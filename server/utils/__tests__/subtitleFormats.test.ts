import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { SubtitleService } from '../subtitle'
import type { SubtitleEntry } from '../../../types'

const entries: SubtitleEntry[] = [{
  id: '1',
  startTime: '00:00:01,000',
  endTime: '00:00:03,500',
  text: 'Hello & world',
  translatedText: '你好 & 世界'
}]

describe('VTT and TTML output', () => {
  it('writes VTT with WEBVTT header and dot timestamps', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'subx-vtt-'))
    try {
      const out = join(dir, 'demo.vtt')
      const outputPath = await SubtitleService.writeSubtitle(entries, out, 'translated', 'vtt', 'bilingual_simple', 'translated_first')
      const content = readFileSync(outputPath, 'utf-8')
      expect(content.startsWith('WEBVTT')).toBe(true)
      expect(content).toContain('00:00:01.000 --> 00:00:03.500')
      expect(content).toContain('你好 & 世界')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('writes escaped TTML with begin and end times', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'subx-ttml-'))
    try {
      const out = join(dir, 'demo.ttml')
      const outputPath = await SubtitleService.writeSubtitle(entries, out, 'bilingual', 'ttml', 'bilingual_simple', 'translated_first')
      const content = readFileSync(outputPath, 'utf-8')
      expect(content).toContain('<tt xmlns="http://www.w3.org/ns/ttml"')
      expect(content).toContain('begin="00:00:01.000"')
      expect(content).toContain('&amp;')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
