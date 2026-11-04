import { describe, expect, it, vi } from 'vitest'
import {
  installRouterHistoryGuard,
  shouldSkipHiddenScrollReplaceState
} from '../../app/utils/historyGuard'

const EDGE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0'
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

describe('Edge router history guard', () => {
  it('only skips hidden scroll-only replaceState calls', () => {
    expect(shouldSkipHiddenScrollReplaceState({
      visibilityState: 'hidden',
      state: { scroll: { left: 0, top: 120 } },
      url: undefined
    })).toBe(true)
    expect(shouldSkipHiddenScrollReplaceState({
      visibilityState: 'hidden',
      state: { scroll: { left: 0, top: 120 } },
      url: ''
    })).toBe(true)
    expect(shouldSkipHiddenScrollReplaceState({
      visibilityState: 'visible',
      state: { scroll: { left: 0, top: 120 } },
      url: undefined
    })).toBe(false)
    expect(shouldSkipHiddenScrollReplaceState({
      visibilityState: 'hidden',
      state: { scroll: { left: 0, top: 120 } },
      url: '/history'
    })).toBe(false)
    expect(shouldSkipHiddenScrollReplaceState({
      visibilityState: 'hidden',
      state: { back: null },
      url: undefined
    })).toBe(false)
  })

  it('patches Edge and preserves normal route replaceState', () => {
    const original = vi.fn()
    const history = { replaceState: original }
    const documentLike = { visibilityState: 'hidden' }

    expect(installRouterHistoryGuard(history, documentLike, EDGE_UA)).toBe(true)
    history.replaceState({ scroll: { left: 0, top: 20 } }, '')
    expect(original).not.toHaveBeenCalled()

    history.replaceState({ scroll: { left: 0, top: 20 } }, '', '/history')
    expect(original).toHaveBeenCalledTimes(1)
  })

  it('does not apply to Chrome', () => {
    const original = vi.fn()
    const history = { replaceState: original }

    expect(installRouterHistoryGuard(history, { visibilityState: 'hidden' }, CHROME_UA)).toBe(false)
    history.replaceState({ scroll: { left: 0, top: 20 } }, '')
    expect(original).toHaveBeenCalledTimes(1)
  })

  it('is idempotent', () => {
    const history = { replaceState: vi.fn() }
    expect(installRouterHistoryGuard(history, { visibilityState: 'hidden' }, EDGE_UA)).toBe(true)
    expect(installRouterHistoryGuard(history, { visibilityState: 'hidden' }, EDGE_UA)).toBe(false)
  })
})
