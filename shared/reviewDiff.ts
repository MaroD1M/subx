export interface ReviewDiffSourceEntry {
  subtitleId: string | number
  originalText?: string
  translatedText?: string
  finalText?: string
  startTime?: string
  endTime?: string
}

export interface ReviewDiffRow {
  subtitleId: string
  originalText: string
  aText: string
  bText: string
  aTime: string
  bTime: string
  status: 'same' | 'changed' | 'added' | 'removed'
}

function keyOf(entry: ReviewDiffSourceEntry) {
  return String(entry.subtitleId ?? '')
}

function textOf(entry: ReviewDiffSourceEntry | undefined) {
  if (!entry) return ''
  return String(entry.finalText || entry.translatedText || '')
}

function timeOf(entry: ReviewDiffSourceEntry | undefined) {
  if (!entry) return ''
  return `${entry.startTime || ''} --> ${entry.endTime || ''}`
}

export function diffReviewEntries(aEntries: ReviewDiffSourceEntry[], bEntries: ReviewDiffSourceEntry[]): ReviewDiffRow[] {
  const aMap = new Map(aEntries.map(entry => [keyOf(entry), entry]))
  const bMap = new Map(bEntries.map(entry => [keyOf(entry), entry]))
  const keys = Array.from(new Set([...aMap.keys(), ...bMap.keys()]))
  const rows: ReviewDiffRow[] = []
  for (const key of keys) {
    if (!key) continue
    const a = aMap.get(key)
    const b = bMap.get(key)
    const aText = textOf(a)
    const bText = textOf(b)
    const aTime = timeOf(a)
    const bTime = timeOf(b)
    const status: ReviewDiffRow['status'] = !a ? 'added' : !b ? 'removed' : (aText === bText && aTime === bTime ? 'same' : 'changed')
    if (status === 'same') continue
    rows.push({
      subtitleId: key,
      originalText: String(b?.originalText || a?.originalText || ''),
      aText,
      bText,
      aTime,
      bTime,
      status
    })
  }
  return rows.sort((left, right) => Number(left.subtitleId) - Number(right.subtitleId) || left.subtitleId.localeCompare(right.subtitleId))
}
