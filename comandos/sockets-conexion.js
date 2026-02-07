// comandos/sockets-conexion.js
// Sub-bot linking (#code)
// - CODE: pide el pairing code REAL a Baileys usando el número del usuario (sin caracteres).
// Auths en jsons/sockets/auth/<sessionName>, sesiones en jsons/sockets/JadiBot.json

import fs from 'fs'
import path from 'path'
import qrcode from 'qrcode' // sigue importado por si lo necesitas en futuro
import { randomBytes } from 'crypto'
import { fileURLToPath } from 'url'
import { addSession, removeSession } from '../sockets/indexsubs.js'
import { printCommandEvent, printSessionEvent } from '../sockets/print.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SESSIONS_ROOT = path.join(process.cwd(), 'jsons', 'sockets')
const AUTH_ROOT = path.join(SESSIONS_ROOT, 'auth')
const ATOMIC_SUFFIX = '.temporal'
if (!fs.existsSync(AUTH_ROOT)) fs.mkdirSync(AUTH_ROOT, { recursive: true })
if (!fs.existsSync(SESSIONS_ROOT)) fs.mkdirSync(SESSIONS_ROOT, { recursive: true })

// formatea pairing code en grupos de 4 con guiones
function formatPairingCode(raw) {
  if (!raw || typeof raw !== 'string') return raw
  return (raw.replace(/\s+/g, '').match(/.{1,4}/g) || [raw]).join('-')
}
function delay(ms) { return new Promise(r => setTimeout(r, ms)) }

// intenta varias ubicaciones de requestPairingCode en la instancia sock
async function tryRequestPairingCode(sock, phone, attempts = 5, interval = 800) {
  for (let i = 0; i < attempts; i++) {
    try {
      if (!sock) throw new Error('sock inexistente')
      if (typeof sock.requestPairingCode === 'function') {
        const code = await sock.requestPairingCode(phone)
        if (code) return String(code)
      }
      if (sock.signal && typeof sock.signal.requestPairingCode === 'function') {
        const code = await sock.signal.requestPairingCode(phone)
        if (code) return String(code)
      }
      if (sock.ws && typeof sock.ws.requestPairingCode === 'function') {
        const code = await sock.ws.requestPairingCode(phone)
        if (code) return String(code)
      }
    } catch (e) {
      console.warn('[subbot] intento requestPairingCode falló (intento ' + (i+1) + '):', e?.message || e)
    }
    await delay(interval)
  }
  return null
}

// adaptadores de envío según la API del conn principal
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

// crea socket temporal usando wrapper local si existe, sino baileys nativo
async function makeTempSocket(sessionName, browser = ['Windows', 'Firefox']) {
  const bailPkg = await import('@whiskeysockets/baileys')
  const { useMultiFileAuthState, fetchLatestBaileysVersion } = bailPkg

  // intentamos tu wrapper local en ./configuraciones/simple.js (ruta dentro comandos/)
  let makeWASocket = null
  try {
    const mod = await import('./configuraciones/simple.js')
    makeWASocket = mod.makeWASocket ?? mod.default ?? null
  } catch (e) {}
  if (!makeWASocket) makeWASocket = (await import('@whiskeysockets/baileys')).makeWASocket

  const authDir = path.join(AUTH_ROOT, sessionName)
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true })

  const { state, saveCreds } = await useMultiFileAuthState(authDir)

  let version = [2, 2320, 3]
  try {
    const v = await fetchLatestBaileysVersion()
    version = v.version
  } catch (e) {}

  const sock = makeWASocket({
    auth: state,
    browser: browser,
    version,
    printQRInTerminal: false
  })

  sock.ev.on('creds.update', saveCreds)

  // auto-limpieza si nunca se inicializa (comportamiento similar al ejemplo)
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
      console.log(`[AUTO-LIMPIEZA] Sesión ${sessionName} eliminada por no finalizar autenticación.`)
    }
  }, 60_000)

  return { sock, authDir }
}

// logging helpers (usa tus módulos)
function logCommandEvent(msg) { printCommandEvent({ message: msg, connection: 'Pendiente', type: 'SubBot' }) }
function logSessionCreated(jid) { printSessionEvent({ action: 'Session creada en', number: jid }) }

// handler: SOLO #code
var handler = async (m, { conn }) => {
  try {
    const rawText = (m.text || m.body || '').trim()
    const lc = rawText.toLowerCase()
    const isCode = lc === '#code' || lc === '.code' || lc === 'code'
    if (!isCode) return

    logCommandEvent(rawText)

    // creamos sub-socket usando el browser igual al ejemplo ['Windows','Firefox']
    const sessionName = `sub-${Date.now()}-${randomBytes(3).toString('hex')}`
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

    // timeout por expiración
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

    // escucha updates de Baileys
    sock.ev.on('connection.update', async (update) => {
      if (finished) return
      const { connection, lastDisconnect, qr, isNewLogin } = update

      if (isNewLogin) sock.isInit = false

      // cuando Baileys emite qr-string -> pedimos pairing code pasando el número del usuario
      if (qr && !finished) {
        // damos un pequeño delay para que la instancia esté lista
        await delay(2000)
        let phone = (m.sender || '').split('@')[0] || sessionName
        phone = phone.replace(/\D/g, '') || sessionName

        try {
          const secret = await tryRequestPairingCode(sock, phone, 6, 800)
          if (!secret) {
            // no enviar código falso, notificar y limpiar
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
          // enviar SOLO el código formateado (bloque) sin texto extra
          payloadMsg = await sendText(conn, m.chat, '```' + formatted + '```', m).catch(()=>null)
          console.log('[subbot] pairing code enviado (real):', formatted)
        } catch (err) {
          console.error('[subbot] error obteniendo pairing code:', err)
          finished = true
          clearTimeout(timeoutId)
          try { await sendText(conn, m.chat, `*[❁]* No se pudo generar el código de vinculación.\n> ¡Intenta conectarte nuevamente!`, m) } catch {}
          await tryDeleteMessage(conn, m.chat, introMsg)
          await tryDeleteMessage(conn, m.chat, payloadMsg)
          try { sock.logout?.().catch(()=>{}); sock.close?.().catch(()=>{}) } catch {}
          try { fs.rmSync(authDir // on open -> persistir sesión, notificar y limpiar mensajes
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
        } catch (e) {
          console.error('[subbot] error on open handling:', e)
        }
      }

      // disconnects
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