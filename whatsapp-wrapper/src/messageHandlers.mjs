// src/messageHandlers.mjs
import mime from 'mime-types'
import fetch from 'node-fetch' // or remove if your Node has global fetch
import { readGroupRegistry, writeGroupRegistry } from './db.mjs'

const groupRegistry = new Map()

// load cached registry at startup
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

export async function registerMessageHandlers(sock) {
  const postbackUrl = process.env.POSTBACK_URL || "http://potoos:9000/api/whatsapp/action-webhook/"
  console.log("Postback URL:", postbackUrl)

  const ENABLE_INCOMING = process.env.ENABLE_INCOMING_MESSAGES === 'true'

  if (!ENABLE_INCOMING) {
    console.log(
      'Incoming message processing disabled via ENABLE_INCOMING_MESSAGES=false'
    )
    return
  }

  await initializeGroupRegistry()
  // Listen for incoming messages to capture button/list replies
  sock.ev.on('messages.upsert', async (upsert) => {
    try {
      const msgs = upsert.messages || []
      for (const m of msgs) {
        console.log('Received raw message object:', JSON.stringify(m, null, 2)); // ADDED: Log the entire message object
        if (!m.message) continue
        const key = m.key || {}
        const from = key.remoteJid

        // detect group messages and cache group metadata
        if (from && from.endsWith('@g.us')) {
          const sender = m.pushName || m.key.participant || 'unknown'
          console.log(`Caching metadata for new group: ${from} (sender: ${sender})`)

          if (!groupRegistry.has(from)) {
            try {
              const metadata = await sock.groupMetadata(from)
              const groupData = {
                id: from,
                subject: metadata.subject,
                desc: metadata.desc?.toString() || null,
                participants : metadata.participants?.map(p => p.id) || [],
                lastActive: Date.now()
              }
              groupRegistry.set(from, groupData)
              await persistRegistry()
              console.log(`Cached new group metadata for ${from}: ${metadata.subject}`);
            } catch (error) {
              console.warn(`Failed to cache group metadata for ${from}:`, error.message)
              groupRegistry.set(from, { id: from, lastActive: Date.now()})
              await persistRegistry()

            }
          }else {
            const existing = groupRegistry.get(from)
            existing.lastActive = Date.now()
            groupRegistry.set(from, existing)
            await persistRegistry()
          }
        }

        // Buttons response (Baileys)
        const br = m.message?.buttonsResponseMessage
        const lr = m.message?.listResponseMessage
        let payload = null

        if (br && br.selectedButtonId) {
          // Handle button replies
          payload = {
            type: 'button_reply',
            jid: from,
            selectedId: br.selectedButtonId,
            selectedText: br.selectedDisplayText || null,
            raw: br
          }
        } else if (lr && lr.singleSelectReply) {
          // Handle list replies
          payload = {
            type: 'list_reply',
            jid: from,
            selectedId: lr.singleSelectReply.selectedRowId,
            selectedText: lr.singleSelectReply.selectedRowTitle || null,
            raw: lr
          }
        } else {
          // Handle all other incoming message types
          let messageType = 'unknown'
          let messageContent = null

          if (m.message.conversation) {
            messageType = 'text'
            messageContent = m.message.conversation
          } else if (m.message.extendedTextMessage?.text) {
            messageType = 'text'
            messageContent = m.message.extendedTextMessage.text
          } else if (m.message.imageMessage) {
            messageType = 'image'
            messageContent = {
              caption: m.message.imageMessage.caption,
              mimetype: m.message.imageMessage.mimetype,
              mediaKey: m.message.imageMessage.mediaKey,
              fileSha256: m.message.imageMessage.fileSha256,
              fileEncSha256: m.message.imageMessage.fileEncSha256,
              jpegThumbnail: m.message.imageMessage.jpegThumbnail ? 'data:image/jpeg;base64,' + m.message.imageMessage.jpegThumbnail.toString('base64') : null
            }
          } else if (m.message.videoMessage) {
            messageType = 'video'
            messageContent = {
              caption: m.message.videoMessage.caption,
              mimetype: m.message.videoMessage.mimetype,
              mediaKey: m.message.videoMessage.mediaKey,
              fileSha256: m.message.videoMessage.fileSha256,
              fileEncSha256: m.message.videoMessage.fileEncSha256,
              jpegThumbnail: m.message.videoMessage.jpegThumbnail ? 'data:image/jpeg;base64,' + m.message.videoMessage.jpegThumbnail.toString('base64') : null
            }
          } else if (m.message.documentMessage) {
            messageType = 'document'
            messageContent = {
              fileName: m.message.documentMessage.fileName,
              mimetype: m.message.documentMessage.mimetype,
              title: m.message.documentMessage.title,
              mediaKey: m.message.documentMessage.mediaKey,
              fileSha256: m.message.documentMessage.fileSha256,
              fileEncSha256: m.message.documentMessage.fileEncSha256
            }
          } else if (m.message.stickerMessage) {
            messageType = 'sticker'
            messageContent = {
              mimetype: m.message.stickerMessage.mimetype,
              mediaKey: m.message.stickerMessage.mediaKey,
              fileSha256: m.message.stickerMessage.fileSha256,
              fileEncSha256: m.message.stickerMessage.fileEncSha256
            }
          } else if (m.message.locationMessage) {
            messageType = 'location'
            messageContent = {
              degreesLatitude: m.message.locationMessage.degreesLatitude,
              degreesLongitude: m.message.locationMessage.degreesLongitude,
              name: m.message.locationMessage.name,
              address: m.message.locationMessage.address
            }
          } else if (m.message.contactMessage) {
            messageType = 'contact'
            messageContent = {
              displayName: m.message.contactMessage.displayName,
              vcard: m.message.contactMessage.vcard
            }
          }

          if (messageType !== 'unknown') {
            payload = {
              type: messageType,
              jid: from,
              sender: m.pushName || m.key.participant || 'unknown',
              messageContent: messageContent,
              // rawMessage: m // Uncomment if the full raw message object is needed in the postback
            }
          }
        }

        if (payload) {
          console.log('Postback payload generated:', payload.type, payload.jid)
          if (postbackUrl) {
            try {
              await fetch(postbackUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                timeout: 5000
              })
              console.log('Postback sent successfully.')
            } catch (e) {
              console.error('Postback to', postbackUrl, 'failed:', e.message || e) // MODIFIED: Add more context to error
            }
          } else {
            console.warn('POSTBACK_URL is not set. Cannot send postback.')
          }
        }
      }
    } catch (e) {
      console.error('messages.upsert handler error:', e)
    }
  })
}

function normalizeButtonsToTemplate(buttons = []) {
  return buttons.map((b, idx) => {
    // Accept shapes: {id,text}, {buttonId,buttonText:{displayText}}, {url}
    if (b.url || b.href) {
      return {
        index: idx + 1,
        urlButton: {
          displayText: b.text || b.displayText || b.buttonText?.displayText || 'Open',
          url: b.url || b.href
        }
      }
    }
    return {
      index: idx + 1,
      quickReplyButton: {
        displayText: b.text || b.displayText || b.buttonText?.displayText || `Option ${idx+1}`,
        id: b.id || b.buttonId || b.payload || `opt_${idx+1}`
      }
    }
  })
}

export async function sendInteractive(sock, options) {
  const { jid, text, footer, buttons, header, templateButtons } = options || {}
  if (!jid || !text || (!buttons && !templateButtons)) {
    throw new Error('jid, text, and buttons are required for interactive message')
  }

  // If caller supplied templateButtons directly, pass through (safer)
  if (Array.isArray(templateButtons) && templateButtons.length) {
    const msg = { text, footer, templateButtons }
    if (header) msg.header = header
    console.log('[sendInteractive] sending templateButtons message:', JSON.stringify(msg))
    const res = await sock.sendMessage(jid, msg)
    console.log('[sendInteractive] send result:', JSON.stringify(res))
    return res
  }

  const hasUrl = Array.isArray(buttons) && buttons.some(b => b && (b.url || b.href))
  if (hasUrl || (Array.isArray(buttons) && buttons.length > 3)) {
    const tpl = normalizeButtonsToTemplate(buttons || [])
    const msg = { text, footer, templateButtons: tpl }
    if (header) msg.header = header
    console.log('[sendInteractive] sending templateButtons(normalized) message:', JSON.stringify(msg))
    const res = await sock.sendMessage(jid, msg)
    console.log('[sendInteractive] send result:', JSON.stringify(res))
    return res
  }

  // Otherwise use simple 'buttons' message (max 3)
  const baileyButtons = (buttons || []).slice(0, 3).map((b, idx) => {
    if (b.buttonId && b.buttonText) {
      return { buttonId: b.buttonId, buttonText: b.buttonText, type: b.type || 1 }
    }
    return {
      buttonId: b.id || b.buttonId || `id_${idx+1}`,
      buttonText: { displayText: b.text || b.displayText || 'Option' },
      type: b.type || 1
    }
  })

  const buttonMessage = {
    text,
    footer,
    buttons: baileyButtons,
    headerType: 1
  }
  if (header && header.title) {
    buttonMessage.header = { title: header.title, subtitle: header.subtitle }
  }

  console.log('[sendInteractive] sending buttons message:', JSON.stringify(buttonMessage))
  const res = await sock.sendMessage(jid, buttonMessage)
  console.log('[sendInteractive] send result:', JSON.stringify(res))
  return res
}

export async function sendText(sock, jid, text) {
  return sock.sendMessage(jid, { text })
}

export async function sendFile(sock, jid, fileBuffer, fileName = 'file', caption = '') {
  return sock.sendMessage(jid, { document: fileBuffer, fileName, caption })
}

export async function groupSendFile(sock, jid, fileBuffer, fileName = 'file', caption = '') {
  // This is identical to sendFile, but named for consistency with other group functions.
  return sock.sendMessage(jid, { document: fileBuffer, fileName, caption });
}



// group handler functions
export async function groupCreate(sock, title, participants) {
  const group = await sock.groupCreate(title, participants)
  console.log('Group created:', group)
  return group
}


export async function groupSendText(sock, jid, text) {
  return sock.sendMessage(jid, { text })
}

export async function groupParticipantsUpdate(sock, jid, participants, action) {
  return sock.groupParticipantsUpdate(jid, participants, action)
}

export async function groupUpdateSubject(sock, jid, subject) {
  return sock.groupUpdateSubject(jid, subject)
}


export async function groupUpdateDescription(sock, jid, desc) {
  return sock.groupUpdateDescription(jid, desc)
}

export async function groupLeave(sock, jid) {
  return sock.groupLeave(jid)
}

export async function groupMetadata(sock, jid) {
  return sock.groupMetadata(jid)
}

export async function groupInviteCode(sock, jid) {
  return sock.groupInviteCode(jid)
}

export function getDiscoveredGroups() {
  return Array.from(groupRegistry.values())
}