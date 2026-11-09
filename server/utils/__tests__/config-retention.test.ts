import { afterEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { redactExpiredTaskResponses } from '../config'

let db: Database.Database | null = null

function createDb() {
  db = new Database(':memory:')
  db.exec(`
    CREATE TABLE task_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      chunk_index INTEGER,
      model TEXT,
      raw_request TEXT,
      raw_response TEXT,
      response_meta TEXT,
      prompt_tokens INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
  return db
}

afterEach(() => {
  db?.close()
  db = null
})

describe('redactExpiredTaskResponses', () => {
  it('clears raw payloads for expired rows only and keeps metadata intact', () => {
    const database = createDb()
    const insert = database.prepare(`
      INSERT INTO task_responses
        (task_id, chunk_index, model, raw_request, raw_response, response_meta, prompt_tokens, completion_tokens, total_tokens, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?))
    `)

    insert.run('old-task', 0, 'm', '{"prompt":1}', '{"answer":1}', '{"risk":1}', 10, 20, 30, '-10 days')
    insert.run('boundary-task', 1, 'm', '{"prompt":2}', '{"answer":2}', '{"risk":2}', 11, 21, 32, '-8 days')
    insert.run('recent-task', 2, 'm', '{"prompt":3}', '{"answer":3}', '{"risk":3}', 12, 22, 34, '-1 days')

    const changes = redactExpiredTaskResponses(database, 7)
    expect(changes).toBe(2)

    expect(database.prepare('SELECT * FROM task_responses WHERE task_id = ?').get('old-task')).toMatchObject({
      raw_request: null,
      raw_response: null,
      response_meta: '{"risk":1}',
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
      chunk_index: 0
    })

    expect(database.prepare('SELECT raw_request, raw_response FROM task_responses WHERE task_id = ?').get('recent-task')).toEqual({
      raw_request: '{"prompt":3}',
      raw_response: '{"answer":3}'
    })
  })

  it('is idempotent and ignores rows whose payloads are already cleared', () => {
    const database = createDb()
    database.prepare(`
      INSERT INTO task_responses
        (task_id, chunk_index, raw_request, raw_response, response_meta, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now', ?))
    `).run('old-task', 0, '{"prompt":1}', '{"answer":1}', '{"risk":1}', '-10 days')

    expect(redactExpiredTaskResponses(database, 7)).toBe(1)
    expect(redactExpiredTaskResponses(database, 7)).toBe(0)
    expect(database.prepare('SELECT response_meta FROM task_responses WHERE task_id = ?').get('old-task')).toEqual({
      response_meta: '{"risk":1}'
    })
  })
})
