import fs, { existsSync, mkdirSync, rmSync } from 'fs'
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
  DisconnectReason,
  Browsers
} from '@whiskeysockets/baileys'
import { Low, JSONFile } from 'lowdb'
import NodeCache from 'node-cache'
import P from 'pino'
import { handler } from './configuraciones/manejador.js'

const { PhoneNumberUtil } = pkg
const phoneUtil = PhoneNumberUtil.getInstance()

/* ========= FIX ESM ========= */

global.__filename = (url = import.meta.url) => fileURLToPath(url)
global.__dirname = (url = import.meta.url) => dirname(fileURLToPath(url))

/* ========= SESSION FOLDER ========= */

const sessionsFolder = './sessions'
if (!existsSync(sessionsFolder)) {
  mkdirSync(sessionsFolder, { recursive: true })
}

/* ========= DATABASE SEGURA ========= */

global.db = new Low(new JSONFile('database.json'))
try {
  await global.db.read()
  if (!global.db.data) {
    global.db.data = { users: {}, chats: {}, settings: {} }
    await global.db.write()
  }
} catch {
  console.log(chalk.red('Base de datos corrupta. Reiniciando...'))
  global.db.data = { users: {}, chats: {}, settings: {} }
  await global.db.write()
}

/* ========= LOGGER ========= */

const logger = P({ level: 'silent' })

/* ========= READLINE ========= */

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

/* ========= START BOT ========= */

async function startBot() {

  console.clear()

  console.log(chalk.hex('#8A2BE2').bold(`
 ███████╗██╗  ██╗██╗  ██╗██████╗  ██████╗ ██╗    ██╗
 ██╔════╝██║  ██║██║ ██╔╝██╔══██╗██╔═══██╗██║    ██║
 ███████╗███████║█████╔╝ ██████╔╝██║   ██║██║ █╗ ██║
 ╚════██║██╔══██║██╔═██╗ ██╔═══╝ ██║   ██║██║███╗██║
 ███████║██║  ██║██║  ██╗██║     ╚██████╔╝╚███╔███╔╝
 ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝      ╚═════╝  ╚══╝╚══╝
  `))
  console.log(chalk.magentaBright.bold(" Subzero-MD • AngularSockets Edition\n"))

  const { state, saveCreds } = await useMultiFileAuthState(sessionsFolder)
  const { version } = await fetchLatestBaileysVersion()

  const conn = makeWASocket({
    logger,
    printQRInTerminal: false,
    browser: Browsers.macOS('Shxdowlyn'),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    version,
    msgRetryCounterCache: new NodeCache(),
    userDevicesCache: new NodeCache(),
    syncFullHistory: false,
    markOnlineOnConnect: true
  })

  conn.ev.on('creds.update', saveCreds)

  /* ========= CONNECTION UPDATE ========= */

  conn.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      console.log(chalk.yellow('\nEscanea el QR:\n'))
      qrcode.generate(qr, { small: true })
    }

    if (connection === 'close') {

      const statusCode = lastDisconnect?.error?.output?.statusCode

      console.log(chalk.red('Conexión cerrada. Código:'), statusCode)

      switch (statusCode) {

        case DisconnectReason.badSession:
          console.log(chalk.red('Sesión corrupta eliminada.'))
          rmSync(sessionsFolder, { recursive: true, force: true })
          process.exit()

        case DisconnectReason.loggedOut:
          console.log(chalk.red('Sesión cerrada. Escanea nuevamente.'))
          rmSync(sessionsFolder, { recursive: true, force: true })
          process.exit()

        case DisconnectReason.connectionClosed:
        case DisconnectReason.connectionLost:
        case DisconnectReason.timedOut:
          console.log(chalk.yellow('Reconectando...'))
          startBot()
          break

        default:
          console.log(chalk.yellow('Reintentando conexión...'))
          startBot()
      }
    }

    if (connection === 'open') {
      console.log(chalk.green(`Conectado como ${conn.user?.name || 'Usuario'}`))
    }
  })

  /* ========= MESSAGE HANDLER ========= */

  conn.ev.on('messages.upsert', async (chatUpdate) => {
    try {
      await handler.call(conn, chatUpdate)
    } catch (err) {
      console.error(chalk.red('Error en handler:'), err)
    }
  })

  return conn
}

startBot().catch(err => {
  console.error(chalk.red('Error crítico:'), err)
})