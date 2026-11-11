export const REVIEW_STATUS_LABELS: Record<string, string> = {
  translated: '已翻译',
  accepted_same: '同文可接受',
  needs_review: '需核对',
  fallback_original: '已回退',
  missing: '缺失',
  edited: '已编辑'
}

export type ReviewStatusColor = 'success' | 'primary' | 'warning' | 'error' | 'info' | 'neutral'

export const REVIEW_STATUS_COLORS: Record<string, ReviewStatusColor> = {
  translated: 'success',
  accepted_same: 'primary',
  needs_review: 'warning',
  fallback_original: 'error',
  missing: 'error',
  edited: 'info'
}

export const REVIEW_REASON_LABELS: Record<string, string> = {
  missing: '缺少译文',
  same_as_source: '译文与原文相同',
  same_as_source_allowed: '同文可接受',
  latin_heavy: '译文仍偏原语言',
  bilingual_duplicate: '双语内容重复',
  suspected_contamination: '疑似串条/混入相邻字幕',
  overlong_translation: '译文异常偏长',
  suspected_shift: '疑似错位/串行',
  low_asr_confidence: 'ASR 置信度偏低',
  low_quality_translation: '双模型质量评分偏低',
  quality_empty: '译文为空',
  line_too_long: '单行过长',
  too_many_lines: '行数过多',
  cps_too_high: '阅读速度过快',
  duration_too_short: '显示时间过短',
  duration_too_long: '显示时间过长',
  timing_overlap: '时间轴重叠',
  gap_too_small: '字幕间隔过短',
  untranslated_sdh: '残留英文音效标记'
}

export const QUALITY_ISSUE_LABELS: Record<string, string> = {
  omission: '漏译',
  addition: '增译',
  mistranslation: '误译',
  fluency: '不自然',
  terminology: '术语不一致',
  formatting: '格式/标点',
  name_inconsistency: '人名不一致',
  style_mismatch: '风格不匹配',
  other: '其他问题'
}

export const PROOFREAD_ISSUE_LABELS: Record<string, string> = {
  name_inconsistency: '人名/译名不一致',
  terminology: '术语不一致',
  mistranslation: '疑似误译',
  omission: '漏译',
  addition: '增译',
  fluency: '不自然',
  formatting: '格式/标点',
  style_mismatch: '风格不匹配',
  other: '其他问题'
}

export function reviewStatusLabel(status: string) {
  return REVIEW_STATUS_LABELS[status] || status
}

export function reviewStatusColor(status: string): ReviewStatusColor {
  return REVIEW_STATUS_COLORS[status] || 'neutral'
}

export function reviewReasonLabel(reason: string) {
  return REVIEW_REASON_LABELS[reason] || reason
}

export function qualityIssueLabel(issue: string) {
  return QUALITY_ISSUE_LABELS[issue] || issue
}

export function proofreadIssueLabel(type: string) {
  return PROOFREAD_ISSUE_LABELS[type] || type
}
