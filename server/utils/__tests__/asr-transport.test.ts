import { createServer } from 'node:http'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AsrService } from '../asr/client'

let server: ReturnType<typeof createServer>
let baseUrl = ''

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => {
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

describe('AsrService real HTTP transport', () => {
  it('uses undici fetch with the long-timeout dispatcher', async () => {
    const result = await AsrService.transcribe(join(process.cwd(), 'package.json'), {
      baseUrl,
      model: 'small',
      vad: false
    })

    expect(result.text).toBe('Hi')
  })
})
