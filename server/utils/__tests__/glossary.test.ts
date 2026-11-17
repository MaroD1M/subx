import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const tempRoot = mkdtempSync(join(tmpdir(), 'subx-glossary-'))
let db: any
let GlossaryService: typeof import('../glossary').GlossaryService

beforeAll(async () => {
  process.env.DB_PATH = join(tempRoot, 'test.db')
  db = (await import('../db')).useDb()
  GlossaryService = (await import('../glossary')).GlossaryService
})

afterAll(() => {
  try { db?.close?.() } catch { /* ignore */ }
  rmSync(tempRoot, { recursive: true, force: true })
})

describe('glossary service', () => {
  it('resolves series entries over global entries and respects enabled state', () => {
    GlossaryService.create({ source: 'Shared', target: '全局', scopeType: 'global' })
    GlossaryService.create({ source: 'GlobalOnly', target: '仅全局', scopeType: 'global' })
    GlossaryService.create({ source: 'Shared', target: '系列', scopeType: 'series', scopeKey: 'series-1' })
    GlossaryService.create({ source: 'SeriesOnly', target: '仅系列', scopeType: 'series', scopeKey: 'series-1' })
    const disabled = GlossaryService.create({ source: 'Disabled', target: '停用', scopeType: 'series', scopeKey: 'series-1' })
    GlossaryService.update(disabled.id, { enabled: false })

    const resolved = GlossaryService.resolve('series-1', { configGlossary: { Legacy: '旧' } })
    expect(resolved.Shared).toBe('系列')
    expect(resolved.GlobalOnly).toBe('仅全局')
    expect(resolved.SeriesOnly).toBe('仅系列')
    expect(resolved.Disabled).toBeUndefined()
    expect(resolved.Legacy).toBe('旧')
  })

  it('previews, imports and exports CSV terms', () => {
    const csv = 'source,target,source_lang,target_lang,category,notes\nJedi,绝地,en,zh-CN,组织,测试\nSith,西斯,en,zh-CN,组织,'
    const preview = GlossaryService.previewImport(csv, 'csv', 'series', 'series-import')
    expect(preview.total).toBe(2)
    expect(preview.inserted).toBe(2)
    const result = GlossaryService.importEntries(csv, 'csv', 'series', 'series-import', 'skip')
    expect(result.inserted).toBe(2)

    const conflict = 'source,target,source_lang,target_lang\nJedi,绝地武士,en,zh-CN'
    const skipped = GlossaryService.importEntries(conflict, 'csv', 'series', 'series-import', 'skip')
    expect(skipped.skipped).toBe(1)
    expect(GlossaryService.resolve('series-import').Jedi).toBe('绝地')
    const overwritten = GlossaryService.importEntries(conflict, 'csv', 'series', 'series-import', 'overwrite')
    expect(overwritten.updated).toBe(1)
    expect(GlossaryService.resolve('series-import').Jedi).toBe('绝地武士')

    const exported = GlossaryService.exportEntries({ scopeType: 'series', scopeKey: 'series-import', format: 'json' })
    expect(exported.content).toContain('"Jedi"')
    expect(exported.content).toContain('"绝地武士"')
  })

  it('keeps language-specific entries when syncing a legacy flat glossary', () => {
    GlossaryService.create({ source: 'Scoped', target: '语言对', sourceLang: 'en', targetLang: 'zh-CN', scopeType: 'series', scopeKey: 'series-lang' })
    GlossaryService.replaceScopeFromMap('series', 'series-lang', { LegacyOnly: '旧版' })
    const resolved = GlossaryService.resolve('series-lang', { targetLanguage: 'zh-CN' })
    expect(resolved.Scoped).toBe('语言对')
    expect(resolved.LegacyOnly).toBe('旧版')
  })

  it('creates and rolls back a snapshot', () => {
    GlossaryService.create({ source: 'Hero', target: '英雄', scopeType: 'series', scopeKey: 'series-snapshot' })
    const snapshotId = GlossaryService.createSnapshot({ name: 'before', scopeType: 'series', scopeKey: 'series-snapshot' })
    const hero = GlossaryService.list({ scopeType: 'series', scopeKey: 'series-snapshot' }).entries.find(entry => entry.source === 'Hero')!
    GlossaryService.update(hero.id, { target: '主角' })
    GlossaryService.create({ source: 'Villain', target: '反派', scopeType: 'series', scopeKey: 'series-snapshot' })
    expect(GlossaryService.resolve('series-snapshot').Villain).toBe('反派')

    expect(GlossaryService.rollbackSnapshot(snapshotId)).toBe(true)
    const resolved = GlossaryService.resolve('series-snapshot')
    expect(resolved.Hero).toBe('英雄')
    expect(resolved.Villain).toBeUndefined()
  })
})
