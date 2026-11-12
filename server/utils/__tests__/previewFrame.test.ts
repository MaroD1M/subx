import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createSubtitleStyle } from '../../../shared/subtitleStyles'
import { buildPreviewAssContent, quoteAssFilterPath, renderPreviewFrame } from '../previewFrame'

function hasCommand(command: string) {
  try {
    execFileSync(command, ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const ffmpegAvailable = hasCommand('ffmpeg')

describe('preview frame helpers', () => {
  it('builds ASS content with the requested style text', () => {
    const style = createSubtitleStyle('mono_clean', 'translated')
    style.translated.fontFamily = 'Noto Sans CJK SC'
    style.translated.fontSize = 64
    style.translated.primaryColor = '#00FF00'

    const content = buildPreviewAssContent({
      outputMode: 'translated',
      bilingualLayout: 'translated_first',
      subtitleStyle: style,
      originalText: 'Hello',
      translatedText: '这是译文示例字幕。'
    })

    expect(content).toContain('Style: SubX-Translated,Noto Sans CJK SC,64,')
    expect(content).toContain('&H0000FF00')
    expect(content).toContain('这是译文示例字幕。')
  })

  it('carries background color and padding into the preview ASS', () => {
    const style = createSubtitleStyle('mono_clean', 'translated')
    style.background = { enabled: true, color: '#E04242', opacity: 45, padding: 6 }

    const content = buildPreviewAssContent({
      outputMode: 'translated',
      bilingualLayout: 'translated_first',
      subtitleStyle: style,
      originalText: 'Hello',
      translatedText: '这是译文示例字幕。'
    })

    expect(content).toContain('&H8C4242E0')
    expect(content).toContain(',3,6,')
  })

  it('quotes ffmpeg filter paths safely', () => {
    expect(quoteAssFilterPath("/tmp/a b/it's.ass")).toBe("'/tmp/a b/it\\'s.ass'")
    expect(quoteAssFilterPath('C:\\temp\\preview.ass')).toBe("'C:/temp/preview.ass'")
  })
})

describe.skipIf(!ffmpegAvailable)('preview frame renderer', () => {
  it('renders a full-size frame and reuses the cached image', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'subx-preview-frame-'))
    const inputPath = join(dir, 'sample.mp4')
    let outputPath = ''

    try {
      execFileSync('ffmpeg', [
        '-hide_banner',
        '-loglevel', 'error',
        '-f', 'lavfi',
        '-i', 'color=c=0x223344:s=320x180:d=2',
        '-c:v', 'mpeg4',
        '-pix_fmt', 'yuv420p',
        '-y',
        inputPath
      ])

      const options = {
        inputPath,
        time: 0.5,
        width: 320,
        height: 180,
        outputMode: 'translated' as const,
        bilingualLayout: 'translated_first' as const,
        subtitleStyle: createSubtitleStyle('mono_clean', 'translated'),
        originalText: 'Hello',
        translatedText: '这是译文示例字幕。'
      }

      const first = await renderPreviewFrame(options)
      outputPath = first.filePath
      expect(first.cached).toBe(false)
      expect(first.width).toBe(320)
      expect(first.height).toBe(180)
      expect(existsSync(first.filePath)).toBe(true)
      expect(statSync(first.filePath).size).toBeGreaterThan(0)

      const second = await renderPreviewFrame(options)
      expect(second.cached).toBe(true)
      expect(second.filePath).toBe(first.filePath)
    } finally {
      if (outputPath) rmSync(outputPath, { force: true })
      rmSync(dir, { recursive: true, force: true })
    }
  }, 30_000)
})
