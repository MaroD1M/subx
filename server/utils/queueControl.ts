import { useDb } from './db'
import { toUtcIsoString } from '~~/shared/time'

export interface QueueControlState {
  paused: boolean
  pausedAt?: string
  pausedBy?: string
  updatedAt?: string
}

function ensureRow() {
  useDb().prepare('INSERT OR IGNORE INTO queue_control (id) VALUES (1)').run()
}

export const QueueControlService = {
  get(): QueueControlState {
    try {
      ensureRow()
      const row = useDb().prepare('SELECT paused, paused_at, paused_by, updated_at FROM queue_control WHERE id = 1').get() as any
      return {
        paused: Number(row?.paused || 0) === 1,
        pausedAt: row?.paused_at ? toUtcIsoString(row.paused_at) : undefined,
        pausedBy: row?.paused_by ? String(row.paused_by) : undefined,
        updatedAt: row?.updated_at ? toUtcIsoString(row.updated_at) : undefined
      }
    } catch {
      return { paused: false }
    }
  },

  isPaused(): boolean {
    return this.get().paused
  },

  setPaused(paused: boolean, pausedBy = ''): QueueControlState {
    ensureRow()
    if (paused) {
      useDb().prepare(`
        UPDATE queue_control
        SET paused = 1, paused_at = datetime('now'), paused_by = ?, updated_at = datetime('now')
        WHERE id = 1
      `).run(String(pausedBy || '').slice(0, 120))
    } else {
      useDb().prepare(`
        UPDATE queue_control
        SET paused = 0, paused_at = NULL, paused_by = NULL, updated_at = datetime('now')
        WHERE id = 1
      `).run()
    }
    return this.get()
  }
}
