import { readFileSync } from 'fs'
import { join } from 'path'

export default defineEventHandler(() => {
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'))
    return { version: pkg.version || 'unknown' }
  } catch {
    return { version: 'unknown' }
  }
})
