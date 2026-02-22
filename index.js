import fs, { existsSync, mkdirSync } from 'fs'
import path, { dirname } from 'path'
import { fileURLToPath } from 'url'
import readline from 'readline'
import chalk from 'chalk'
import qrcode from 'qrcode-terminal'
import pkg from 'google-libphonenumber'
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason
} from '@whiskeysockets/baileys'
import { Low, JSONFile } from 'lowdb'
import NodeCache from 'node-cache'
import { handler } from './configuraciones/manejador.js'

const { PhoneNumberUtil } = pkg
const phoneUtil = PhoneNumberUtil.getInstance()

/* ========= FIX ESM ========= */

global.__filename = (url = import.meta.url) => fileURLToPath(url)
global.__dirname = (url = import.meta.url) => dirname(fileURLToPath(url))

/* ========= SESSION FOLDER ========= */

const sessionsFolder = 'sessions'
if (!existsSync(`./${sessionsFolder}`)) {
  mkdirSync(`./${sessionsFolder}`, { recursive: true })
}

/* ========= DATABASE ========= */

global.db = new Low(new JSONFile('database.json'))
await global.db.read()
if (!global.db.data) {
  global.db.data = { users: {}, chats: {}, settings: {} }
}
await global.db.write()

/* ========= VALID PHONE ========= */

async function isValidPhoneNumber(number) {
  try {
    number = number.replace(/\s+/g, '')
    if (!number.startsWith('+')) number = `+${number}`
    const parsed = phoneUtil.parseAndKeepRawInput(number)
    return phoneUtil.isValidNumber(parsed)
  } catch {
    return false
  }
}

/* ========= LOGGER ========= */

const logger = {
  info() {},
  error() {},
  debug() {},
  child() { return this }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

const question = (text) => new Promise(res => rl.question(text, res))

/* ========= START BOT ========= */

async function startBot() {

  console.clear()
  console.log(chalk.bgBlueBright.white.bold(`
  ███████╗██╗  ██╗██████╗ ██╗    ██╗██╗███╗   ██╗
  ██╔════╝██║ ██╔╝██╔══██╗██║    ██║██║████╗  ██║
  █████╗  █████╔╝ ██████╔╝██║ █╗ ██║██║██╔██╗ ██║
  ██╔══╝  ██╔═██╗ ██╔═══╝ ██║███╗██║██║██║╚██╗██║
  ███████╗██║  ██╗██║     ╚███╔███╔╝██║██║ ╚████║
  `))
  console.log(chalk.magentaBright.bold("Developed by Jade\n"))

  const { state, saveCreds } = await useMultiFileAuthState(sessionsFolder)
  const { version } = await fetchLatestBaileysVersion()

  const conn = makeWASocket({
    logger,
    printQRInTerminal: false,
    browser: ["Shxdowlyn", "Chrome", "1.0.0"],
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    version,
    msgRetryCounterCache: new NodeCache(),
    userDevicesCache: new NodeCache()
  })

  conn.ev.on('creds.update', saveCreds)

  /* ========= QR ========= */

  conn.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      console.log(chalk.yellow("\nEscanea el QR:\n"))
      qrcode.generate(qr, { small: true })
    }

    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode

      if (reason === DisconnectReason.badSession) {
        fs.rmSync('./sessions', { recursive: true, force: true })
        console.log('Sesión corrupta eliminada. Reinicia manualmente.')
        process.exit()
      }

      if (reason === DisconnectReason.loggedOut) {
        console.log('Sesión cerrada. Escanea nuevamente.')
        fs.rmSync('./sessions', { recursive: true, force: true })
        process.exit()
      }

      console.log('Reconectando...')
      startBot()
    }

    if (connection === 'open') {
      console.log(`Conectado como ${conn.user?.name}`)
    }
  })

  /* ========= MESSAGE HANDLER ========= */

  conn.ev.on('messages.upsert', async (chatUpdate) => {
    try {
      await handler.call(conn, chatUpdate)
    } catch (err) {
      console.error('Error en handler:', err)
    }
  })

  return conn
}

startBot().catch(console.error)