import { Pool } from 'pg'
import { BufferJSON } from '@whiskeysockets/baileys'

// Helpers to store/revive Buffers & typed arrays inside JSONB
const encodeForJsonB = (value) => JSON.parse(JSON.stringify(value, BufferJSON.replacer))
const decodeFromJsonB = (value) => JSON.parse(JSON.stringify(value), BufferJSON.reviver)

export const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || '',
  database: process.env.PGDATABASE || 'postgres',
  max: 10,
  idleTimeoutMillis: 30_000,
})

export async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_kv (
      key   TEXT PRIMARY KEY,
      value JSONB NOT NULL
    );
  `)
}

export async function readAuthData(key) {
  const { rows } = await pool.query('SELECT value FROM auth_kv WHERE key = $1', [key])
  if (!rows[0]) return undefined
  return decodeFromJsonB(rows[0].value)
}

export async function writeAuthData(key, value) {
  if (value == null) {
    await removeAuthData(key)
    return
  }
  try {
    const enc = encodeForJsonB(value)
    await pool.query(
      'INSERT INTO auth_kv(key, value) VALUES($1, $2) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value',
      [key, enc]
    )
  } catch (err) {
    console.warn('[DB WARN] Skipped malformed JSON for', key, err.message)
  }
}

export async function removeAuthData(key) {
  await pool.query('DELETE FROM auth_kv WHERE key = $1', [key])
}

// -------- batch helpers used by setMulti/clear --------
export async function keysReadMany(type, ids) {
  if (!ids?.length) return {}
  const keys = ids.map((id) => `${type}-${id}`)
  const { rows } = await pool.query('SELECT key, value FROM auth_kv WHERE key = ANY($1)', [keys])
  const out = {}
  for (const r of rows) {
    const id = r.key.substring(`${type}-`.length)
    out[id] = decodeFromJsonB(r.value)
  }
  return out
}

export async function keysUpsertMany(entries) {
  if (!entries?.length) return
  const valid = entries.filter(e => e.value != null && typeof e.value !== 'undefined')
  if (!valid.length) return
  const valuesSql = valid.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(',')
  const params = []
  for (const { type, id, value } of valid) {
    params.push(`${type}-${id}`, encodeForJsonB(value))
  }
  const sql = `INSERT INTO auth_kv(key, value) VALUES ${valuesSql}
               ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value`
  try {
    await pool.query(sql, params)
  } catch (err) {
    console.warn('[DB WARN] Skipped some malformed key batch:', err.message)
  }
}
export async function keysDeleteMany(type, ids) {
  if (!ids?.length) return
  const keys = ids.map((id) => `${type}-${id}`)
  await pool.query('DELETE FROM auth_kv WHERE key = ANY($1)', [keys])
}


// ---- GROUP REGISTRY HELPERS ----
export async function readGroupRegistry() {
  try {
    const { rows } = await pool.query('SELECT value FROM auth_kv WHERE key = $1', ['groups_registry'])
    if (!rows[0]) return []
    return rows[0].value || []
  } catch (err) {
    console.error('Failed to read group registry:', err.message)
    return []
  }
}

export async function writeGroupRegistry(groups) {
  try {
    await pool.query(
      'INSERT INTO auth_kv(key, value) VALUES($1, $2) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value',
      ['groups_registry', JSON.stringify(groups)]
    )
  } catch (err) {
    console.error('Failed to write group registry:', err.message)
  }
}


export async function clearAllData() {
  try {
    await pool.query('DELETE FROM auth_kv')
    console.log(' All auth & group data cleared from database.')
  } catch (err) {
    console.error('Failed to clear all data:', err.message)
  }
}
