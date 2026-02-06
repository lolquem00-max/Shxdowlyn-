// comandos/economy-daily.js
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Nuevo archivo de DB: jsons/economy.json (raíz del repo > jsons)
const dbDir = path.join(__dirname, '..', 'jsons')
const dbFile = path.join(dbDir, 'economy.json')

// Normaliza un número WhatsApp a solo dígitos
function normalizeNumber(raw) {
  if (!raw) return ''
  return raw.toString().split('@')[0].replace(/\D/g, '')
}

// Asegura existencia de la carpeta y archivo con estructura inicial.
//Sync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })
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

  // Si existe, intentar normalizar claves y migrar campos antiguos
  let raw = fs.readFileSync(dbFile, 'utf8')
  try {
    const parsed = JSON.parse(raw || '{}')
    const normalized = {}
    for (const [key, val] of Object.entries(parsed || {})) {
      const norm = (key || '').toString().replace(/\D/g, '')
      if (!norm) continue
      // Si val es primitivo o no objeto, crear objeto base
      const v = (val && typeof val === 'object') ? val : {}
      // migración: balance -> wallet
      const wallet = Number(v.wallet ?? v.balance ?? 0)
      const bank = Number(v.bank ?? 0)
      normalized[norm] = {
        wallet: wallet,
        bank: bank,
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
    }
    const normString = JSON.stringify(normalized, null, 2)
    if (normString !== raw) fs.writeFileSync(dbFile, normString)
  } catch (e) {
    // Si JSON corrupto: respaldar y crear uno limpio con el número requerido
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

function readDb() {
  ensureDb()
  const raw = fs.readFileSync(dbFile, 'utf8')
  try {
    return JSON.parse(raw || '{}')
  } catch (e) {
    // Si por alguna razón vuelve a fallar, respaldar y crear init
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

function msToHourMinute(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  return { hours, minutes }
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

var handler = async (m, { conn }) => {
  try {
    // Cargar DB unificada
    const db = readDb()

    // Obtener y normalizar número del remitente
    const sender = normalizeNumber(m.sender || m.from || m.participant || '')
    if (!sender) {
      return conn.reply(m.chat, '* No se pudo identificar tu número.', m)
    }

    // Asegurarse de la entrada del usuario (usar clave normalizada sin +)
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

    const user = db[sender]
    const now = Date.now()
    const COOLDOWN = 24 * 60 * 60 * 1000 // 24 horas

    // Si ya reclamó
    if (user.lastDaily && (now - user.lastDaily) < COOLDOWN) {
      const remaining = COOLDOWN - (now - user.lastDaily)
      const { hours, minutes } = msToHourMinute(remaining)
      return conn.reply(m.chat, `✿︎ Ya obtuviste tu daily de hoy, espera ${hours}h ${minutes}m para volver a reclamar.`, m)
    }

    // Calcular recompensa aleatoria (ajusta rango si quieres)
    const baseReward = randomInt(100, 500)
    const streakBonusMultiplier = 1 + ((user.streak || 0) * 0.10)
    let reward = Math.floor(baseReward * streakBonusMultiplier)
    if (reward < 1) reward = 1

    const nextReward = Math.floor(reward * 1.2 + 50)

    // Actualizar racha (si la última fue hace menos de 48h, aumentar racha)
    const STREAK_MAX_GAP = 48 * 60 * 60 * 1000 // 48h
    if (user.lastDaily && (now - user.lastDaily) <= STREAK_MAX_GAP) {
      user.streak = (user.streak || 0) + 1
    } else {
      user.streak = 1
    }

    // Actualizar wallet (saldo fuera del banco) y timestamp
    user.wallet = (user.wallet || 0) + reward
    user.lastDaily = now
    user.lastAction = now

    // Guardar DB
    db[sender] = user
    writeDb(db)

    // Responder
    const message =
`✿︎ *Obtuviste tu recompensa diaria de* *${reward} coins*
> Día ${user.streak + 1} » *${nextReward} coins*`

    return conn.reply(m.chat, message, m)
  } catch (err) {
    console.error(err)
    return conn.reply(m.chat, `⚠︎ Ocurrió un error al procesar tu daily: ${err.message || err}`, m)
  }
}

handler.help = ['daily', 'diaro']
handler.tags = ['economy']
handler.command = ['diario', 'daily']

export default handler