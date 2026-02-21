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

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = texto => new Promise(resolve => rl.question(texto, resolve));

const sessionsFolder = 'sessions';
if (!existsSync(sessionsFolder)) mkdirSync(sessionsFolder, { recursive: true });

global.db = new Low(new JSONFile('database.json'));
await global.db.read();
global.db.data ||= { users: {}, chats: {}, settings: {} };

async function isValidPhoneNumber(number){
  try{
    number = number.replace(/\s+/g,'');
    if(number.startsWith('+521')) number = number.replace('+521','+52');
    else if(number.startsWith('+52') && number[4]==='1') number = number.replace('+52 1','+52');
    const parsed = phoneUtil.parseAndKeepRawInput(number);
    return phoneUtil.isValidNumber(parsed);
  } catch { return false; }
}

async function startBot(){
  const { state, saveState, saveCreds } = await useMultiFileAuthState(sessionsFolder);
  const methodQR = process.argv.includes("qr");
  const methodCode = process.argv.includes("code");

  let opcion;
  if(!existsSync(`./${sessionsFolder}/creds.json`)){
    if(methodQR) opcion='1';
    else if(methodCode) opcion='2';
    else{
      do{
        opcion = await question(
          chalk.bold.white("Seleccione una opción:\n")+
          chalk.blueBright("1. Con código QR\n")+
          chalk.cyan("2. Con código de 8 dígitos\n--> ")
        );
        if(!/^[1-2]$/.test(opcion)) console.log(chalk.redBright("Solo se permiten 1 o 2."));
      }while(!['1','2'].includes(opcion));
    }
  }

  const logger = Pino({ level:'silent' });
  const { version } = await fetchLatestBaileysVersion();
  const msgRetryCounterCache = new NodeCache({ stdTTL:0, checkperiod:0 });
  const userDevicesCache = new NodeCache({ stdTTL:0, checkperiod:0 });

  const conn = makeWASocket({
    logger,
    printQRInTerminal: opcion==='1' || methodQR,
    browser:["Shxdowlyn","Chrome","1.0.0"],
    auth:{ creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger.child({level:'fatal'})) },
    version,
    msgRetryCounterCache,
    userDevicesCache
  });

  conn.ev.on('creds.update', saveCreds);

  if(opcion==='2' || methodCode){
    let phoneNumber;
    do{
      phoneNumber = await question(chalk.bgBlack.greenBright("[ SHXDOWLYN 🐢 ] Ingrese el número de WhatsApp:\n--> "));
      phoneNumber = phoneNumber.replace(/\D/g,'');
      if(!phoneNumber.startsWith('+')) phoneNumber = `+${phoneNumber}`;
    }while(!await isValidPhoneNumber(phoneNumber));
    rl.close();
    const addNumber = phoneNumber.replace(/\D/g,'');
    setTimeout(async()=>{
      const codeBot = await conn.requestPairingCode(addNumber);
      console.log(
        chalk.bgMagenta.white.bold("[ 🫐 ] Código:"),
        chalk.white.bold(codeBot.match(/.{1,4}/g)?.join('-')||codeBot)
      );
    },1000);
  }

  conn.ev.on('connection.update', async(update)=>{
    const { connection, lastDisconnect } = update;
    if(connection==='open') console.log(chalk.green.bold(`[ 🐋 ] Conectado como: ${conn.user?.name||'Desconocido'}`));
    else if(connection==='close') { 
      console.log(chalk.yellow("→ Reconectando el Bot...")); 
      await startBot();
    }
  });

  // Carga de comandos
  global.plugins={}; global.comandos={};
  const comandoFolder = join(process.cwd(),'./comandos');
  const comandoFilter = f=>/.js$/.test(f);
  for(const filename of readdirSync(comandoFolder).filter(comandoFilter)){
    try{
      const module = await import(join(comandoFolder,filename));
      global.plugins[filename]=module.default||module;
      global.comandos[filename]=module.default||module;
    }catch(e){ delete global.plugins[filename]; delete global.comandos[filename]; }
  }

  // Carpeta temporal
  setInterval(()=>{
    const tmpDir = join(process.cwd(),'temporal');
    if(!existsSync(tmpDir)) return;
    readdirSync(tmpDir).forEach(f=>unlinkSync(join(tmpDir,f)));
    console.log(chalk.gray("→ Archivos temporales eliminados"));
  },30*1000);

  return conn;
}

startBot().catch(console.error);