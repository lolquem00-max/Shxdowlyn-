// sockets/indexsubs.js
import fs from 'fs'
import path from 'path'

const DB_DIR = path.join(process.cwd(), 'jsons', 'sockets')
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true })

const DB_PATH = path.join(DB_DIR, 'JadiBot.json')
const ATOMIC_SUFFIX = '.temporal' // escritura atómica usando sufijo .temporal

function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      fs.writeFileSync(DB_PATH, JSON.stringify({}, null, 2))
      return {}
    }
    const raw = fs.readFileSync(DB_PATH, 'utf8') || '{}'
    return JSON.parse(raw)
  } catch (e) {
    try { fs.renameSync(DB_PATH, DB_PATH + '.corrupt.' + Date.now()) } catch {}
    const init = {}
    fs.writeFileSync(DB_PATH, JSON.stringify(init, null, 2))
    return init
  }
}

function writeDB(db) {
  fs.writeFileSync(DB_PATH + ATOMIC_SUFFIX, JSON.stringify(db, null, 2))
  try {
    fs.renameSync(DB_PATH + ATOMIC_SUFFIX, DB_PATH)
  } catch (e) {
    // fallback
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2))
  }
}

export function addSession({ socket, sessionFile = null, active = false, createdAt = Date.now(), browser = 'Ubuntu' }) {
  const db = readDB()
  db[socket] = {
    socket,
    sessionFile,
    active: !!active,
    createdAt,
    lastUpdated: Date.now(),
    browser
  }
  writeDB(db)
  return db[socket]
}

export function removeSession(socket) {
  const db = readDB()
  if (db[socket]) {
    delete db[socket]
    writeDB(db)
    return true
  }
  return false
}

export function setSessionActive(socket, active = true) {
  const db = readDB()
  if (!db[socket]) return false
  db[socket].active = !!active
  db[socket].lastUpdated = Date.now()
  writeDB(db)
  return true
}

export function listSessions() {
  return readDB()
}