// src/instanceManager.mjs
import makeWASocket, { DisconnectReason } from '@whiskeysockets/baileys'
import { createPostgresAuthState } from './instance.mjs'
import { readGroupRegistry, writeGroupRegistry, clearAllData } from './db.mjs'

let sock = null
let latestQR = null
let reconnecting = false
const RECONNECT_DELAY_MS = 2000

const groupRegistry = new Map()


export async function initializeGroupRegistry() {
  const existingGroups = await readGroupRegistry()
  for (const g of existingGroups) {
    groupRegistry.set(g.id, g)
  }
  console.log(`Loaded ${groupRegistry.size} groups from DB cache`)
}

// persist registry to db
async function persistRegistry() {
  try {
    await writeGroupRegistry(Array.from(groupRegistry.values()))
    console.log(`💾 Saved ${groupRegistry.size} groups to DB`)
  } catch (e) {
    console.error('DB persist failed:', e.message)
  }
}

async function getOrFetchGroupMetadata(jid) {
  if (!jid) return undefined
  const cached = groupRegistry.get(jid)
  if (cached) return cached

  try {
    if (!sock) return undefined
    const metadata = await sock.groupMetadata(jid)
    if (metadata) {
      // normalize minimal shape to persist
      const pd = {
        id: jid,
        subject: metadata.subject,
        desc: metadata.desc?.toString() || null,
        participants: metadata.participants?.map(p => p.id) || [],
        lastActive: Date.now()
      }
      groupRegistry.set(jid, pd)
      await persistRegistry()
      return pd
    }
    return undefined
  } catch (err) {
    console.warn(`Failed to fetch metadata for ${jid}:`, err?.message || err)
    return undefined
  }
}




export async function initInstance() {
  // if a healthy socket exists, reuse it
  if (sock && !reconnecting) return sock

  await initializeGroupRegistry()
  const { state, saveCreds } = await createPostgresAuthState()

  const newSock = makeWASocket({
    auth: state,
    browser: ['Baileys v7 API', 'Chrome', '1.0.0'],
    syncFullHistory: false,
    cachedGroupMetadata: getOrFetchGroupMetadata,
  })

  sock = newSock
  reconnecting = false

  newSock.ev.on('creds.update', saveCreds)

  newSock.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update

    if (qr) latestQR = qr
    if (connection === 'open') {
      console.log('✅ WhatsApp connected')
    }

    if (connection === 'close') {
      const err = lastDisconnect?.error
      const code =
        err?.output?.statusCode ?? err?.statusCode ?? err?.code ?? err
      
      if (code === DisconnectReason.loggedOut || code === 401) {
        console.log('🚪 User logged out — clearing Postgres data...')
        try {
          await clearAllData()
        } catch (e) {
          console.error('Failed to clear data after logout:', e.message)
        }

        // clear in-memory cache too
        clearInstanceGroupCache()
        
        sock = null
        latestQR = null
        reconnecting = false
        console.log('✅ All data wiped. New QR will appear on next init.')
        try {
          await initInstance()
        } catch (e) {
          console.error('Re-init after logout failed:', e.message || e)
        }
        return
      }

      console.warn(`⚠️ Connection closed (${code}). Attempting reconnect...`)

      // IMPORTANT: drop the old reference so initInstance() can create a new socket
      sock = null

      if (!reconnecting) {
        reconnecting = true
        setTimeout(() => {
          initInstance().catch((e) => {
            console.error('Reconnect failed:', e?.message || e)
          })
        }, RECONNECT_DELAY_MS)
      }
    }
  })

  // cache group metadata updates
  newSock.ev.on('groups.update', async (events) => {
    for (const event of events) {
      try {
        const metadata = await newSock.groupMetadata(event.id)
        const pd = {
          id: event.id,
          subject: metadata.subject,
          desc: metadata.desc?.toString() || null,
          participants: metadata.participants?.map(p => p.id) || [],
          lastActive: Date.now()
        }
        groupRegistry.set(event.id, pd)
      } catch (e) {
        console.warn('Failed to update group metadata for', event.id, e?.message || e)
      }
    }
    await persistRegistry()
  })

  newSock.ev.on('group-participants.update', async (events) => {
    for (const event of events) {
      try {
        const metadata = await newSock.groupMetadata(event.id)
        const pd = {
          id: event.id,
          subject: metadata.subject,
          desc: metadata.desc?.toString() || null,
          participants: metadata.participants?.map(p => p.id) || [],
          lastActive: Date.now()
        }
        groupRegistry.set(event.id, pd)
      } catch (e) {
        console.warn('Failed to update group participants metadata for', event.id, e?.message || e)
      }
    }
    await persistRegistry()
  })

  return newSock
}

export function getInstance() {
  if (!sock) throw new Error('Instance not initialized yet')
  return sock
}

export function getLatestQR() {
  return latestQR
}

export function clearInstanceGroupCache() {
  groupRegistry.clear()
  console.log('Instance group cache cleared')
}



export async function logoutInstance() {
  try {
    console.log(' Manual logout requested...')
    if (sock) {
      try {
        await sock.logout()
      } catch (e) {
        console.warn('Sock.logout() warning:', e.message)
      }
    }
    try {
      await clearAllData()
    } catch (e) {
      console.error('clearAllData failed:', e.message)
    }
    clearInstanceGroupCache()

    sock = null
    latestQR = null
    reconnecting = false
    console.log('✅ Full logout completed. All data cleared. Attempting re-init to emit new QR.')
    try {
      await initInstance()
    } catch (e) {
      console.error('initInstance after logout failed:', e.message || e)
    }
  } catch (err) {
    console.error('Logout failed:', err.message)
  }
}