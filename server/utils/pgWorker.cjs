const { parentPort, workerData } = require('worker_threads')
const { Pool } = require('pg')

const header = new Int32Array(workerData.shared, 0, 4)
const bytes = new Uint8Array(workerData.shared, 16)
const pool = new Pool({ connectionString: workerData.connectionString, max: Number(process.env.PG_POOL_SIZE || 5) })
pool.on('error', (error) => console.error('[PostgreSQL] idle client error:', error))

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

parentPort.on('message', async () => {
  const length = Atomics.load(header, 1)
  const request = JSON.parse(Buffer.from(bytes.slice(0, length)).toString('utf8'))
  try {
    const result = await pool.query(request.sql, request.params || [])
    respond({ ok: true, result: { rows: result.rows, rowCount: result.rowCount } })
  } catch (error) {
    respond({ ok: false, error: String(error?.message || error) })
  }
})

process.on('SIGTERM', () => { pool.end().finally(() => process.exit(0)) })
