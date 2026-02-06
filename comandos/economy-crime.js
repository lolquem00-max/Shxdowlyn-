// comandos/economy-crime.js
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbDir = path.join(__dirname, '..', 'jsons')
const dbFile = path.join(dbDir, 'economy.json')

function normalizeNumber(raw) {
  if (!raw) return ''
  return raw.toString().split('@')[0].replace(/\D/g, '')
}

function ensureDb() {
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })
  if (!fs.existsSync(dbFile)) {
    const init = {
      "573235915041": {
        wallet: 999999,
        bank: 0,
        lastDaily: 0,
        streak: 0,
        diamonds: 0,
        coal: 0,
        gold: 0,
        lastCrime: 0,
        lastChest: 0,
        lastAction: 0,
        lastRob: 0
      }
    }
    fs.writeFileSync(dbFile, JSON.stringify(init, null, 2))
    return
  }
  try {
    const raw = fs.readFileSync(dbFile, 'utf8')
    const parsed = JSON.parse(raw || '{}')
    const normalized = {}
    for (const [key, val] of Object.entries(parsed || {})) {
      const norm = (key || '').toString().replace(/\D/g, '')
      if (!norm) continue
      normalized[norm] = {
        balance: Number((val && val.balance) || 0),
        lastDaily: Number((val && val.lastDaily) || 0),
        streak: Number((val && val.streak) || 0),
        diamonds: Number((val && val.diamonds) || 0),
        coal: Number((val && val.coal) || 0),
        gold: Number((val && val.gold) || 0),
        lastCrime: Number((val && val.lastCrime) || 0),
        lastChest: Number((val && val.lastChest) || 0)
      }
    }
    const normString = JSON.stringify(normalized, null, 2)
    if (normString !== raw) fs.writeFileSync(dbFile, normString)
  } catch (e) {
    try { fs.renameSync(dbFile, dbFile + '.corrupt.' + Date.now()) } catch {}
    const init = {
      "573235915041": {
        balance: 999999,
        lastDaily: 0,
        streak: 0,
        diamonds: 0,
        coal: 0,
        gold: 0,
        lastCrime: 0,
        lastChest: 0
      }
    }
    fs.writeFileSync(dbFile, JSON.stringify(init, null, 2))
  }
}

function readDb() {
  ensureDb()
  try {
    return JSON.parse(fs.readFileSync(dbFile, 'utf8') || '{}')
  } catch (e) {
    try { fs.renameSync(dbFile, dbFile + '.corrupt.' + Date.now()) } catch {}
    const init = {
      "573235915041": {
        balance: 999999,
        lastDaily: 0,
        streak: 0,
        diamonds: 0,
        coal: 0,
        gold: 0,
        lastCrime: 0,
        lastChest: 0
      }
    }
    fs.writeFileSync(dbFile, JSON.stringify(init, null, 2))
    return init
  }
}

function writeDb(db) {
  fs.writeFileSync(dbFile, JSON.stringify(db, null, 2))
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function msToMinutes(ms) {
  return Math.ceil(ms / 60000)
}

var handler = async (m, { conn }) => {
  try {
    const db = readDb()
    const sender = normalizeNumber(m.sender || m.from || m.participant || '')
    if (!sender) return conn.reply(m.chat, '[❁] No se pudo identificar tu número.', m)

    if (!db[sender]) {
      db[sender] = { balance: 0, lastDaily: 0, streak: 0, diamonds: 0, coal: 0, gold: 0, lastCrime: 0, lastChest: 0 }
    }

    const user = db[sender]
    const now = Date.now()
    const COOLDOWN = 60 * 60 * 1000 // 1 hora

    if (user.lastCrime && (now - user.lastCrime) < COOLDOWN) {
      const remaining = COOLDOWN - (now - user.lastCrime)
      const minutes = msToMinutes(remaining)
      return conn.reply(m.chat, `[❁] Ya has cometido tu crimen de horal, vuelve en ${minutes} minutos`, m)
    }

    const reward = randomInt(50, 300)
    user.balance = (user.balance || 0) + reward
    user.lastCrime = now

    db[sender] = user
    writeDb(db)

    const message =
`*[❁] Cometiste tu crimen horal* 

Coins conseguidos » *${reward}*

> ¡Vuelve en una hora para obtener tu proxima recompeza!`

    return conn.reply(m.chat, message, m)
  } catch (err) {
    console.error(err)
    return conn.reply(m.chat, `⚠︎ Ocurrió un error: ${err.message || err}`, m)
  }
}

handler.help = ['crime', 'crimen']
handler.tags = ['economy']
handler.command = ['crime', 'crimen']

export default handler