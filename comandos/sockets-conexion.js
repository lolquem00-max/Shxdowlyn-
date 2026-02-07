// comandos/sockets-conexion.js
// Maneja comandos #code / #qr para crear sub-sockets con @whiskeysockets/baileys
// - En modo QR: envía el texto de instrucciones junto con la imagen del QR (misma mensaje).
// - En modo CODE: envía el texto de instrucciones y, cuando Baileys genere el pairing code real, envía SÓLO el código (sin texto extra).
// - Si no puede obtener código real, informa fallo y no envía código falso.
// Guarda sesiones en jsons/sockets/JadiBot.json y auth en jsons/sockets/auth/<sessionName>

import fs from 'fs'
import path from 'path'
import qrcode from 'qrcode'
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

// util helpers
function boxify(lines) {
  const top = '╔✿︎' + '═'.repeat(8) + '𑁍' + '═'.repeat(8) + '✿︎╗'
  const bottom = '╚✿︎' + '═'.repeat(8) + '𑁍' + '═'.repeat(8) + '✿︎╝'
  const body = lines.map(l => `║${l}`).join('\n')
  return `${top}\n${body}\n${bottom}`
}
function logCommandEvent({ message, connection = 'Pendiente', type = 'SubBot' }) {
  const lines = [
    '❁ `Mención grupal` ❁', '',
    '*[❀] Mensaje:*', '',
    `Mensaje: (${message})`,
    `Conexion: (${connection})`,
    `Tipo: ${type}`
  ]
  console.log(boxify(lines))
}
function logSessionEvent({ action = 'Session creada en', number = 'unknown' }) {
  const lines = [action, `(${number})`]
  console.log(boxify(lines))
}

async function sendText(conn, chat, text, quoted = null) {
  if (typeof conn.reply === 'function') return conn.reply(chat, text, quoted)
  if (typeof conn.sendMessage === 'function') return conn.sendMessage(chat, { text }, { quoted })
  throw new Error('conn tiene que exponer reply o sendMessage')
}
async function sendImageWithCaption(conn, chat, buffer, caption = '', quoted = null) {
  if (typeof conn.sendMessage === 'function') return conn.sendMessage(chat, { image: buffer, caption }, { quoted })
  if (typeof conn.sendFile === 'function') return conn.sendFile(chat, buffer, 'qrcode.png', caption, quoted)
  throw new Error('conn no tiene método para enviar imágenes')
}
async function tryDeleteMessage(conn, chat, msgObj) {
  if (!msgObj) return
  try {
    // Primero intento la API más común: conn.deleteMessage(chat, id)
    if (typeof conn.deleteMessage === 'function') {
      const id = msgObj?.key?.id || msgObj?.id || msgObj
      if (id) return await conn.deleteMessage(chat, id).catch(()=>{})
    }
    // Fallback: algunos bots usan sendMessage(chat, { delete: msg.key })
    if (typeof conn.sendMessage === 'function' && msgObj?.key) {
      try { return await conn.sendMessage(chat, { delete: msgObj.key }) } catch (e) {}
    }
    // Otra posibilidad: eliminación vía conn.relay or conn.raw - omitimos para no romper
  } catch (e) {
    // ignore
  }
}

// crea un socket temporal usando baileys (useMultiFileAuthState)
// retorna { sock, authDir }
async function makeTempSocket(sessionName) {
  const baileysPkg = await import('@whiskeysockets/baileys')
  const { useMultiFileAuthState, fetchLatestBaileysVersion } = baileysPkg
  // intenta usar wrapper local si existe (tu proyecto puede tener ../lib/simple.js)
  let makeWASocket = null
  try {
    const mod = await import('../lib/simple.js')
    makeWASocket = mod.makeWASocket ?? mod.default ?? null
  } catch (e) {}
  if (!makeWASocket) makeWASocket = baileysPkg.makeWASocket

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
    browser: ['Ubuntu', 'Chrome', '1.0'],
    version,
    printQRInTerminal: false
  })

  sock.ev.on('creds.update', saveCreds)
  return { sock, authDir }
}

function formatPairingCode(raw) {
  if (!raw || typeof raw !== 'string') return raw
  const s = raw.replace(/\s+/g, '')
  const parts = s.match(/.{1,4}/g) || [s]
  return parts.join('-')
}

// handler principal
var handler = async (m, { conn }) => {
  try {
    const rawText = (m.text || m.body || '').trim()
    const lc = rawText.toLowerCase()
    const wantCode = lc === '#code' || lc === '.code' || lc === 'code'
    const wantQr = lc === '#qr' || lc === '.qr' || lc === 'qr'
    if (!wantCode && !wantQr) return

    // log inicial
    logCommandEvent({ message: rawText, connection: 'Pendiente', type: 'SubBot' })

    const sessionName = `sub-${Date.now()}-${randomBytes(3).toString('hex')}`
    const { sock, authDir } = await makeTempSocket(sessionName)

    let introMsg = null
    let payloadMsg = null
    let finished = false
    const expireMs = wantCode ? 45_000 : 60_000

    // construir mensaje intro
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

    const introQr = [
      '✿︎ `Vinculación de sockets` ✿︎',
      '',
      'Modo: *Codigo qr*.',
      '',
      '`❁ Instrucciones:`',
      'Más opciones > Dispositivos vinculados > Escanea el código de la foto.',
      '',
      '*_Nota_* Necesitas otro teléfono o PC y escanear antes de los 60 segundos.'
    ].join('\n')

    // enviar intro (para QR se enviará junto con la imagen cuando llegue el QR, pero enviamos intro primero
    // para mantener la UX igual que pediste)
    introMsg = await sendText(conn, m.chat, wantCode ? introCode : introQr, m).catch(()=>null)

    // timeout por expiración
    const timeoutId = setTimeout(async () => {
      if (finished) return
      finished = true
      try { await sendText(conn, m.chat, `*[❁]* No se pudo conectar al socket.\n> ¡Intenta conectarte nuevamente!`, m) } catch (e) {}
      await tryDeleteMessage(conn, m.chat, introMsg)
      await tryDeleteMessage(conn, m.chat, payloadMsg)
      try { sock.logout?.().catch(()=>{}); sock.close?.().catch(()=>{}) } catch {}
      try { fs.rmSync(authDir, { recursive: true, force: true }) } catch {}
      logCommandEvent({ message: rawText, connection: 'Fallida', type: 'SubBot' })
    }, expireMs + 2000)

    // escucha updates de Baileys
    sock.ev.on('connection.update', async update => {
      if (finished) return
      const { connection, lastDisconnect, qr } = update

      // Llegó QR/texto que Baileys expone
      if (qr && !finished) {
        try {
          if (wantCode) {
            // Intentar usar pairing code real: requestPairingCode(phone)
            try {
              if (typeof sock.requestPairingCode === 'function') {
                const phone = (m.sender || '').split('@')[0] || sessionName
                let secret = await sock.requestPairingCode(phone)
                if (!secret) throw new Error('pairing code vacío')
                const formatted = formatPairingCode(String(secret))
                // enviar SOLO el código en bloque de código (sin texto adicional)
                payloadMsg = await sendText(conn, m.chat, '```' + formatted + '```', m).catch(()=>null)
                console.log('[subbot] pairing code real enviado:', formatted)
              } else {
                // si no existe requestPairingCode -> no enviar código falso, notificar fallo
                finished = true
                clearTimeout(timeoutId)
                await sendText(conn, m.chat, `*[❁]* No se pudo generar el código de vinculación.\n> ¡Intenta conectarte nuevamente!`, m).catch(()=>{})
                await tryDeleteMessage(conn, m.chat, introMsg)
                try { sock.logout?.().catch(()=>{}); sock.close?.().catch(()=>{}) } catch {}
                try { fs.rmSync(authDir, { recursive: true, force: true }) } catch {}
                logCommandEvent({ message: rawText, connection: 'Fallida', type: 'SubBot' })
                return
              }
            } catch (err) {
              // error al pedir pairing code
              finished = true
              clearTimeout(timeoutId)
              console.error('[subbot] error pairing code:', err)
              await sendText(conn, m.chat, `*[❁]* No se pudo generar el código de vinculación.\n> ¡Intenta conectarte nuevamente!`, m).catch(()=>{})
              await tryDeleteMessage(conn, m.chat, introMsg)
              await tryDeleteMessage(conn, m.chat, payloadMsg)
              try { sock.logout?.().catch(()=>{}); sock.close?.().catch(()=>{}) } catch {}
              try { fs.rmSync(authDir, { recursive: true, force: true }) } catch {}
              logCommandEvent({ message: rawText, connection: 'Fallida', type: 'SubBot' })
              return
            }
          } else {
            // Modo QR: generamos imagen y la enviamos JUNTAS con el texto (caption)
            try {
              const img = await qrcode.toBuffer(qr, { type: 'png', margin: 1, width: 512 })
              // enviar imagen con caption = introQr (así quedan juntos tal como pediste)
              payloadMsg = await sendImageWithCaption(conn, m.chat, img, introQr, m).catch(()=>null)
              // opcional: si el servidor/conn requiere distinguir intro y payload, ya se envió en un mensaje
            } catch (e) {
              console.error('error al generar/enviar QR image:', e)
            }
          }
        } catch (e) {
          console.error('error en bloque QR/Code:', e)
        }
      }

      // Conexión abierta => persistir sesión y avisar
      if (connection === 'open' && !finished) {
        finished = true
        clearTimeout(timeoutId)
        try {
          const jid = sock.user?.id || sock.user?.jid || `${sessionName}@s.whatsapp.net`
          addSession({ socket: jid, sessionFile: authDir, active: true, createdAt: Date.now(), browser: 'Ubuntu' })
          try { await sendText(conn, m.chat, `*[❁]* La conexión con el socket fue un éxito.\n> ¡Personaliza el socket usando el comando ${'.set'}!`, m).catch(()=>{}) } catch {}
          await tryDeleteMessage(conn, m.chat, introMsg)
          await tryDeleteMessage(conn, m.chat, payloadMsg)
          logCommandEvent({ message: rawText, connection: 'Exitosa', type: 'SubBot' })
          logSessionEvent({ action: 'Session creada en', number: jid })
          // mantener sock vivo (sub-bot)
          if (!global.conns) global.conns = []
          global.conns.push(sock)
        } catch (e) {
          console.error('error on open handling:', e)
        }
      }

      // Desconexiones / errores
      if (lastDisconnect && lastDisconnect.error && !finished) {
        try {
          const baileysPkg = await import('@whiskeysockets/baileys')
          const { DisconnectReason } = baileysPkg
          const reason = lastDisconnect?.error?.output?.statusCode
          if (reason === DisconnectReason.loggedOut) {
            const jid = sock.user?.id || `${sessionName}@s.whatsapp.net`
            removeSession(jid)
            logSessionEvent({ action: 'Session cerrada en', number: jid })
          }
        } catch (e) {}
        finished = true
        clearTimeout(timeoutId)
        try { await sendText(conn, m.chat, `*[❁]* No se pudo conectar al socket.\n> ¡Intenta conectarte nuevamente!`, m).catch(()=>{}) } catch {}
        await tryDeleteMessage(conn, m.chat, introMsg)
        await tryDeleteMessage(conn, m.chat, payloadMsg)
        try { sock.logout?.().catch(()=>{}); sock.close?.().catch(()=>{}) } catch {}
        try { fs.rmSync(authDir, { recursive: true, force: true }) } catch {}
        logCommandEvent({ message: rawText, connection: 'Fallida', type: 'SubBot' })
      }
    })

    // keep handler alive, socket runs in background
    return
  } catch (err) {
   )
    try { await conn.reply(m.chat, `⚠︎ Ocurrió un error: ${err.message || err}`, m) } catch {}
  }
}

handler.help = ['code', 'qr']
handler.tags = ['subbot', 'sockets']
handler.command = ['#code', '#qr', '.code', '.qr', 'code', 'qr', 'QR']

export default handler