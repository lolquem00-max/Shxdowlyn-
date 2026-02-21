
import fs from 'fs';
import readline from 'readline';
import chalk from 'chalk';
import { PhoneNumberUtil } from 'google-libphonenumber';
import { makeWASocket, useMultiFileAuthState, jidNormalizedUser } from '@whiskeysockets/baileys';
const phoneUtil = PhoneNumberUtil.getInstance();

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (texto) => new Promise(resolve => rl.question(texto, resolve));

async function isValidPhoneNumber(number) {
  try {
    number = number.replace(/\s+/g, '');
    if (number.startsWith('+521')) number = number.replace('+521', '+52');
    else if (number.startsWith('+52') && number[4] === '1') number = number.replace('+52 1', '+52');
    const parsedNumber = phoneUtil.parseAndKeepRawInput(number);
    return phoneUtil.isValidNumber(parsedNumber);
  } catch { return false; }
}

export async function startBot() {
  const sessionsFolder = 'sessions';
  if (!fs.existsSync(`./${sessionsFolder}`)) fs.mkdirSync(`./${sessionsFolder}`, { recursive: true });

  const { state, saveState, saveCreds } = await useMultiFileAuthState(sessionsFolder);

  let opcion;
  const methodCodeQR = process.argv.includes("qr");
  const methodCode = process.argv.includes("code");

  // Elegir opción si no existe sesión
  if (!fs.existsSync(`./${sessionsFolder}/creds.json`)) {
    if (methodCodeQR) opcion = '1';
    else if (!methodCode) {
      do {
        opcion = await question(
          chalk.bold.white("Seleccione una opción:\n") +
          chalk.blueBright("1. Con código QR\n") +
          chalk.cyan("2. Con código de texto de 8 dígitos\n--> ")
        );
        if (!/^[1-2]$/.test(opcion)) console.log(chalk.redBright("Solo se permiten 1 o 2."));
      } while (!['1', '2'].includes(opcion));
    }
  } else {
    console.log(chalk.greenBright("[ 🐋 ] Sesión ya existente. No se requiere registro."));
    rl.close();
  }

  const connectionOptions = {
    logger: { info() {}, error() {}, debug() {} },
    printQRInTerminal: opcion === '1' || methodCodeQR ? true : false,
    browser: ["Shxdowlyn", "Chrome", "1.0.0"],
    auth: { creds: state.creds, keys: state.keys },
  };

  const conn = makeWASocket(connectionOptions);
  conn.ev.on('creds.update', saveCreds);

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
      const formattedCode = codeBot.match(/.{1,4}/g)?.join('-') || codeBot;
      console.log(chalk.bgMagenta.white.bold("[ 🫐 ] Código:"), chalk.white.bold(formattedCode));
    }, 1000);
  }

  conn.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'open') {
      const userName = conn.user.name || conn.user.verifiedName || "Desconocido";
      console.log(chalk.green.bold(`[ 🐋 ] Conectado como: ${userName}`));
    } else if (connection === 'close') {
      console.log(chalk.yellow("→ Reconectando el Bot..."));
    }
  });

  return conn;
}

// Para iniciar el bot
startBot().catch(console.error);