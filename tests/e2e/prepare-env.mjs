import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'

const workerIndexRaw =
  process.env.SUBX_E2E_WORKER_INDEX ??
  process.env.E2E_WORKER_INDEX ??
  process.env.PLAYWRIGHT_WORKER_INDEX
const explicitRoot = process.env.SUBX_E2E_ARTIFACTS_DIR || process.env.E2E_ARTIFACTS_DIR

const root = explicitRoot
  ? resolve(explicitRoot)
  : workerIndexRaw !== undefined && workerIndexRaw !== ''
    ? resolve(process.cwd(), '.test-artifacts', `worker-${workerIndexRaw}`)
    : resolve(process.cwd(), '.test-artifacts')

const explicitMedia = process.env.SUBX_E2E_MEDIA_DIR || process.env.VIDEO_DIR
const mediaRoot = explicitMedia ? resolve(explicitMedia) : join(root, 'media')

rmSync(root, { recursive: true, force: true })
if (mediaRoot !== join(root, 'media')) rmSync(mediaRoot, { recursive: true, force: true })

mkdirSync(join(mediaRoot, 'Shows', 'Demo Show'), { recursive: true })
mkdirSync(join(mediaRoot, 'Movies'), { recursive: true })
mkdirSync(root, { recursive: true })

const srt = '1\n00:00:01,000 --> 00:00:03,000\nHello world\n\n2\n00:00:04,000 --> 00:00:06,000\nThis is a demo subtitle.\n'
writeFileSync(join(mediaRoot, 'Shows', 'Demo Show', 'Demo.Show.S01E01.zh-CN.srt'), srt)
writeFileSync(join(mediaRoot, 'Shows', 'Demo Show', 'Demo.Show.S01E01.en.srt'), srt)
writeFileSync(join(mediaRoot, 'Shows', 'Demo Show', 'Demo.Show.S01E01.mkv'), '')
writeFileSync(join(mediaRoot, 'Shows', 'Demo Show', 'Demo.Show.S01E02.mkv'), '')
writeFileSync(join(mediaRoot, 'Movies', 'Example.Movie.2024.mkv'), '')
writeFileSync(join(mediaRoot, 'Movies', 'Example.Movie.2024.en.srt'), srt)

console.log(`[prepare-env] worker=${workerIndexRaw ?? 'shared'} artifacts=${root} media=${mediaRoot}`)
