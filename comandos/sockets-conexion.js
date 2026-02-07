// comandos/sockets-conexion.js
// Sub-bot linking (#code) — versión con connectionOptions más completa (similar al index principal)
// - Intenta obtener pairing code real mediante sock.requestPairingCode (varias ubicaciones + reintentos).
// - Si no se obtiene, no envía código falso; informa y limpia.
// - Guarda auth en jsons/sockets/auth/<sessionName>, sesiones en jsons/sockets/JadiBot.json

import fs from 'fs'
import path from 'path'
import qrcode from 'qrcode' // mantenido por si se quiere usar en el futuro
import { randomBytes } from 'crypto'
import { fileURLToPath } from 'url'
import NodeCache from 'node-cache'
import pino from 'pino'

import { addSession, removeSession } from '../sockets/indexsubs.js'
import { printCommandEvent, printSessionEvent } from '../sockets/print.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SESSIONS_ROOT = path.join(process.cwd(), 'jsons', 'sockets')
const AUTH_ROOT = path.join(SESSIONS_ROOT, 'auth')
const ATOMIC_SUFFIX = '.temporal'
if (!fs.existsSync(AUTH_ROOT)) fs.mkdirSync(AUTH_ROOT, { recursive: true })
if (!fs.existsSync(SESSIONS_ROOT)) fs.mkdirSync(SESSIONS_ROOT, { recursive: true })

// util
function formatPairingCode(raw) {
  if (!raw || typeof raw !== 'string') return raw
  return (raw.replace(/\s+/g, '').match(/.{1,4}/g) || [raw]).join('-')
}
const delay = ms => new Promise(r => setTimeout(r, ms))

// messaging adapters (ajusta si tu conn usa otra firma)
async function sendText(conn, chat, text, quoted = null) {
  if (!conn) throw new Error('conn missing')
  if (typeof conn.reply === 'function') return conn.reply(chat, text, quoted)
  if (typeof conn.sendMessage === 'function') return conn.sendMessage(chat, { text }, { quoted })
  throw new Error('conn no expone reply/sendMessage')
}
async function tryDeleteMessage(conn, chat, msgObj) {
  if (!msgObj) return
  try {
    if (typeof conn.deleteMessage === 'function') {
      const id = msgObj?.key?.id || msgObj?.id || msgObj
      if (id) return await conn.deleteMessage(chat, id).catch(()=>{})
    }
    if (typeof conn.sendMessage === 'function' && msgObj?.key) {
      try { return await conn.sendMessage(chat, { delete: msgObj.key }) } catch (e) {}
    }
  } catch (e) {}
}

// crea socket temporal con connectionOptions completos (como en tu index principal)
async function makeTempSocket(sessionName, browser = ['Windows', 'Firefox']) {
  const baileysPkg = await import('@whiskeysockets/baileys')
  const { useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = baileysPkg

  // intenta usar wrapper local si existe (ruta indicada)
  let makeWASocket = null
  try {
    const mod = await import('./configuraciones/simple.js') // ruta dentro comandos/
    makeWASocket = mod.makeWASocket ?? mod.default ?? null
  } catch (e) {}
  if (!makeWASocket) makeWASocket = baileysPkg.makeWASocket

  const authDir = path.join(AUTH_ROOT, sessionName)
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true })

  const { state, saveCreds } = await useMultiFileAuthState(authDir)

  const msgRetryCounterMap = new Map()
  const msgRetryCounterCache = new NodeCache({ stdTTL: 0, checkperiod: 0 })
  const userDevicesCache = new NodeCache({ stdTTL: 0, checkperiod: 0 })

  let version = [2, 2320, 3]
  try {
    const v = await fetchLatestBaileysVersion()
    version = v.version
  } catch (e) {}

  // Build connectionOptions similar to your main index
  const connectionOptions = {
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
    },
    msgRetryCounterMap,
    msgRetryCounterCache,
    userDevicesCache,
    browser,
    version,
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: true,
    syncFullHistory: false,
    defaultQueryTimeoutMs: undefined,
    keepAliveIntervalMs: 55_000,
  }

  const sock = makeWASocket(connectionOptions)
  sock.ev.on('creds.update', saveCreds)

  // debugging helper show some sock properties after short delay
  setTimeout(() => {
    try {
      console.log('[subbot] sock props:', {
        hasUser: !!sock.user,
        hasRequestPairing: typeof sock.requestPairingCode === 'function',
        hasSignalRequest: !!(sock.signal && typeof sock.signal.requestPairingCode === 'function'),
        hasWsRequest: !!(sock.ws && typeof sock.ws.requestPairingCode === 'function')
      })
    } catch (e) { /* ignore */ }
  }, 1500)

  // auto-cleanup if not initialized (like original)
  sock.isInit = false
  setTimeout(async () => {
    if (!sock.user) {
      try { fs.rmSync(authDir, { recursive: true, force: true }) } catch {}
      try { sock.ws?.close() } catch {}
      sock.ev.removeAllListeners()
      if (global.conns) {
        const i = global.conns.indexOf(sock)
        if (i >= 0) global.conns.splice(i, 1)
      }
      console.log(`[AUTO-LIMPIEZA] Sesión ${sessionName} eliminada por no completar auth.`)
    }
  }, 60_000)

  return { sock, authDir }
}

// intenta obtener pairing code real probando diferentes ubicaciones en sock y con reintentos
async function requestPairingCodeReal(sock, phone, attempts = 6, intervalMs = 800) {
  for (let i = 0; i < attempts; i++) {
    try {
      if (!sock) throw new Error('sock no existe')
      if (typeof sock.requestPairingCode === 'function') {
        const res = await sock.requestPairingCode(phone)
        if (res) return String(res)
      }
      if (sock.signal && typeof sock.signal.requestPairingCode === 'function') {
        const res = await sock.signal.requestPairingCode(phone)
        if (res) return String(res)
      }
      if (sock.ws && typeof sock.ws.requestPairingCode === 'function') {
        const res = await sock.ws.requestPairingCode(phone)
        if (res) return String(res)
      }
      // Si la librería implementa otro namespace, lo veremos en logs y podremos añadirlo
    } catch (err) {
      console.warn('[subbot] requestPairingCode intento fallo:', err?.message || err)
    }
    await delay(intervalMs)
  }
  return null
}

// logs (usa print)
function logCmd(msg) { printCommandEvent({ message: msg, connection: 'Pendiente', type: 'SubBot' }) }
function logSessionCreated(jid) { printSessionEvent({ action: 'Session creada en', number: jid }) }

// MAIN HANDLER (solo #code)
var handler = async (m, { conn }) => {
  try {
    const rawText = (m.text || m.body || '').trim()
    const lc = rawText.toLowerCase()
    const wantCode = lc === '#code' || lc === '.code' || lc === 'code'
    if (!wantCode) return

    logCmd(rawText)

    const sessionName = `sub-${Date.now()}-${randomBytes(3).toString('hex')}`
    // Use the browser used in your example
    const { sock, authDir } = await makeTempSocket(sessionName, ['Windows', 'Firefox'])

    let introMsg = null
    let payloadMsg = null
    let finished = false
    const expireMs = 45_000

    const introCode = [
      '✿︎ `Vinculación de sockets` ✿︎',
      '',
      'Modo: *Codigo de digitos*.',
      '',
      '`❁ Instrucciones:`',
      'Más opciones > Dispositivos vinculados > Vincular con número > pega el codigo.',
      '',
      '*_Nota_* Este codigo es valido por 45 segundos.'
    ].join('\n')

    introMsg = await sendText(conn, m.chat, introCode, m).catch(()=>null)

    const timeoutId = setTimeout(async () => {
      if (finished) return
      finished = true
      try { await sendText(conn, m.chat, `*[❁]* No se pudo conectar al socket.\n> ¡Intenta conectarte nuevamente!`, m) } catch (e) {}
      await tryDeleteMessage(conn, m.chat, introMsg)
      await tryDeleteMessage(conn, m.chat, payloadMsg)
      try { sock.logout?.().catch(()=>{}); sock.close?.().catch(()=>{}) } catch {}
      try { fs.rmSync(authDir, { recursive: true, force: true }) } catch {}
      printCommandEvent({ message: rawText, connection: 'Fallida', type: 'SubBot' })
    }, expireMs + 2000)

    // Attach listener and debug output
    sock.ev.on('connection.update', async (update) => {
      if (finished) return
      console.log('[subbot] connection.update:', JSON.stringify(Object.assign({}, update, { qr: !!update.qr }), null, 2))
      const { connection, lastDisconnect, qr, isNewLogin } = update
      if (isNewLogin) sock.isInit = false

      if (qr && !finished) {
        // When Baileys emits qr -> request pairing code real using user number
        await delay(1200) // small wait to let sock be ready
        let phone = (m.sender || '').split('@')[0] || sessionName
        phone = phone.replace(/\D/g, '') || sessionName
        console.log('[subbot] intentando obtener pairing code para:', phone)

        const secret = await requestPairingCodeReal(sock, phone, 6, 800)
        if (!secret) {
          console.error('[subbot] no se obtuvo pairing code real, abortando y limpiando')
          finished = true
          clearTimeout(timeoutId)
          try { await sendText(conn, m.chat, `*[❁]* No se pudo generar el código de vinculación.\n> ¡Intenta conectarte nuevamente!`, m) } catch {}
          await tryDeleteMessage(conn, m.chat, introMsg)
          try { sock.logout?.().catch(()=>{}); sock.close?.().catch(()=>{}) } catch {}
          try { fs.rmSync(authDir, { recursive: true, force: true }) } catch {}
          printCommandEvent({ message: rawText, connection: 'Fallida', type: 'SubBot' })
          return
        }

        const formatted = formatPairingCode(String(secret))
        payloadMsg = await sendText(conn, m.chat, '```' + formatted + '```', m).catch(()=>null)
        console.log('[subbot] pairing code real enviado:', formatted)
        // After sending the code we still wait for 'open' event to persist session
      }

      if (connection === 'open' && !finished) {
        finished = true
        clearTimeout(timeoutId)
        try {
          const jid = sock.user?.id || sock.user?.jid || `${sessionName}@s.whatsapp.net`
          addSession({ socket: jid, sessionFile: authDir, active: true, createdAt: Date.now(), browser: 'Windows/Firefox' })
          try { await sendText(conn, m.chat, `*[❁]* La conexión con el socket fue un éxito.\n> ¡Personaliza el socket usando el comando ${'.set'}!`, m).catch(()=>{}) } catch {}
          await tryDeleteMessage(conn, m.chat, introMsg)
          await tryDeleteMessage(conn, m.chat, payloadMsg)
          printCommandEvent({ message: rawText, connection: 'Exitosa', type: 'SubBot' })
          printSessionEvent({ action: 'Session creada en', number: jid })
          if (!global.conns) global.conns = []
          global.conns.push(sock)
        } catch (e) { console.error('[subbot] error al persistir session:', e) }
      }

      if (lastDisconnect && lastDisconnect.error && !finished) {
        try {
          const baileysPkg = await import('@whiskeysockets/baileys')
          const { DisconnectReason } = baileysPkg
          const reason = lastDisconnect?.error?.output?.statusCode
          if (reason === DisconnectReason.loggedOut) {
            const jid = sock.user?.id || `${sessionName}@s.whatsapp.net`
            removeSession(jid)
            printSessionEvent({ action: 'Session cerrada en', number: jid })
          }
        } catch (e) {}
        finished = true
        clearTimeout(timeoutId)
        try { await sendText(conn, m.chat, `*[❁]* No se pudo conectar al socket.\n> ¡Intenta conectarte nuevamente!`, m) } catch {}
        await tryDeleteMessage(conn, m.chat, introMsg)
        await tryDeleteMessage(conn, m.chat, payloadMsg)
        try { sock.logout?.().catch(()=>{}); sock.close?.().catch(()=>{}) } catch {}
        try { fs.rmSync(authDir, { recursive: true, force: true }) } catch {}
        printCommandEvent({ message: rawText, connection: 'Fallida', type: 'SubBot' })
      }
    })

    // also listen for creds updates (for debugging)
    sock.ev.on('creds.update', () => {
      console.log('[subbot] creds.update emitted')
    })

    return
  } catch (err) {
    console.error('Error en sockets-conexion handler:', err)
    try { await conn.reply(m.chat, `⚠︎ Ocurrió un error: ${err.message || err}`, m) } catch {}
  }
}

handler.help = ['code']
handler.tags = ['subbot', 'sockets']
handler.command = ['#code', '.code', 'code']

export default handler