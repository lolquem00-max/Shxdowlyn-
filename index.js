import fs, { readdirSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import path, { join } from 'path';
import readline from 'readline';
import chalk from 'chalk';
import pkg from 'google-libphonenumber';
const { PhoneNumberUtil } = pkg;
const phoneUtil = PhoneNumberUtil.getInstance();

import { 
  makeWASocket, 
  useMultiFileAuthState, 
  jidNormalizedUser, 
  fetchLatestBaileysVersion, 
  makeCacheableSignalKeyStore 
} from '@whiskeysockets/baileys';

import { Low, JSONFile } from 'lowdb';
import NodeCache from 'node-cache';
import Pino from 'pino';
import syntaxerror from 'syntax-error';

// Interfaces
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = texto => new Promise(resolve => rl.question(texto, resolve));

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

// Inicialización del bot
export async function startBot() {
  const { state, saveState, saveCreds } = await useMultiFileAuthState(sessionsFolder);
  const methodCodeQR = process.argv.includes("qr");
  const methodCode = process.argv.includes("code");

  // Elegir opción QR o código de 8 dígitos
  let opcion;
  if (!existsSync(`./${sessionsFolder}/creds.json`)) {
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
  }

  // Logger compatible
  const logger = Pino({ level: 'silent' });

  // Configuración del socket
  const { version } = await fetchLatestBaileysVersion();
  const msgRetryCounterCache = new NodeCache({ stdTTL: 0, checkperiod: 0 });
  const userDevicesCache = new NodeCache({ stdTTL: 0, checkperiod: 0 });

  const connectionOptions = {
    logger,
    printQRInTerminal: opcion === '1' || methodCodeQR,
    browser: ["Shxdowlyn", "Chrome", "1.0.0"],
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger.child({ level: 'fatal' }))
    },
    version,
    msgRetryCounterCache,
    userDevicesCache
  };

  const conn = makeWASocket(connectionOptions);
  conn.ev.on('creds.update', saveCreds);

  // Código de 8 dígitos
  if (opcion === '2' || methodCode) {
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

  // Reconexión y mensajes
  conn.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'open') {
      console.log(chalk.green.bold(`[ 🐋 ] Conectado como: ${conn.user?.name || 'Desconocido'}`));
    } else if (connection === 'close') {
      console.log(chalk.yellow("→ Reconectando el Bot..."));
      await startBot();
    }
  });

  // Plugins y comandos
  const comandoFolder = join(process.cwd(), './comandos');
  global.plugins = {};
  global.comandos = {};
  const comandoFilter = filename => /.js$/.test(filename);

  async function filesInit() {
    for (const filename of readdirSync(comandoFolder).filter(comandoFilter)) {
      try {
        const file = join(comandoFolder, filename);
        const module = await import(file);
        global.plugins[filename] = module.default || module;
        global.comandos[filename] = module.default || module;
      } catch (e) {
        delete global.plugins[filename];
        delete global.comandos[filename];
      }
    }
  }
  await filesInit();

  // Limpieza carpeta temporal
  setInterval(() => {
    const tmpDir = join(process.cwd(), 'temporal');
    if (!existsSync(tmpDir)) return;
    readdirSync(tmpDir).forEach(file => unlinkSync(join(tmpDir, file)));
    console.log(chalk.gray("→ Archivos temporales eliminados"));
  }, 30 * 1000);

  return conn;
}

// Iniciar bot
startBot().catch(console.error);