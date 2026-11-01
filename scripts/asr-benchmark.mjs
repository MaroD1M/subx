#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs'
import { basename, join } from 'path'

const args = process.argv.slice(2)
function arg(name, fallback = '') {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? String(args[index + 1] || '') : fallback
}

const baseUrl = arg('base-url', process.env.ASR_BASE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '')
const samplesDir = arg('samples', process.env.ASR_SAMPLES_DIR || '')
const model = arg('model', process.env.ASR_MODEL || 'small')
const engine = arg('engine', process.env.ASR_ENGINE || 'auto')
const outPath = arg('out', '')
const languages = [
  ['en', 'English'], ['ja', 'Japanese'], ['ko', 'Korean'], ['zh', 'Chinese'],
  ['ru', 'Russian'], ['fr', 'French'], ['th', 'Thai'], ['es', 'Spanish'],
  ['de', 'German'], ['it', 'Italian'], ['pt', 'Portuguese']
]

if (!samplesDir) {
  console.error('Usage: node scripts/asr-benchmark.mjs --samples ./samples --base-url http://127.0.0.1:8000 [--model small] [--engine auto] [--out report.md]')
  process.exit(1)
}

function findSample(code) {
  for (const ext of ['.wav', '.mp3', '.m4a', '.flac', '.ogg', '.mp4', '.mkv']) {
    try { return join(samplesDir, `${code}${ext}`) } catch { /* ignore */ }
  }
  return ''
}

async function transcribe(path, language) {
  const form = new FormData()
  form.append('file', new Blob([readFileSync(path)], { type: 'application/octet-stream' }), basename(path))
  form.append('model', model)
  form.append('language', language)
  form.append('engine', engine)
  form.append('vad', 'true')
  form.append('word_timestamps', 'true')
  const started = Date.now()
  const response = await fetch(`${baseUrl}/v1/audio/transcriptions`, { method: 'POST', body: form })
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`)
  const data = await response.json()
  const confidenceValues = (data.segments || []).map(segment => Number(segment.confidence || 0)).filter(value => value > 0)
  const confidence = confidenceValues.length ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length : 0
  return {
    language,
    wallSeconds: (Date.now() - started) / 1000,
    audioSeconds: Number(data.duration || 0),
    rtf: Number(data.rtf || 0),
    confidence,
    segments: (data.segments || []).length,
    engine: data.engine || engine,
    model: data.model || model
  }
}

const rows = []
for (const [code, label] of languages) {
  const sample = findSample(code)
  if (!sample) {
    rows.push({ code, label, status: 'missing', rtf: 0, confidence: 0, audioSeconds: 0 })
    continue
  }
  try {
    const result = await transcribe(sample, code)
    rows.push({ code, label, status: 'ok', ...result })
  } catch (error) {
    rows.push({ code, label, status: 'error', error: String(error?.message || error), rtf: 0, confidence: 0, audioSeconds: 0 })
  }
}

const lines = [
  '# SubX ASR 11 语言基准',
  '',
  `- 时间：${new Date().toISOString()}`,
  `- Sidecar：${baseUrl}`,
  `- 引擎：${engine}`,
  `- 模型：${model}`,
  '',
  '| 语言 | 状态 | 音频秒 | 耗时秒 | RTF | 平均置信度 | 分段 |',
  '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
  ...rows.map(row => `| ${row.label} (${row.code}) | ${row.status} | ${Number(row.audioSeconds || 0).toFixed(1)} | ${Number(row.wallSeconds || 0).toFixed(1)} | ${Number(row.rtf || 0).toFixed(3)} | ${(Number(row.confidence || 0) * 100).toFixed(1)}% | ${row.segments || 0} |`)
]
const markdown = lines.join('\n') + '\n'
if (outPath) writeFileSync(outPath, markdown, 'utf-8')
else process.stdout.write(markdown)
