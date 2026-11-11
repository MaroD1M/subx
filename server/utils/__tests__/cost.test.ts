import { describe, expect, it } from 'vitest'
import { CostService } from '../cost'

describe('cost pricing', () => {
  it('calculates per-million token costs', () => {
    expect(CostService.tokenCost(1_000_000, 500_000, 2, 8)).toBe(6)
    expect(CostService.tokenCost(0, 0, 2, 8)).toBe(0)
  })
})
