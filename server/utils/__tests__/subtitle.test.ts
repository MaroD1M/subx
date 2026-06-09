import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { SubtitleService } from '../subtitle'
import type { SubtitleEntry } from '../../../types'
import { diagnosticSamples } from './diagnosticSamples'

describe('SubtitleService formatting preservation', () => {
  it('parses leading cue tags from ass without leaking into text', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'subx-ass-'))
    const file = join(dir, 'sample.ass')
    writeFileSync(file, `[Script Info]\nScriptType: V4.00+\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,0.8,2,30,30,24,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\an8}Oh! Okay. Yeah.\\NI just never thought about it that way.`, 'utf-8')

    const entries = await SubtitleService.parseSubtitle(file)
    expect(entries[0]?.prefixTag).toBe('{\\an8}')
    expect(entries[0]?.text).toBe('Oh! Okay. Yeah.\nI just never thought about it that way.')

    rmSync(dir, { recursive: true, force: true })
  })

  it('parses inline ass formatting tags into placeholders', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'subx-ass-inline-'))
    const file = join(dir, 'sample.ass')
    writeFileSync(file, `[Script Info]\nScriptType: V4.00+\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,0.8,2,30,30,24,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\i1}Hello{\\i0} world`, 'utf-8')

    const entries = await SubtitleService.parseSubtitle(file)
    expect(entries[0]?.text).toContain('__SUBX_FMT_1__')
    expect(entries[0]?.formattingTokens?.length).toBeGreaterThan(0)
    expect(entries[0]?.formattingTokens?.some(token => token.value.includes('\\i0'))).toBe(true)

    rmSync(dir, { recursive: true, force: true })
  })

  it('parses html formatting tags from srt into placeholders', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'subx-srt-html-'))
    const file = join(dir, 'sample.srt')
    writeFileSync(file, `1\n00:00:01,000 --> 00:00:03,000\n<i>Hello</i> world\n`, 'utf-8')

    const entries = await SubtitleService.parseSubtitle(file)
    expect(entries[0]?.text).toContain('__SUBX_FMT_1__')
    expect(entries[0]?.text).toContain('__SUBX_FMT_2__')
    expect(entries[0]?.formattingTokens?.map(token => token.value)).toEqual(['<i>', '</i>'])

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

  it('sanitizes stray backslashes and duplicated cue tags from model output', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'subx-srt-stray-'))
    const out = join(dir, 'demo.output.srt')
    const entries: SubtitleEntry[] = [{
      id: '1',
      startTime: '00:00:01,000',
      endTime: '00:00:03,000',
      text: 'Oh! Okay. Yeah.\nI just never thought about it that way.',
      translatedText: '{\\an8}\\哦 行吧 对\\n{\\an8}我从没这么想过',
      prefixTag: '{\\an8}'
    }]

    const outputPath = await SubtitleService.writeSubtitle(entries, out, 'translated', 'srt', 'bilingual_simple', 'translated_first')
    const content = readFileSync(outputPath, 'utf-8').replace(/\r\n/g, '\n')

    expect(content).toContain('{\\an8}哦 行吧 对\n我从没这么想过')
    expect(content).not.toContain('\\哦')
    expect(content).not.toContain('{\\an8}{\\an8}')

    rmSync(dir, { recursive: true, force: true })
  })

  it('restores inline ass formatting tags during ass rewrite', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'subx-ass-restore-'))
    const source = join(dir, 'source.ass')
    const out = join(dir, 'result.srt')
    writeFileSync(source, `[Script Info]\nScriptType: V4.00+\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,0.8,2,30,30,24,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\i1}Hello{\\i0} world`, 'utf-8')

    const entries: SubtitleEntry[] = [{
      id: '1',
      startTime: '00:00:01,000',
      endTime: '00:00:03,000',
      text: '__SUBX_FMT_1__你好__SUBX_FMT_2__ 世界',
      translatedText: '__SUBX_FMT_1__你好__SUBX_FMT_2__ 世界',
      formattingTokens: [
        { placeholder: '__SUBX_FMT_1__', value: '{\\i1}' },
        { placeholder: '__SUBX_FMT_2__', value: '{\\i0}' }
      ]
    }]

    const outputPath = await SubtitleService.writeSubtitle(entries, out, 'translated', 'ass', 'bilingual_simple', 'translated_first', source)
    const content = readFileSync(outputPath, 'utf-8')

    expect(content).toContain('{\\i1}你好{\\i0} 世界')

    rmSync(dir, { recursive: true, force: true })
  })

  it('preserves ass karaoke and multiple style blocks during rewrite', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'subx-ass-karaoke-'))
    const source = join(dir, 'source.ass')
    const out = join(dir, 'result.srt')
    writeFileSync(source, `[Script Info]
ScriptType: V4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,0.8,2,30,30,24,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\an8}{\\k20}Hel{\\k30}{\\i1}lo{\\i0} {\\b1}world{\\b0}`, 'utf-8')

    const entries: SubtitleEntry[] = [{
      id: '1',
      startTime: '00:00:01,000',
      endTime: '00:00:03,000',
      text: '__SUBX_FMT_1__Hel__SUBX_FMT_2____SUBX_FMT_3__lo__SUBX_FMT_4__ __SUBX_FMT_5__world__SUBX_FMT_6__',
      translatedText: '__SUBX_FMT_1__你__SUBX_FMT_2____SUBX_FMT_3__好__SUBX_FMT_4__ __SUBX_FMT_5__世界__SUBX_FMT_6__',
      prefixTag: '{\\an8}',
      formattingTokens: [
        { placeholder: '__SUBX_FMT_1__', value: '{\\k20}' },
        { placeholder: '__SUBX_FMT_2__', value: '{\\k30}' },
        { placeholder: '__SUBX_FMT_3__', value: '{\\i1}' },
        { placeholder: '__SUBX_FMT_4__', value: '{\\i0}' },
        { placeholder: '__SUBX_FMT_5__', value: '{\\b1}' },
        { placeholder: '__SUBX_FMT_6__', value: '{\\b0}' }
      ]
    }]

    const outputPath = await SubtitleService.writeSubtitle(entries, out, 'translated', 'ass', 'bilingual_simple', 'translated_first', source)
    const content = readFileSync(outputPath, 'utf-8')

    expect(content).toContain(String.raw`{\an8}{\k20}你{\k30}{\i1}好{\i0} {\b1}世界{\b0}`)

    rmSync(dir, { recursive: true, force: true })
  })

  it('rebuilds formatting placeholders when model output loses them', () => {
    const rebuilt = SubtitleService.stabilizeFormattingPlaceholders(
      '你好世界',
      '__SUBX_FMT_1__Hello__SUBX_FMT_2__ world',
      [
        { placeholder: '__SUBX_FMT_1__', value: '{\\i1}' },
        { placeholder: '__SUBX_FMT_2__', value: '{\\i0}' }
      ]
    )

    expect(rebuilt).toBe('__SUBX_FMT_1__你好__SUBX_FMT_2__世界')
  })

  it('rebuilds placeholder order when model output reorders style blocks', () => {
    const rebuilt = SubtitleService.stabilizeFormattingPlaceholders(
      '__SUBX_FMT_2__世界__SUBX_FMT_1__你好',
      '__SUBX_FMT_1__Hello__SUBX_FMT_2__ world',
      [
        { placeholder: '__SUBX_FMT_1__', value: '{\\i1}' },
        { placeholder: '__SUBX_FMT_2__', value: '{\\i0}' }
      ]
    )

    expect(rebuilt).toBe('__SUBX_FMT_1__你好__SUBX_FMT_2__世界')
  })

  it('accepts bracket-only non-dialogue text when structure is preserved', () => {
    expect(SubtitleService.isAcceptableSameText('[MUSIC PLAYING]', '[MUSIC PLAYING]', 'zh-CN')).toBe(true)
    expect(SubtitleService.isAcceptableSameText('[MUSIC PLAYING]\n[SIGHS]', '[MUSIC PLAYING]\n[SIGHS]', 'zh-CN')).toBe(true)
  })

  it('flags adjacent-shifted translations before export', () => {
    const issues = SubtitleService.validateTranslatedEntries([
      { id: '1', startTime: '00:00:01,000', endTime: '00:00:02,000', text: 'Mike. Somebody took a shot at the big man.', translatedText: '如果我兄弟出事' },
      { id: '2', startTime: '00:00:02,000', endTime: '00:00:03,000', text: 'If anything happens to my brother,', translatedText: 'Mike. Somebody took a shot at the big man.' }
    ], 'zh-CN')

    expect(issues.some(issue => issue.reason === 'suspected_shift')).toBe(true)
  })

  it('preserves ass drawing lines as raw content during parse', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'subx-ass-drawing-'))
    const file = join(dir, 'sample.ass')
    writeFileSync(file, `[Script Info]
ScriptType: V4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,0.8,2,30,30,24,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\p1}m 0 0 l 10 0 10 10 0 10{\\p0}`, 'utf-8')

    const entries = await SubtitleService.parseSubtitle(file)
    expect(entries[0]?.text).toBe('{\\p1}m 0 0 l 10 0 10 10 0 10{\\p0}')
    expect(entries[0]?.formattingTokens).toBeUndefined()

    rmSync(dir, { recursive: true, force: true })
  })

  it('preserves ass transform and clipping style blocks during rewrite', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'subx-ass-transform-'))
    const source = join(dir, 'source.ass')
    const out = join(dir, 'result.srt')
    writeFileSync(source, `[Script Info]
ScriptType: V4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,0.8,2,30,30,24,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\an8}{\clip(0,0,100,100)}{\t(0,200,\fscx120)}Hello world`, 'utf-8')

    const entries: SubtitleEntry[] = [{
      id: '1',
      startTime: '00:00:01,000',
      endTime: '00:00:03,000',
      text: '__SUBX_FMT_1____SUBX_FMT_2__你好 世界',
      translatedText: '__SUBX_FMT_1____SUBX_FMT_2__你好 世界',
      prefixTag: '{\\an8}',
      formattingTokens: [
        { placeholder: '__SUBX_FMT_1__', value: '{\\clip(0,0,100,100)}' },
        { placeholder: '__SUBX_FMT_2__', value: '{\\t(0,200,\\fscx120)}' }
      ]
    }]

    const outputPath = await SubtitleService.writeSubtitle(entries, out, 'translated', 'ass', 'bilingual_simple', 'translated_first', source)
    const content = readFileSync(outputPath, 'utf-8')

    expect(content).toContain(String.raw`{\an8}{\clip(0,0,100,100)}`)
    expect(content).toContain(String.raw`{\t(0,200,1,\fscx120)}你好 世界`)

    rmSync(dir, { recursive: true, force: true })
  })

  it('keeps bilingual placeholder layout stable across line breaks', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'subx-srt-bilingual-fmt-'))
    const out = join(dir, 'demo.output.srt')
    const entries: SubtitleEntry[] = [{
      id: '1',
      startTime: '00:00:01,000',
      endTime: '00:00:03,000',
      text: '__SUBX_FMT_1__Hello__SUBX_FMT_2__\nworld',
      translatedText: '你好\n__SUBX_FMT_1__世界__SUBX_FMT_2__',
      formattingTokens: [
        { placeholder: '__SUBX_FMT_1__', value: '<i>' },
        { placeholder: '__SUBX_FMT_2__', value: '</i>' }
      ]
    }]

    const outputPath = await SubtitleService.writeSubtitle(entries, out, 'bilingual', 'srt', 'bilingual_simple', 'translated_first')
    const content = readFileSync(outputPath, 'utf-8').replace(/\r\n/g, '\n')

    expect(content).toContain('你好\n世界\nHello\nworld')

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