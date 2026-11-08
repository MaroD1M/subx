const formattingTokenPattern = /\{[^}]+\}|<\/?\s*(?:i|b|u)\s*>|<\s*font[^>]*>|<\s*\/\s*font\s*>/gi
export const formattingPlaceholderPattern = /__SUBX_FMT_\d+__/g

export type FormattingTarget = 'srt' | 'ass'
export type FormattingToken = { placeholder: string; value: string }
type TemplateSlot = { placeholder?: string; text: string }

export const SubtitleFormatting = {
  buildFormattingPlaceholder(this: any, index: number): string {
    return `__SUBX_FMT_${index}__`
  },

  protectFormattingTokens(this: any, text: unknown): { text: string; formattingTokens: FormattingToken[] } {
    const normalized = this.normalizeSubtitleText(text).replace(/\\[nN]/g, '\n')
    const formattingTokens: FormattingToken[] = []
    let tokenIndex = 0

    const protectedText = normalized.replace(formattingTokenPattern, (match: string) => {
      tokenIndex += 1
      const placeholder = this.buildFormattingPlaceholder(tokenIndex)
      formattingTokens.push({ placeholder, value: match })
      return placeholder
    })

    return { text: protectedText.trim(), formattingTokens }
  },

  hasAssDrawing(this: any, rawText: string): boolean {
    const payload = this.parseAssTextPayload(rawText)
    const parsed = Array.isArray((payload as any)?.parsed) ? (payload as any).parsed : []
    return parsed.some((segment: any) => {
      const tags = Array.isArray(segment?.tags) ? segment.tags : []
      return tags.some((tag: any) => Number(tag?.p) > 0)
    })
  },

  shouldPreserveAssRawText(this: any, rawText: string): boolean {
    return this.hasAssDrawing(rawText)
  },

  convertFormattingTokenToAss(this: any, value: string): string {
    if (/^<\s*i\s*>$/i.test(value)) return '{\\i1}'
    if (/^<\s*\/\s*i\s*>$/i.test(value)) return '{\\i0}'
    if (/^<\s*b\s*>$/i.test(value)) return '{\\b1}'
    if (/^<\s*\/\s*b\s*>$/i.test(value)) return '{\\b0}'
    if (/^<\s*u\s*>$/i.test(value)) return '{\\u1}'
    if (/^<\s*\/\s*u\s*>$/i.test(value)) return '{\\u0}'
    if (/^<\s*font[^>]*>$/i.test(value) || /^<\s*\/\s*font\s*>$/i.test(value)) return ''
    return value
  },

  restoreFormattingTokens(
    this: any,
    text: unknown,
    formattingTokens: FormattingToken[] = [],
    target: FormattingTarget
  ): string {
    let restored = this.normalizeSubtitleText(text)
    for (const token of formattingTokens) {
      const value = target === 'ass' ? this.convertFormattingTokenToAss(token.value) : token.value
      restored = restored.split(token.placeholder).join(value)
    }
    return restored
  },

  extractFormattingPlaceholderSequence(this: any, text: string): string[] {
    return text.match(formattingPlaceholderPattern) || []
  },

  splitTemplateSlots(this: any, text: string, formattingTokens: FormattingToken[] = []): TemplateSlot[] {
    if (formattingTokens.length === 0) {
      return [{ text }]
    }

    const slots: TemplateSlot[] = []
    let cursor = 0

    for (const token of formattingTokens) {
      const index = text.indexOf(token.placeholder, cursor)
      if (index === -1) continue

      slots.push({ text: text.slice(cursor, index) })
      slots.push({ placeholder: token.placeholder, text: '' })
      cursor = index + token.placeholder.length
    }

    slots.push({ text: text.slice(cursor) })
    return slots.length > 0 ? slots : [{ text }]
  },

  splitTextByWeights(this: any, text: string, weights: number[]): string[] {
    if (weights.length === 0) return [text]

    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
    if (totalWeight <= 0) {
      return weights.map((_, index) => (index === 0 ? text : ''))
    }

    const characters = Array.from(text)
    const totalChars = characters.length
    const segments = new Array(weights.length).fill('')

    let consumed = 0
    for (let i = 0; i < weights.length; i++) {
      const remainingWeight = weights.slice(i).reduce((sum, weight) => sum + weight, 0)
      const remainingChars = totalChars - consumed
      const take =
        i === weights.length - 1
          ? remainingChars
          : Math.max(0, Math.min(remainingChars, Math.round(((weights[i] || 0) / remainingWeight) * remainingChars)))

      segments[i] = characters.slice(consumed, consumed + take).join('')
      consumed += take
    }

    if (consumed < totalChars) {
      segments[segments.length - 1] += characters.slice(consumed).join('')
    }

    return segments
  },

  remapReorderedFormattingPlaceholders(
    this: any,
    text: string,
    expectedSequence: string[],
    actualSequence: string[]
  ): string | null {
    if (expectedSequence.length === 0 || expectedSequence.length !== actualSequence.length) {
      return null
    }

    const expectedSet = new Set(expectedSequence)
    if (actualSequence.some((placeholder) => !expectedSet.has(placeholder))) {
      return null
    }

    const uniqueActual = new Set(actualSequence)
    if (uniqueActual.size !== actualSequence.length) {
      return null
    }

    const pattern = /(__SUBX_FMT_\d+__)/g
    const segments = this.normalizeSubtitleText(text).split(pattern)
    const mappedText = new Map<string, string>()

    for (let i = 1; i < segments.length; i += 2) {
      mappedText.set(segments[i]!, segments[i + 1] || '')
    }

    return expectedSequence.map((placeholder) => `${placeholder}${mappedText.get(placeholder) || ''}`).join('')
  },

  rebuildFormattingPlaceholders(
    this: any,
    text: string,
    templateText: string,
    formattingTokens: FormattingToken[] = []
  ): string {
    if (formattingTokens.length === 0) return text

    const plainText = this.normalizeSubtitleText(text).replace(formattingPlaceholderPattern, '')
    const slots = this.splitTemplateSlots(templateText, formattingTokens) as TemplateSlot[]
    const textSlots = slots.filter((slot) => !slot.placeholder)
    const weights = textSlots.map((slot) => Array.from(slot.text.replace(/\s+/g, '')).length)
    const distributed = this.splitTextByWeights(
      plainText,
      weights.some(Boolean) ? weights : textSlots.map((_, index) => (index === 0 ? 1 : 0))
    )

    let textIndex = 0
    return slots
      .map((slot) => {
        if (slot.placeholder) return slot.placeholder
        const value = distributed[textIndex] || ''
        textIndex += 1
        return value
      })
      .join('')
  },

  stabilizeFormattingPlaceholders(
    this: any,
    text: unknown,
    templateText: unknown,
    formattingTokens: FormattingToken[] = []
  ): string {
    const normalized = this.normalizeSubtitleText(text).replace(/\\[nN]/g, '\n')
    if (formattingTokens.length === 0) return normalized

    const expectedSequence = formattingTokens.map((token) => token.placeholder)
    const actualSequence = this.extractFormattingPlaceholderSequence(normalized)
    const isExactMatch =
      expectedSequence.length === actualSequence.length &&
      expectedSequence.every((placeholder, index) => placeholder === actualSequence[index])

    if (isExactMatch) {
      return normalized
    }

    const reordered = this.remapReorderedFormattingPlaceholders(normalized, expectedSequence, actualSequence)
    if (reordered) {
      return reordered
    }

    return this.rebuildFormattingPlaceholders(normalized, this.normalizeSubtitleText(templateText), formattingTokens)
  },

  stripInlineAssTags(this: any, text: string): string {
    return text.replace(/\{[^}]+\}/g, '')
  },

  stripBasicHtmlTags(this: any, text: string): string {
    return text
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\/?\s*(i|b|u)\s*>/gi, '')
      .replace(/<\s*font[^>]*>/gi, '')
      .replace(/<\s*\/\s*font\s*>/gi, '')
  },

  normalizeModelOutputText(this: any, text: unknown): string {
    const normalized = this.normalizeSubtitleText(text).replace(/\\[nN]/g, '\n')
    const withoutCueTags = normalized.replace(/(^|\n)\s*(?:\{\\[^}]+\}\s*)+/g, '$1')
    const withoutStrayLeadingSlash = withoutCueTags.replace(/(^|\n)\\(?![Nnh{}\\])/g, '$1')

    return this.stripBasicHtmlTags(this.stripInlineAssTags(withoutStrayLeadingSlash)).trim()
  }
}
