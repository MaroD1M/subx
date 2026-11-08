import { describe, expect, it, vi } from 'vitest'
import { ACTIVE_TASK_STATUSES, findActiveTaskDuplicate, isActiveTaskStatus } from '../taskDedupe'

function makeDb(row: { task_id?: string } | undefined) {
  const get = vi.fn(() => row)
  return { db: { prepare: vi.fn(() => ({ get })) }, get }
}

describe('task deduplication', () => {
  it('looks up active tasks by file, root, output and target', () => {
    const { db, get } = makeDb({ task_id: 'existing-task' })
    const result = findActiveTaskDuplicate(db as any, {
      filePath: 'Shows/Demo.mkv',
      rootId: 'root-1',
      targetLanguage: 'zh-CN',
      outputMode: 'translated',
      subtitleFormat: 'srt'
    })

    expect(result).toBe('existing-task')
    const args = get.mock.calls[0] as any[]
    expect(args[0]).toBe('Shows/Demo.mkv')
    expect(args[1]).toBe('root-1')
    expect(args).toContain('translating')
    expect(args.at(-1)).toBe('zh-CN')
  })

  it('returns null when no active task matches', () => {
    const { db } = makeDb(undefined)
    const result = findActiveTaskDuplicate(db as any, {
      filePath: 'Shows/Demo.mkv',
      targetLanguage: 'zh-CN',
      outputMode: 'translated',
      subtitleFormat: 'srt'
    })
    expect(result).toBeNull()
  })

  it('recognizes active task statuses', () => {
    expect(isActiveTaskStatus({ status: 'translating' } as any)).toBe(true)
    expect(isActiveTaskStatus({ status: 'done' } as any)).toBe(false)
    expect(ACTIVE_TASK_STATUSES).toContain('queued')
  })
})
