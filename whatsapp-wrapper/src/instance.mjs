import {
  makeCacheableSignalKeyStore,
  initAuthCreds,
  proto as WAProto,
} from '@whiskeysockets/baileys'
import {
  readAuthData,
  writeAuthData,
  keysReadMany,
  keysUpsertMany,
  keysDeleteMany,
  ensureTables,
} from './db.mjs'

export async function createPostgresAuthState() {
  await ensureTables()
  const cached = new Map()

  // creds will now revive Buffers correctly from DB
  const creds = (await readAuthData('creds')) || initAuthCreds()

  const rawKeyStore = {
    get: async (type, ids) => {
      const out = {}
      const rows = await keysReadMany(type, ids)
      for (const id of ids) {
        const k = `${type}-${id}`
        if (cached.has(k)) { out[id] = cached.get(k); continue }
        let value = rows[id]
        if (value == null) continue

        // Hydrate ONLY this proto type
        if (type === 'app-state-sync-key' && typeof value === 'object') {
          value = WAProto.Message.AppStateSyncKeyData.create(value)
        }

        cached.set(k, value)
        out[id] = value
      }
      return out
    },

    set: async (data) => {
      const entries = []
      for (const type of Object.keys(data)) {
        for (const id of Object.keys(data[type])) {
          const value = data[type][id]
          if (value == null) continue
          cached.set(`${type}-${id}`, value)
          entries.push({ type, id, value })
        }
      }
      await keysUpsertMany(entries)
    },

    setMulti: async (entries) => {
      for (const { type, id, value } of entries) {
        cached.set(`${type}-${id}`, value)
      }
      await keysUpsertMany(entries)
    },

    clear: async (type, ids) => {
      for (const id of ids) cached.delete(`${type}-${id}`)
      await keysDeleteMany(type, ids)
    },
  }

  const keys = makeCacheableSignalKeyStore(rawKeyStore, console)

  return {
    state: { creds, keys },
    saveCreds: () => writeAuthData('creds', creds),
  }
}

