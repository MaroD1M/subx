import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { join } from 'path'
import { SQLITE_SCHEMA_SQL } from '../schema'

function sqliteTables() {
  const db = new Database(':memory:')
  db.exec(SQLITE_SCHEMA_SQL)
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>).map(row => row.name)
  const result = new Map<string, string[]>()
  for (const table of tables) {
    const columns = (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(row => row.name)
    result.set(table, columns)
  }
  db.close()
  return result
}

function postgresTables() {
  const sql = readFileSync(join(process.cwd(), 'scripts', 'postgres-schema.sql'), 'utf8')
  const result = new Map<string, string[]>()
  const tablePattern = /CREATE TABLE IF NOT EXISTS\s+([a-z_][\w]*)\s*\(([\s\S]*?)\n\);/gi
  for (const match of sql.matchAll(tablePattern)) {
    const table = match[1]!
    const columns: string[] = []
    for (const rawLine of match[2]!.split('\n')) {
      const line = rawLine.trim().replace(/,$/, '')
      if (!line) continue
      if (/^(UNIQUE|PRIMARY\s+KEY|CONSTRAINT|FOREIGN|CHECK)\b/i.test(line)) continue
      const column = line.match(/^([a-z_][\w]*)\s+/i)?.[1]
      if (column) columns.push(column)
    }
    result.set(table, columns)
  }
  return result
}

describe('database schema parity', () => {
  it('keeps SQLite and PostgreSQL table names aligned', () => {
    const sqlite = sqliteTables()
    const postgres = postgresTables()
    expect(Array.from(postgres.keys()).sort()).toEqual(Array.from(sqlite.keys()).sort())
  })

  it('keeps SQLite and PostgreSQL table columns aligned', () => {
    const sqlite = sqliteTables()
    const postgres = postgresTables()
    for (const [table, columns] of sqlite) {
      expect(postgres.get(table), `missing PostgreSQL table ${table}`).toBeDefined()
      expect(new Set(postgres.get(table)), `column drift in ${table}`).toEqual(new Set(columns))
    }
  })
})
