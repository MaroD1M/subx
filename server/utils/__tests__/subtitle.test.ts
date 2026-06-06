import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { SubtitleService } from '../subtitle'
import type { SubtitleEntry } from '../../../types'

describe('SubtitleService tag preservation', () => {
  it('parses leading cue tags from ass without leaking into text', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'subx-ass-'))
    const file = join(dir, 'sample.ass')
    writeFileSync(file, `[Script Info]\nScriptType: V4.00+\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,0.8,2,30,30,24,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\an8}Oh! Okay. Yeah.\\NI just never thought about it that way.`, 'utf-8')

    const entries = await SubtitleService.parseSubtitle(file)
    expect(entries[0]?.prefixTag).toBe('{\\an8}')
    expect(entries[0]?.text).toBe('Oh! Okay. Yeah.\nI just never thought about it that way.')

    rmSync(dir, { recursive: true, force: true })
  })

  it('writes bilingual srt with single preserved cue tag', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'subx-srt-'))
    const out = join(dir, 'demo.output.srt')
    const entries: SubtitleEntry[] = [{
      id: '1',
      startTime: '00:00:01,000',
      endTime: '00:00:03,000',
      text: 'Oh! Okay. Yeah.\nI just never thought about it that way.',
      translatedText: '{\\an8}哦 行吧 对\\n我从没这么想过',
      prefixTag: '{\\an8}'
    }]

    const outputPath = await SubtitleService.writeSubtitle(entries, out, 'bilingual', 'srt', 'bilingual_simple', 'translated_first')
    const content = readFileSync(outputPath, 'utf-8').replace(/\r\n/g, '\n')

    expect(content).toContain('{\\an8}哦 行吧 对\n我从没这么想过\nOh! Okay. Yeah.\nI just never thought about it that way.')
    expect(content).not.toContain('{\\an8}{\\an8}')

    rmSync(dir, { recursive: true, force: true })
  })

  it('rewrites ass while preserving leading position tag and line breaks', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'subx-ass-write-'))
    const source = join(dir, 'source.ass')
    const out = join(dir, 'result.srt')
    writeFileSync(source, `[Script Info]\nScriptType: V4.00+\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,0.8,2,30,30,24,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\an8}Oh! Okay. Yeah.\\NI just never thought about it that way.`, 'utf-8')

    const entries: SubtitleEntry[] = [{
      id: '1',
      startTime: '00:00:01,000',
      endTime: '00:00:03,000',
      text: 'Oh! Okay. Yeah.\nI just never thought about it that way.',
      translatedText: '{\\an8}哦 行吧 对\\n我从没这么想过',
      prefixTag: '{\\an8}'
    }]

    const outputPath = await SubtitleService.writeSubtitle(entries, out, 'translated', 'ass', 'bilingual_simple', 'translated_first', source)
    const content = readFileSync(outputPath, 'utf-8')

    expect(content).toContain('{\\an8}哦 行吧 对\\N我从没这么想过')
    expect(content).not.toContain('{\\an8}{\\an8}')
    expect(content).not.toContain('\\哦')

    rmSync(dir, { recursive: true, force: true })
  })
})
