// src/index.mjs
import express from 'express'
import bodyParser from 'body-parser'
import QR from 'qrcode'
import multer from 'multer'
import { initInstance, getInstance, getLatestQR, logoutInstance } from './instanceManager.mjs'
import { 
  registerMessageHandlers, 
  sendText, 
  sendFile, 
  groupSendFile,
  sendInteractive,
  groupCreate,
  groupSendText,
  groupParticipantsUpdate,
  groupUpdateSubject,
  groupUpdateDescription,
  groupLeave,
  groupMetadata,
  groupInviteCode,
  getDiscoveredGroups
 } from './messageHandlers.mjs'


const app = express()
app.use(bodyParser.json({ limit: '25mb' }))

// --- Multer Setup for File Uploads ---
// We'll store files in memory as buffers
const upload = multer({ storage: multer.memoryStorage() })

// Initialize WhatsApp socket on startup
let sock
;(async () => {
  sock = await initInstance()
  await registerMessageHandlers(sock)
})()

// --- ROUTES ---
app.get('/', (_req, res) => res.send('Baileys WhatsApp API is running 🚀'))

// Test endpoint for receiving postbacks
app.post('/webhook', (req, res) => {
  console.log('✅ Received postback on /webhook:')
  console.log(JSON.stringify(req.body, null, 2))
  res.status(200).send('OK')
})

app.get('/qr.png', async (_req, res) => {
  const qr = getLatestQR()
  if (!qr) return res.status(404).send('No QR available yet')
  const img = await QR.toBuffer(qr, { width: 300, margin: 1 })
  res.setHeader('Content-Type', 'image/png')
  res.send(img)
})

// send text
app.post('/sendText', async (req, res) => {
  try {
    const { jid, text } = req.body
    const sock = getInstance()
    await sendText(sock, jid, text)
    res.json({ status: 'sent' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
})

// send interactive message with buttons
app.post('/sendInteractive', async (req, res) => {
  try {
    const { jid, text, footer, buttons, header, templateButtons } = req.body
    if (!jid || !text || (!buttons && !templateButtons)) {
      return res.status(400).json({ error: 'jid, text, and buttons are required' })
    }

    const sock = getInstance()
    // pass a single options object (matches updated sendInteractive)
    await sendInteractive(sock, { jid, text, footer, buttons, header, templateButtons })
    res.json({ status: 'sent' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
})


// send file (url or path)
app.post('/sendFile', upload.single('file'), async (req, res) => {
  try {
    const { jid, fileName, caption } = req.body
    if (!jid) {
      return res.status(400).json({ error: 'jid is required' })
    }
    if (!req.file) {
      return res.status(400).json({ error: 'File is required' })
    }

    const sock = getInstance()
    await sendFile(sock, jid, req.file.buffer, fileName || req.file.originalname, caption)
    res.json({ status: 'sent' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
})




// -------------- group routes -------------
app.post('/group/create', async (req, res) => {
  try {
    const { title, participants } = req.body
    const sock = getInstance()
    const group = await groupCreate(sock, title, participants)
    res.json(group)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/group/sendFile', upload.single('file'), async (req, res) => {
  try {
    const { jid, fileName, caption } = req.body
    if (!jid) {
      return res.status(400).json({ error: 'jid is required' })
    }
    if (!req.file) {
      return res.status(400).json({ error: 'File is required' })
    }

    const sock = getInstance()
    await groupSendFile(sock, jid, req.file.buffer, fileName || req.file.originalname, caption)
    res.json({ status: 'sent' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
})

app.post('/group/sendText', async (req, res) => {
  try {
    const { jid, text } = req.body
    const sock = getInstance()
    const result = await groupSendText(sock, jid, text)
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/group/participants', async (req, res) => {
  try {
    const { jid, participants, action } = req.body
    const sock = getInstance()
    const result = await groupParticipantsUpdate(sock, jid, participants, action)
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/group/updateSubject', async (req, res) => {
  try {
    const { jid, subject } = req.body
    const sock = getInstance()
    const result = await groupUpdateSubject(sock, jid, subject)
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/group/updateDescription', async (req, res) => {
  try {
    const { jid, desc } = req.body
    const sock = getInstance()
    const result = await groupUpdateDescription(sock, jid, desc)
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})


app.post('/group/leave', async (req, res) => {
  try {
    const { jid } = req.body
    const sock = getInstance()
    const result = await groupLeave(sock, jid)
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/group/metadata/:jid', async (req, res) => {
  try {
    const sock = getInstance()
    const result = await groupMetadata(sock, req.params.jid)
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})


app.get('/group/invite/:jid', async (req, res) => {
  try {
    const sock = getInstance()
    const code = await groupInviteCode(sock, req.params.jid)
    res.json({ inviteLink: 'https://chat.whatsapp.com/' + code })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})


app.get('/groups/discovered', async (_req, res) => {
  try {
    const groups = getDiscoveredGroups()
    res.json(groups)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})


app.post('/logout', async (_req, res) => {
  try {
    await logoutInstance()
    res.json({ status: 'logged_out', message: 'All WhatsApp data cleared. Scan new QR to re-login.' })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})



const port = process.env.PORT || 3000
app.listen(port, () => console.log('HTTP listening on', port))
