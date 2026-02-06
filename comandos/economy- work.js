// comandos/economy-work.js
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbDir = path.join(__dirname, '..', 'jsons')
const dbFile = path.join(dbDir, 'economy.json')
// Archivo separado para cooldowns (evita tocar economy.json)
const cooldownFile = path.join(dbDir, 'cooldowns.json')

function normalizeNumber(raw) {
  if (!raw) return ''
  return raw.toString().split('@')[0].replace(/\D/g, '')
}

// Asegura existencia de jsons y archivos; migra balance->wallet si hace falta.
// NOTA: NO se añade lastWork en economy.json (como pediste), usamos cooldowns.json.
function ensureFiles() {
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
  } else {
    // intentar migrar balance -> wallet y normalizar claves sin tocar estructura extra
    try {
      const raw = fs.readFileSync(dbFile, 'utf8')
      const parsed = JSON.parse(raw || '{}')
      const normalized = {}
      let changed = false
      for (const [key, val] of Object.entries(parsed || {})) {
        const normKey = (key || '').toString().replace(/\D/g, '')
        if (!normKey) continue
        const v = (val && typeof val === 'object') ? val : {}
        const wallet = Number(v.wallet ?? v.balance ?? 0)
        const bank = Number(v.bank ?? 0)
        normalized[normKey] = {
          wallet,
          bank,
          lastDaily: Number(v.lastDaily ?? 0),
          streak: Number(v.streak ?? 0),
          diamonds: Number(v.diamonds ?? 0),
          coal: Number(v.coal ?? 0),
          gold: Number(v.gold ?? 0),
          lastCrime: Number(v.lastCrime ?? 0),
          lastChest: Number(v.lastChest ?? 0),
          lastAction: Number(v.lastAction ?? 0),
          lastRob: Number(v.lastRob ?? 0)
        }
        if (normKey !== key) changed = true
      }
      const normString = JSON.stringify(normalized, null, 2)
      if (changed) fs.writeFileSync(dbFile, normString)
    } catch (e) {
      // si no se puede parsear, respaldar y crear init limpio
      try { fs.renameSync(dbFile, dbFile + '.corrupt.' + Date.now()) } catch {}
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
    }
  }

  // cooldowns file: simple map { "<user>": <timestamp> }
  if (!fs.existsSync(cooldownFile)) {
    fs.writeFileSync(cooldownFile, JSON.stringify({}, null, 2))
  }
}

function readDb() {
  ensureFiles()
  try {
    return JSON.parse(fs.readFileSync(dbFile, 'utf8') || '{}')
  } catch (e) {
    try { fs.renameSync(dbFile, dbFile + '.corrupt.' + Date.now()) } catch {}
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
    return init
  }
}

function writeDb(db) {
  fs.writeFileSync(dbFile, JSON.stringify(db, null, 2))
}

function readCooldowns() {
  ensureFiles()
  try {
    return JSON.parse(fs.readFileSync(cooldownFile, 'utf8') || '{}')
  } catch (e) {
    try { fs.renameSync(cooldownFile, cooldownFile + '.corrupt.' + Date.now()) } catch {}
    fs.writeFileSync(cooldownFile, JSON.stringify({}, null, 2))
    return {}
  }
}

function writeCooldowns(c) {
  fs.writeFileSync(cooldownFile, JSON.stringify(c, null, 2))
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function msToMinSec(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return { minutes, seconds }
}

// Trabajos disponibles: cada trabajo tiene texto y rango de ganancia (modifica si quieres)
const JOBS = [
  { text: 'Trabajas como repartidor de pizza y ganas', min: 100, max: 200 },
  { text: 'Haces un encargo exprés como mensajero y recibes', min: 80, max: 160 },
  { text: 'Ayudas en una mudanza y cobras', min: 120, max: 200 },
  { text: 'Trabajas de limpiador por un rato y obtienes', min: 90, max: 170 },
  { text: 'Haces trabajos freelance rápidos y consigues', min: 100, max: 190 },
  { text: 'Ayudas en una feria vendiendo boletos y ganas', min: 70, max: 150 },
  { text: 'Arreglas una computadora y te pagan', min: 110, max: 200 },
  { text: 'Cuidas una mascota unas horas y recibes', min: 60, max: 130 },
  { text: 'Haces de fotógrafo por un evento corto y cobras', min: 130, max: 200 },
  { text: 'Trabajas como barista por un turno y ganas', min: 90, max: 170 }
]

var handler = async (m, { conn }) => {
  try {
    const db = readDb()
    const cooldowns = readCooldowns()

    const sender = normalizeNumber(m.sender || m.from || m.participant || '')
    if (!sender) return conn.reply(m.chat, 'No se pudo identificar tu número.', m)

    // asegurar usuario en DB (sin añadir lastWork)
    if (!db[sender]) {
      db[sender] = {
        wallet: 0,
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

    const now = Date.now()
    const COOLDOWN = 5 * 60 * 1000 // 5 minutos

    const last = Number(cooldowns[sender] || 0)
    if (last && (now - last) < COOLDOWN) {
      const remaining = COOLDOWN - (now - last)
      const { minutes, seconds } = msToMinSec(remaining)
      return conn.reply(m.chat, `Debes esperar ${minutes}m ${seconds}s para volver a trabajar.`, m)
    }

    const job = JOBS[Math.floor(Math.random() * JOBS.length)]
    const earned = randomInt(job.min, job.max)

    // actualizar wallet y lastAction (lastAction se usa para protecciones como rob)
    db[sender].wallet = (db[sender].wallet || 0) + earned
    db[sender].lastAction = now

    // guardar cooldown separado
    cooldowns[sender] = now

    writeDb(db)
    writeCooldowns(cooldowns)

    const message =
`✿︎ \`Trabajo del minuto\` ✿︎

❁ ${job.text} *${earned}* coins

> ¡Vuelve en 5 minutos para ver qué chamba rápida consigues!`

    return conn.reply(m.chat, message, m)
  } catch (err) {
    console.error(err)
    return conn.reply(m.chat, `⚠︎ Ocurrió un error en work: ${err.message || err}`, m)
  }
}

handler.help = ['trabajar', 'trabajo', 'work']
handler.tags = ['economy']
handler.command = ['trabajar', 'trabajo', 'work']

export default handler