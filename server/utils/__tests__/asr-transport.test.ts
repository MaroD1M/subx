import { createServer } from 'node:http'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AsrService } from '../asr/client'

let server: ReturnType<typeof createServer>
let baseUrl = ''
let lastContentType = ''
let lastBody = ''

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => {
      lastContentType = String(req.headers['content-type'] || '')
      lastBody = Buffer.concat(chunks).toString('latin1')
      if (req.url?.endsWith('/v1/audio/transcriptions/jobs')) {
        res.writeHead(404)
        res.end()
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        language: 'en',
        duration: 1,
        text: 'Hi',
        segments: [{ id: 1, start: 0, end: 1, text: 'Hi' }]
      }))
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
})

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()))
})

function expectMultipartFileBody() {
  expect(lastContentType).toMatch(/^multipart\/form-data; boundary=/)
  expect(lastBody).toContain('name="file"')
  expect(lastBody).toMatch(/filename="[^"]+"/)
}

describe('AsrService real HTTP transport', () => {
  it('uses undici fetch with the long-timeout dispatcher and a valid file part', async () => {
    lastContentType = ''
    lastBody = ''
    const result = await AsrService.transcribe(join(process.cwd(), 'package.json'), {
      baseUrl,
      model: 'small',
      vad: false
    })

    expect(result.text).toBe('Hi')
    expectMultipartFileBody()
  })

  it('sends a valid multipart file to cloud ASR', async () => {
    lastContentType = ''
    lastBody = ''
    const result = await AsrService.transcribe(join(process.cwd(), 'package.json'), {
      baseUrl: 'http://unused',
      engine: 'cloud',
      cloudEnabled: true,
      cloudBaseUrl: baseUrl,
      cloudApiKey: 'secret',
      cloudModel: 'whisper-1'
    })

    expect(result.engine).toBe('cloud')
    expectMultipartFileBody()
  })
})
