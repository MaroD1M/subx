import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { acquireOutputLocks } from '../outputLock'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('acquireOutputLocks', () => {
  it('blocks concurrent writers for the same output path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'subx-lock-'))
    dirs.push(dir)
    const output = join(dir, 'Movie.zh-CN.srt')
    const release = acquireOutputLocks([output])
    expect(() => acquireOutputLocks([output])).toThrow('正在被其他任务写入')
    release()
    const releaseAgain = acquireOutputLocks([output])
    releaseAgain()
  })

  it('releases all acquired locks when one path fails', () => {
    const dir = mkdtempSync(join(tmpdir(), 'subx-lock-'))
    dirs.push(dir)
    const first = join(dir, 'A.srt')
    const second = join(dir, 'B.srt')
    const blocker = acquireOutputLocks([second])
    expect(() => acquireOutputLocks([first, second])).toThrow()
    const release = acquireOutputLocks([first])
    release()
    blocker()
  })
})
