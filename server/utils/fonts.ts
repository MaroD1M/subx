import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const FONT_CACHE_TTL_MS = 10 * 60 * 1000
const COMMAND_TIMEOUT_MS = 5000

let fontCache: { expiresAt: number, fonts: string[] } | null = null

function normalizeFamilyList(output: string): string[] {
  const families = new Set<string>()
  for (const line of String(output || '').split(/\r?\n/)) {
    for (const part of line.split(',')) {
      const family = part.trim()
      if (family) families.add(family)
    }
  }
  return [...families].sort((a, b) => a.localeCompare(b, 'en'))
}

export async function listServerFonts(): Promise<string[]> {
  const now = Date.now()
  if (fontCache && fontCache.expiresAt > now) return fontCache.fonts

  try {
    const { stdout } = await execFileAsync('fc-list', [':', 'family'], {
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: 8 * 1024 * 1024
    })
    const fonts = normalizeFamilyList(stdout)
    fontCache = { expiresAt: now + FONT_CACHE_TTL_MS, fonts }
    return fonts
  } catch {
    return []
  }
}

export async function resolveServerFont(fontFamily: string): Promise<string | null> {
  const family = String(fontFamily || '').trim()
  if (!family) return null
  try {
    const { stdout } = await execFileAsync('fc-match', ['-f', '%{family}', family], {
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: 64 * 1024
    })
    return String(stdout || '').split(',')[0]?.trim() || null
  } catch {
    return null
  }
}

export function clearServerFontCache() {
  fontCache = null
}
