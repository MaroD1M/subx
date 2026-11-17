import type { SubtitleEntry } from '../../types'

export function mergePreviewEntries(entries: SubtitleEntry[]): SubtitleEntry[] {
  const merged: SubtitleEntry[] = []

  for (const entry of entries) {
    const text = String(entry.text || '').trim()
    const previous = merged[merged.length - 1]
    const sameTiming = previous
      && previous.startTime === entry.startTime
      && previous.endTime === entry.endTime

    if (sameTiming) {
      const existing = String(previous.text || '').trim()
      const existingLines = new Set(existing.split('\n').map(line => line.trim()).filter(Boolean))
      if (!text || existingLines.has(text)) continue
      previous.text = existing ? `${existing}\n${text}` : text
      continue
    }

    merged.push({
      ...entry,
      id: String(merged.length + 1),
      text
    })
  }

  return merged
}
