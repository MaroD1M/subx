import { beforeAll, describe, expect, it, vi } from 'vitest'

let validateMediaRoots: typeof import('../mediaRoots').validateMediaRoots

beforeAll(async () => {
  vi.stubGlobal('createError', (options: any) => Object.assign(new Error(options?.message || 'error'), options))
  validateMediaRoots = (await import('../mediaRoots')).validateMediaRoots
})

describe('media root validation', () => {
  it('trims names and normalizes paths', () => {
    const roots = validateMediaRoots([
      { id: 'default', name: ' 影视库 ', path: '/media/movies/../movies', enabled: true, isDefault: true, order: 0 }
    ])
    expect(roots[0]?.name).toBe('影视库')
    expect(roots[0]?.path).toBe('/media/movies')
  })

  it('normalizes duplicate ids from old configurations', () => {
    const roots = validateMediaRoots([
      { id: 'dup', name: 'A', path: '/media/a', enabled: true, isDefault: true, order: 0 },
      { id: 'dup', name: 'B', path: '/media/b', enabled: true, order: 1 }
    ])
    expect(new Set(roots.map(root => root.id)).size).toBe(2)
    expect(roots[1]?.id).not.toBe('dup')
  })

  it('keeps exactly one default among active roots', () => {
    const roots = validateMediaRoots([
      { id: 'a', name: 'A', path: '/media/a', enabled: true, isDefault: true, order: 0 },
      { id: 'b', name: 'B', path: '/media/b', enabled: true, isDefault: true, order: 1 },
      { id: 'c', name: 'C', path: '/media/c', enabled: false, isDefault: true, order: 2 }
    ])
    expect(roots.filter(root => root.isDefault)).toHaveLength(1)
    expect(roots.find(root => root.id === 'a')?.isDefault).toBe(true)
    expect(roots.find(root => root.id === 'c')?.isDefault).toBe(false)
  })

  it('moves the default to the first active root when needed', () => {
    const roots = validateMediaRoots([
      { id: 'a', name: 'A', path: '/media/a', enabled: false, isDefault: true, order: 0 },
      { id: 'b', name: 'B', path: '/media/b', enabled: true, order: 1 }
    ])
    expect(roots.find(root => root.id === 'b')?.isDefault).toBe(true)
  })

  it('rejects duplicate enabled paths', () => {
    expect(() => validateMediaRoots([
      { id: 'a', name: 'A', path: '/media/a', enabled: true, isDefault: true, order: 0 },
      { id: 'b', name: 'B', path: '/media/a', enabled: true, order: 1 }
    ])).toThrow(/路径重复/)
  })
})
