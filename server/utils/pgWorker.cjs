const { parentPort, workerData } = require('worker_threads')
const { Pool } = require('pg')

const header = new Int32Array(workerData.shared, 0, 4)
const bytes = new Uint8Array(workerData.shared, 16)
const pool = new Pool({ connectionString: workerData.connectionString, max: Number(process.env.PG_POOL_SIZE || 5) })
pool.on('error', (error) => console.error('[PostgreSQL] idle client error:', error))
pool.on('connect', (client) => {
  const statementTimeout = Math.max(1000, Number(process.env.PG_STATEMENT_TIMEOUT_MS || 120000))
  const idleTxTimeout = Math.max(1000, Number(process.env.PG_IDLE_TX_TIMEOUT_MS || 120000))
  client.query(`SET statement_timeout = ${statementTimeout}`).catch((error) => console.error('[PostgreSQL] set statement_timeout failed:', error))
  client.query(`SET idle_in_transaction_session_timeout = ${idleTxTimeout}`).catch((error) => console.error('[PostgreSQL] set idle timeout failed:', error))
})

function respond(payload) {
  payload.seq = Atomics.load(header, 3)
  const json = Buffer.from(JSON.stringify(payload))
  if (json.length > bytes.length) {
    const error = Buffer.from(JSON.stringify({ ok: false, error: `PostgreSQL 结果超过共享缓冲区限制 (${json.length} bytes)` }))
    bytes.set(error.slice(0, bytes.length))
    Atomics.store(header, 2, Math.min(error.length, bytes.length))
  } else {
    bytes.set(json)
    Atomics.store(header, 2, json.length)
  }
  Atomics.store(header, 0, 1)
  Atomics.notify(header, 0)
}

let txClient = null

parentPort.on('message', async () => {
  const length = Atomics.load(header, 1)
  const request = JSON.parse(Buffer.from(bytes.slice(0, length)).toString('utf8'))
  const sql = String(request.sql || '')
  try {
    if (/^\s*BEGIN\s*;?\s*$/i.test(sql)) {
      if (txClient) throw new Error('PostgreSQL 不支持嵌套事务')
      txClient = await pool.connect()
      try {
        await txClient.query('BEGIN')
      } catch (error) {
        txClient.release()
        txClient = null
        throw error
      }
      respond({ ok: true, result: { rows: [], rowCount: 0 } })
      return
    }
    if (/^\s*(COMMIT|ROLLBACK)\s*;?\s*$/i.test(sql)) {
      if (!txClient) throw new Error('当前没有活动事务')
      const command = /^\s*ROLLBACK/i.test(sql) ? 'ROLLBACK' : 'COMMIT'
      try {
        await txClient.query(command)
      } finally {
        txClient.release()
        txClient = null
      }
      respond({ ok: true, result: { rows: [], rowCount: 0 } })
      return
    }
    const runner = txClient || pool
    const result = await runner.query(sql, request.params || [])
    respond({ ok: true, result: { rows: result.rows, rowCount: result.rowCount } })
  } catch (error) {
    respond({ ok: false, error: String(error?.message || error) })
  }
})

process.on('SIGTERM', () => { pool.end().finally(() => process.exit(0)) })
