import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

const root = join(process.cwd(), '.test-artifacts')
rmSync(root, { recursive: true, force: true })
mkdirSync(join(root, 'media', 'Shows', 'Demo Show'), { recursive: true })
mkdirSync(join(root, 'media', 'Movies'), { recursive: true })

const srt = '1\n00:00:01,000 --> 00:00:03,000\nHello world\n\n2\n00:00:04,000 --> 00:00:06,000\nThis is a demo subtitle.\n'
writeFileSync(join(root, 'media', 'Shows', 'Demo Show', 'Demo.Show.S01E01.zh-CN.srt'), srt)
writeFileSync(join(root, 'media', 'Shows', 'Demo Show', 'Demo.Show.S01E01.en.srt'), srt)
writeFileSync(join(root, 'media', 'Shows', 'Demo Show', 'Demo.Show.S01E01.mkv'), '')
writeFileSync(join(root, 'media', 'Shows', 'Demo Show', 'Demo.Show.S01E02.mkv'), '')
writeFileSync(join(root, 'media', 'Movies', 'Example.Movie.2024.mkv'), '')
writeFileSync(join(root, 'media', 'Movies', 'Example.Movie.2024.en.srt'), srt)
