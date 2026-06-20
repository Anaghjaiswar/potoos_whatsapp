import Database from 'better-sqlite3';
import { BufferJSON } from '@whiskeysockets/baileys';
import path from 'path';

// Helpers to store/revive Buffers & typed arrays inside JSON
const encodeForJson = (value) => JSON.stringify(value, BufferJSON.replacer);
const decodeFromJson = (value) => JSON.parse(value, BufferJSON.reviver);

// Environment variable se db ka path uthayenge (Docker volume se mapped rahega)
const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'whatsapp.db');

// Database initialize karein
export const db = new Database(dbPath, { verbose: console.log });

// WAL mode active karein (Isse parallel read/write bohot fast ho jata hai)
db.pragma('journal_mode = WAL');

export async function ensureTables() {
  // SQLite me JSONB ki jagah TEXT datatype use hota hai aur data JSON string ban kar jata hai
  db.prepare(`
    CREATE TABLE IF NOT EXISTS auth_kv (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `).run();
}

export async function readAuthData(key) {
  const row = db.prepare('SELECT value FROM auth_kv WHERE key = ?').get(key);
  if (!row) return undefined;
  return decodeFromJson(row.value);
}

export async function writeAuthData(key, value) {
  if (value == null) {
    await removeAuthData(key);
    return;
  }
  try {
    const enc = encodeForJson(value);
    // SQLite me ON CONFLICT bilkul Postgres ki tarah kaam karta hai
    db.prepare(`
      INSERT INTO auth_kv(key, value) VALUES(?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, enc);
  } catch (err) {
    console.warn('[DB WARN] Skipped malformed JSON for', key, err.message);
  }
}

export async function removeAuthData(key) {
  db.prepare('DELETE FROM auth_kv WHERE key = ?').run(key);
}

// -------- batch helpers used by setMulti/clear --------
export async function keysReadMany(type, ids) {
  if (!ids?.length) return {};
  const keys = ids.map((id) => `${type}-${id}`);
  
  // SQLite me ANY($1) ki jagah dynamic IN clause banana padta hai
  const placeholders = keys.map(() => '?').join(',');
  const rows = db.prepare(`SELECT key, value FROM auth_kv WHERE key IN (${placeholders})`).all(...keys);
  
  const out = {};
  for (const r of rows) {
    const id = r.key.substring(`${type}-`.length);
    out[id] = decodeFromJson(r.value);
  }
  return out;
}

export async function keysUpsertMany(entries) {
  if (!entries?.length) return;
  const valid = entries.filter(e => e.value != null && typeof e.value !== 'undefined');
  if (!valid.length) return;

  // Transaction use karenge taaki batch upsert super fast ho
  const upsert = db.transaction((validEntries) => {
    const stmt = db.prepare(`
      INSERT INTO auth_kv(key, value) VALUES(?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    for (const { type, id, value } of validEntries) {
      stmt.run(`${type}-${id}`, encodeForJson(value));
    }
  });

  try {
    upsert(valid);
  } catch (err) {
    console.warn('[DB WARN] Skipped some malformed key batch:', err.message);
  }
}

export async function keysDeleteMany(type, ids) {
  if (!ids?.length) return;
  const keys = ids.map((id) => `${type}-${id}`);
  const placeholders = keys.map(() => '?').join(',');
  db.prepare(`DELETE FROM auth_kv WHERE key IN (${placeholders})`).run(...keys);
}

// ---- GROUP REGISTRY HELPERS ----
export async function readGroupRegistry() {
  try {
    const row = db.prepare('SELECT value FROM auth_kv WHERE key = ?').get('groups_registry');
    if (!row) return [];
    return JSON.parse(row.value) || [];
  } catch (err) {
    console.error('Failed to read group registry:', err.message);
    return [];
  }
}

export async function writeGroupRegistry(groups) {
  try {
    db.prepare(`
      INSERT INTO auth_kv(key, value) VALUES(?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run('groups_registry', JSON.stringify(groups));
  } catch (err) {
    console.error('Failed to write group registry:', err.message);
  }
}

export async function clearAllData() {
  try {
    db.prepare('DELETE FROM auth_kv').run();
    console.log(' All auth & group data cleared from SQLite database.');
  } catch (err) {
    console.error('Failed to clear all data:', err.message);
  }
}