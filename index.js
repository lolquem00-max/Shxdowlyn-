import readline from 'readline';
import chalk from 'chalk';
import fs from 'fs';
import { PhoneNumberUtil } from 'google-libphonenumber';
const phoneUtil = PhoneNumberUtil.getInstance();

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (texto) => new Promise(resolve => rl.question(texto, resolve));

// Valida que sea un número de WhatsApp válido
async function isValidPhoneNumber(number) {
  try {
    number = number.replace(/\s+/g, '');
    if (number.startsWith('+521')) number = number.replace('+521', '+52');
    else if (number.startsWith('+52') && number[4] === '1') number = number.replace('+52 1', '+52');

    const parsedNumber = phoneUtil.parseAndKeepRawInput(number);
    return phoneUtil.isValidNumber(parsedNumber);
  } catch {
    return false;
  }
}

// Registro de número con QR o código de texto
export async function registerNumber(conn, sessionsFolder, botNumber) {
  let opcion;

  const methodCodeQR = process.argv.includes("qr");
  const methodCode = !!botNumber || process.argv.includes("code");

  // Si ya existe sesión, no hace nada
  if (fs.existsSync(`./${sessionsFolder}/creds.json`)) {
    console.log(chalk.greenBright("[ 🐋 ] Ya existe una sesión activa."));
    rl.close();
    return;
  }

  // Elegir opción si no viene predefinida
  if (methodCodeQR) opcion = '1';
  if (!methodCodeQR && !methodCode) {
    do {
      opcion = await question(
        chalk.bold.white("Seleccione una opción:\n") +
        chalk.blueBright("1. Con código QR\n") +
        chalk.cyan("2. Con código de texto de 8 dígitos\n--> ")
      );
      if (!/^[1-2]$/.test(opcion)) console.log(chalk.redBright("Solo se permiten 1 o 2."));
    } while (!['1', '2'].includes(opcion));
  }

  // Opción 2 → pedir número y generar código de 8 dígitos
  if (opcion === '2' || methodCode) {
    let phoneNumber = botNumber || '';
    let addNumber;

    if (!phoneNumber) {
      do {
        phoneNumber = await question(
          chalk.bgBlack.greenBright("[ SHXDOWLYN 🐢 ] Ingrese el número de WhatsApp:\n--> ")
        );
        phoneNumber = phoneNumber.replace(/\D/g, '');
        if (!phoneNumber.startsWith('+')) phoneNumber = `+${phoneNumber}`;
      } while (!await isValidPhoneNumber(phoneNumber));
    }

    rl.close();
    addNumber = phoneNumber.replace(/\D/g, '');

    // Mostrar código después de un segundo para dar tiempo a la conexión
    setTimeout(async () => {
      const codeBot = await conn.requestPairingCode(addNumber);
      const formattedCode = codeBot.match(/.{1,4}/g)?.join('-') || codeBot;
      console.log(
        chalk.bgMagenta.white.bold("[ 🫐 ] Código:"),
        chalk.white.bold(formattedCode)
      );
    }, 1000);
  }

  // Opción 1 → QR terminal
  if (opcion === '1' || methodCodeQR) {
    console.log(chalk.green.bold("[ 🐋 ] Escanea este código QR en WhatsApp."));
  }
}