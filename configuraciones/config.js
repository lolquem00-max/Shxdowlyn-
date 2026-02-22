import fs from 'fs';
import chalk from 'chalk';
import { watchFile, unwatchFile } from 'fs';
import { fileURLToPath } from 'url';

const file = fileURLToPath(import.meta.url);
watchFile(file, () => {
  unwatchFile(file);
  console.log(chalk.greenBright("✅ El archivo Config.js fue actualizado y guardado en el servidor con éxito."));
  import(`\( {file}?update= \){Date.now()}`);
});

// #_Owner List_#
global.owner = [
  '5493863447787',
];

global.mods = [
  '5493863402551',
];

// #_Bot Manager_#

global.botname = 'Shxdowlyn';
global.textbot = 'Developed by Jade';
global.emoji = '✨';
global.ownername = 'Jade';
global.version = '1.0.0';
global.ttag = ['5493863447787'];
global.prems = [];

// #_Channel Manager_#

global.newletter = '120363404822730259@newsletter';
global.channelname = 'Shxdowlyn bot';

// #Mood Manager#

global.jadi = 'Jadibots';
global.sessions = 'Session';
global.Jadibots = true;