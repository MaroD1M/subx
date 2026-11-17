import { describe, expect, it } from 'vitest'
import { diffReviewEntries } from '../../shared/reviewDiff'

describe('diffReviewEntries', () => {
  it('detects changed, added and removed entries', () => {
    const rows = diffReviewEntries(
      [
        { subtitleId: '1', finalText: 'A', startTime: '00:00:01,000', endTime: '00:00:02,000' },
        { subtitleId: '2', finalText: 'B', startTime: '00:00:02,000', endTime: '00:00:03,000' }
      ],
      [
        { subtitleId: '1', finalText: 'A', startTime: '00:00:01,000', endTime: '00:00:02,000' },
        { subtitleId: '2', finalText: 'B2', startTime: '00:00:02,000', endTime: '00:00:03,000' },
        { subtitleId: '3', finalText: 'C', startTime: '00:00:03,000', endTime: '00:00:04,000' }
      ]
    )
    expect(rows.map(row => [row.subtitleId, row.status])).toEqual([
      ['2', 'changed'],
      ['3', 'added']
    ])
  })
})
