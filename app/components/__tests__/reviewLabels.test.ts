import { describe, expect, it } from 'vitest'
import {
  QUALITY_ISSUE_LABELS,
  PROOFREAD_ISSUE_LABELS,
  REVIEW_REASON_LABELS,
  REVIEW_STATUS_COLORS,
  REVIEW_STATUS_LABELS,
  proofreadIssueLabel,
  qualityIssueLabel,
  reviewReasonLabel,
  reviewStatusColor,
  reviewStatusLabel
} from '~~/shared/reviewLabels'

describe('shared review labels', () => {
  it('maps every review status and falls back to the raw value', () => {
    expect(REVIEW_STATUS_LABELS).toEqual({
      translated: '已翻译',
      accepted_same: '同文可接受',
      needs_review: '需核对',
      fallback_original: '已回退',
      missing: '缺失',
      edited: '已编辑'
    })
    expect(reviewStatusLabel('needs_review')).toBe('需核对')
    expect(reviewStatusLabel('unknown_status')).toBe('unknown_status')
    expect(reviewStatusColor('needs_review')).toBe('warning')
    expect(reviewStatusColor('unknown_status')).toBe('neutral')
    expect(Object.keys(REVIEW_STATUS_COLORS)).toEqual(Object.keys(REVIEW_STATUS_LABELS))
  })

  it('covers all review reasons emitted by the server, including suspected_shift', () => {
    expect(REVIEW_REASON_LABELS).toMatchObject({
      missing: '缺少译文',
      same_as_source: '译文与原文相同',
      same_as_source_allowed: '同文可接受',
      latin_heavy: '译文仍偏原语言',
      bilingual_duplicate: '双语内容重复',
      suspected_contamination: '疑似串条/混入相邻字幕',
      overlong_translation: '译文异常偏长',
      suspected_shift: '疑似错位/串行',
      low_asr_confidence: 'ASR 置信度偏低',
      low_quality_translation: '双模型质量评分偏低'
    })
    expect(reviewReasonLabel('suspected_shift')).toBe('疑似错位/串行')
    expect(reviewReasonLabel('unknown_reason')).toBe('unknown_reason')
  })

  it('maps quality issues and proofread issues separately', () => {
    expect(qualityIssueLabel('name_inconsistency')).toBe('人名不一致')
    expect(qualityIssueLabel('omission')).toBe('漏译')
    expect(qualityIssueLabel('other')).toBe('其他问题')
    expect(qualityIssueLabel('unknown')).toBe('unknown')

    expect(proofreadIssueLabel('name_inconsistency')).toBe('人名/译名不一致')
    expect(proofreadIssueLabel('mistranslation')).toBe('疑似误译')
    expect(proofreadIssueLabel('style_mismatch')).toBe('风格不匹配')
    expect(proofreadIssueLabel('unknown')).toBe('unknown')

    expect(Object.keys(QUALITY_ISSUE_LABELS)).toEqual([
      'omission',
      'addition',
      'mistranslation',
      'fluency',
      'terminology',
      'formatting',
      'name_inconsistency',
      'style_mismatch',
      'other'
    ])
    expect(Object.keys(PROOFREAD_ISSUE_LABELS)).toEqual([
      'name_inconsistency',
      'terminology',
      'mistranslation',
      'omission',
      'addition',
      'fluency',
      'formatting',
      'style_mismatch',
      'other'
    ])
  })
})
