import fs, { readdirSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import path, { join } from 'path';
import readline from 'readline';
import chalk from 'chalk';
import qrcode from 'qrcode-terminal';
import pkg from 'google-libphonenumber';
const { PhoneNumberUtil } = pkg;
const phoneUtil = PhoneNumberUtil.getInstance();
import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';
import { Low, JSONFile } from 'lowdb';
import NodeCache from 'node-cache';

// Carpeta de sesiones
const sessionsFolder = 'sessions';
if (!existsSync(`./${sessionsFolder}`)) mkdirSync(`./${sessionsFolder}`, { recursive: true });

// Base de datos
global.db = new Low(new JSONFile('database.json'));
await global.db.read();
global.db.data ||= { users: {}, chats: {}, settings: {} };

// Función para validar número
async function isValidPhoneNumber(number) {
  try {
    number = number.replace(/\s+/g, '');
    if (number.startsWith('+521')) number = number.replace('+521', '+52');
    else if (number.startsWith('+52') && number[4] === '1') number = number.replace('+52 1', '+52');
    const parsed = phoneUtil.parseAndKeepRawInput(number);
    return phoneUtil.isValidNumber(parsed);
  } catch { return false; }
}

// Logger mínimo
const logger = { info() {}, error() {}, debug() {}, child() { return this; } };

// Readline para input
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (texto) => new Promise(resolve => rl.question(texto, resolve));

async function startBot() {
  // Banner gigante
  console.clear();
  console.log(chalk.bgBlueBright.white.bold(`
  ███████╗██╗  ██╗██╗  ██╗██████╗ ██╗    ██╗██╗   ██╗██╗███╗   ██╗
  ██╔════╝██║ ██╔╝██║ ██╔╝██╔══██╗██║    ██║██║   ██║██║████╗  ██║
  █████╗  █████╔╝ █████╔╝ ██████╔╝██║ █╗ ██║██║   ██║██║██╔██╗ ██║
  ██╔══╝  ██╔═██╗ ██╔═██╗ ██╔═══╝ ██║███╗██║╚██╗ ██╔╝██║██║╚██╗██║
  ███████╗██║  ██╗██║  ██╗██║     ╚███╔███╔╝ ╚████╔╝ ██║██║ ╚████║
  `));
  console.log(chalk.magentaBright.bold("                     developed by Jade\n"));

  const { state, saveState, saveCreds } = await useMultiFileAuthState(sessionsFolder);

  const methodCodeQR = process.argv.includes("qr");
  const methodCode = process.argv.includes("code");

  // Selección automática o pregunta
  let opcion;
  if (methodCodeQR) opcion = '1';
  else if (methodCode) opcion = '2';
  else {
    do {
      opcion = await question(
        chalk.bold.white("Seleccione una opción:\n") +
        chalk.blueBright("1. Con código QR\n") +
        chalk.cyan("2. Con código de texto de 8 dígitos\n--> ")
      );
      if (!/^[1-2]$/.test(opcion)) console.log(chalk.redBright("Solo se permiten 1 o 2."));
    } while (!['1','2'].includes(opcion));
  }

  // Configuración del socket
  const { version } = await fetchLatestBaileysVersion();
  const msgRetryCounterCache = new NodeCache({ stdTTL: 0, checkperiod: 0 });
  const userDevicesCache = new NodeCache({ stdTTL: 0, checkperiod: 0 });

  const conn = makeWASocket({
    logger,
    printQRInTerminal: false, // manejaremos QR manual con qrcode-terminal
    browser: ["Shxdowlyn", "Chrome", "1.0.0"],
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    version,
    msgRetryCounterCache,
    userDevicesCache
  });

  conn.ev.on('creds.update', saveCreds);

  // Mostrar QR si opción 1
  if (opcion === '1') {
    conn.ev.on('connection.update', update => {
      const qr = update.qr;
      if (qr) {
        console.log(chalk.yellowBright("\n[ SHXDOWLYN 🐢 ] Escanee este QR:\n"));
        qrcode.generate(qr, { small: true });
      }
    });
  }

  // Código de 8 dígitos
  if (opcion === '2') {
    let phoneNumber;
    do {
      phoneNumber = await question(
        chalk.bgBlack.greenBright("[ SHXDOWLYN 🐢 ] Ingrese el número de WhatsApp:\n--> ")
      );
      phoneNumber = phoneNumber.replace(/\D/g, '');
      if (!phoneNumber.startsWith('+')) phoneNumber = `+${phoneNumber}`;
    } while (!await isValidPhoneNumber(phoneNumber));

    rl.close();
    const addNumber = phoneNumber.replace(/\D/g, '');
    setTimeout(async () => {
      const codeBot = await conn.requestPairingCode(addNumber);
      console.log(
        chalk.bgMagenta.white.bold("[ 🫐 ] Código:"),
        chalk.white.bold(codeBot.match(/.{1,4}/g)?.join('-') || codeBot)
      );
    }, 1000);
  }

  // Reconexión
  conn.ev.on('connection.update', async (update) => {
    const { connection } = update;
    if (connection === 'open') {
      console.log(chalk.green.bold(`[ 🐋 ] Conectado como: ${conn.user?.name || 'Desconocido'}`));
    } else if (connection === 'close') {
      console.log(chalk.yellow("→ Reconectando el Bot..."));
      await startBot();
    }
  });

  return conn;
}

// Iniciar bot
startBot().catch(console.error);