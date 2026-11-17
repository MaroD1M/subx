function getPath(context: Record<string, any>, path: string) {
  return path.split('.').reduce<any>((value, part) => {
    if (value == null) return undefined
    return value[part]
  }, context)
}

function stringifyValue(value: unknown) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function jsonPart(value: unknown) {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'object') return JSON.stringify(value)
  return JSON.stringify(String(value)).slice(1, -1)
}

const VARIABLE_PATTERN = /\{\{\s*([\w.]+)\s*\}\}/g

export function renderNotificationTemplate(template: string, context: Record<string, any>, fallback = ''): string {
  const text = String(template || '')
  if (!text.trim()) return fallback
  return text.replace(VARIABLE_PATTERN, (_match, path: string) => stringifyValue(getPath(context, path)))
}

export function renderNotificationJsonTemplate(template: string, context: Record<string, any>): any {
  const text = String(template || '').trim()
  if (!text) return null
  const rendered = text.replace(VARIABLE_PATTERN, (_match, path: string) => jsonPart(getPath(context, path)))
  return JSON.parse(rendered)
}
