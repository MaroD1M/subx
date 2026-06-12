import { readFileSync } from 'fs'
import { join } from 'path'

export default defineEventHandler(async () => {
  const current = (() => {
    try {
      return JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8')).version || 'unknown'
    } catch { return 'unknown' }
  })()

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    const res = await fetch('https://api.github.com/repos/MaroD1M/subx/releases/latest', {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal
    })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json() as any
    const latest = String(data?.tag_name || '').replace(/^v/, '')
    return { current, latest, isUpToDate: current === latest }
  } catch (e: any) {
    return { current, latest: null, isUpToDate: null, error: e?.message || '无法获取' }
  }
})
