import { smsg } from "../comandos/configuraciones/simple.js"
import { format } from "util"
import { fileURLToPath } from "url"
import path, { join } from "path"
import fs, { unwatchFile, watchFile } from "fs"
import chalk from "chalk"
import fetch from "node-fetch"
import ws from "ws"

const isNumber = x => typeof x === "number" && !isNaN(x)
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

export async function handler(chatUpdate) {
  try {

    if (!chatUpdate?.messages) return
    if (!this.user?.jid) return

    this.msgqueque = this.msgqueque || []
    this.uptime = this.uptime || Date.now()

    await this.pushMessage(chatUpdate.messages).catch(() => {})

    let m = chatUpdate.messages[chatUpdate.messages.length - 1]
    if (!m) return

    if (!global.db?.data) await global.loadDatabase().catch(() => {})
    if (!global.db?.data) return

    m = smsg(this, m)
    if (!m || !m.sender) return

    m.exp = 0
    if (typeof m.text !== "string") m.text = ""

    // DEBUG mensaje recibido
    console.log(chalk.cyan(`📩 Mensaje de ${m.sender}: ${m.text}`))

    // ----- USUARIO -----
    const user = global.db.data.users[m.sender] ||= {}

    if (!("name" in user)) user.name = m.name
    if (!isNumber(user.exp)) user.exp = 0
    if (!isNumber(user.level)) user.level = 0
    if (!isNumber(user.health)) user.health = 100
    if (!("genre" in user)) user.genre = ""
    if (!("birth" in user)) user.birth = ""
    if (!("marry" in user)) user.marry = ""
    if (!("description" in user)) user.description = ""
    if (!("packstickers" in user)) user.packstickers = null
    if (!("premium" in user)) user.premium = false
    if (!isNumber(user.premiumTime)) user.premiumTime = 0
    if (!("banned" in user)) user.banned = false
    if (!("bannedReason" in user)) user.bannedReason = ""
    if (!isNumber(user.commands)) user.commands = 0
    if (!isNumber(user.afk)) user.afk = -1
    if (!("afkReason" in user)) user.afkReason = ""
    if (!isNumber(user.warn)) user.warn = 0

    // ----- CHAT -----
    const chat = global.db.data.chats[m.chat] ||= {}

    if (!("isBanned" in chat)) chat.isBanned = false
    if (!("isMute" in chat)) chat.isMute = false
    if (!("welcome" in chat)) chat.welcome = false
    if (!("sWelcome" in chat)) chat.sWelcome = ""
    if (!("sBye" in chat)) chat.sBye = ""
    if (!("detect" in chat)) chat.detect = true
    if (!("primaryBot" in chat)) chat.primaryBot = null
    if (!("modoadmin" in chat)) chat.modoadmin = false
    if (!("antiLink" in chat)) chat.antiLink = true
    if (!("gacha" in chat)) chat.gacha = true

    // ----- SETTINGS -----
    const settings = global.db.data.settings[this.user.jid] ||= {}

    if (!("self" in settings)) settings.self = false
    if (!("restrict" in settings)) settings.restrict = true
    if (!("jadibotmd" in settings)) settings.jadibotmd = true
    if (!("antiPrivate" in settings)) settings.antiPrivate = false
    if (!("gponly" in settings)) settings.gponly = false

    // ----- PERMISOS -----
    const ownerList = (global.owner || []).map(v =>
      v.replace(/[^0-9]/g, "") + "@s.whatsapp.net"
    )

    const premsList = (global.prems || []).map(v =>
      v.replace(/[^0-9]/g, "") + "@s.whatsapp.net"
    )

    const isROwner = ownerList.includes(m.sender)
    const isOwner = isROwner || m.fromMe
    const isPrems = isROwner || premsList.includes(m.sender) || user.premium === true
    const isOwners = [this.user.jid, ...ownerList].includes(m.sender)

    if (settings.self && !isOwners) return

    if (
      settings.gponly &&
      !isOwners &&
      !m.chat.endsWith("g.us") &&
      !/code|p|ping|qr|estado|status|infobot|botinfo|report|reportar|invite|join|logout|suggest|help|menu/gi.test(m.text)
    ) return

    if (m.isBaileys) return

    m.exp += Math.ceil(Math.random() * 10)

    // ----- ADMIN DETECCIÓN -----
    let isAdmin = false
    let isBotAdmin = false

    if (m.isGroup) {
      const meta = await this.groupMetadata(m.chat).catch(() => null)
      const participants = meta?.participants || []

      const userData = participants.find(p => p.id === m.sender)
      const botData = participants.find(p => p.id === this.user.jid)

      isAdmin = ["admin", "superadmin"].includes(userData?.admin)
      isBotAdmin = ["admin", "superadmin"].includes(botData?.admin)
    }

    // ----- PLUGINS -----
    if (!global.plugins) return

    for (const name in global.plugins) {
      const plugin = global.plugins[name]
      if (!plugin || plugin.disabled) continue

      console.log(chalk.yellow(`🔍 Revisando plugin: ${name}`))

      if (typeof plugin.all === "function") {
        try {
          await plugin.all.call(this, m, { chatUpdate })
        } catch (err) {
          console.error(`Error en plugin.all (${name}):`, err)
        }
      }

      const prefix = plugin.customPrefix || global.prefix || /^[.#]/
      const match = prefix instanceof RegExp ? prefix.exec(m.text) : null
      if (!match) continue

      const usedPrefix = match[0]
      const noPrefix = m.text.slice(usedPrefix.length).trim()
      if (!noPrefix) continue

      let [command, ...args] = noPrefix.split(/\s+/)
      command = command?.toLowerCase()
      if (!command) continue

      const isCommand =
        typeof plugin.command === "string"
          ? plugin.command === command
          : plugin.command instanceof RegExp
            ? plugin.command.test(command)
            : Array.isArray(plugin.command)
              ? plugin.command.includes(command)
              : false

      if (!isCommand) continue

      console.log(chalk.green(`⚡ Ejecutando comando: ${command}`))

      const fail = plugin.fail || global.dfail

      if (plugin.rowner && !isROwner) { fail("rowner", m, this); continue }
      if (plugin.owner && !isOwner) { fail("owner", m, this); continue }
      if (plugin.mods && !isOwner) { fail("mods", m, this); continue }
      if (plugin.premium && !isPrems) { fail("premium", m, this); continue }
      if (plugin.group && !m.isGroup) { fail("group", m, this); continue }
      if (plugin.private && m.isGroup) { fail("private", m, this); continue }
      if (plugin.admin && m.isGroup && !isAdmin) { fail("admin", m, this); continue }
      if (plugin.botAdmin && m.isGroup && !isBotAdmin) { fail("botAdmin", m, this); continue }
      if (plugin.restrict && !isOwner) { fail("restrict", m, this); continue }

      try {
        await plugin.call(this, m, { args, command, usedPrefix })
        m.isCommand = true
        user.commands++
      } catch (e) {
        console.error(`Error ejecutando ${name}:`, e)
      }

      break
    }

  } catch (err) {
    console.error("Error general en handler:", err)
  }
}

// ----- DFAlL PERSONALIZADO -----
global.dfail = (type, m, conn) => {
  const msg = {
    rowner: `𝄄ׄㅤ𝅄🌸⃞፝͜͡⌒𝅄 Esta función solo la puede usar mi creador. ¿QUIEN TE CREES?`,
    owner: `𝄄ׄㅤ𝅄🌸⃞፝͜͡⌒𝅄 Esta función solo la puede usar mi creador. ¿QUIEN TE CREES?`,
    mods: `𝄄ׄㅤ𝅄🌸⃞፝͜͡⌒𝅄 Esta función solo la puede usar mi creador. ¿QUIEN TE CREES?`,
    premium: `𝄄ׄㅤ𝅄🍒⃞፝͜͡⌒𝅄 Estas funciones son premium. No puedes usarlo lol.`,
    group: `𝄄ׄㅤ𝅄🌷⃞፝͜͡⌒𝅄 Usaste mal un comando o intentaste usar un comando siendo tan nub? 🌝. Solo sirve en grupos.`,
    private: `𝄄ׄㅤ𝅄🪷⃞፝͜͡⌒𝅄 ERES TAN NUB QUE CREES PODER USAR ESTE COMANDO EN UN GRUPO. Solo funciona en chat privado.`,
    admin: `𝄄ׄㅤ𝅄🍓⃞፝͜͡⌒𝅄 Esto lo puede usar un administrador. Que te crees..?`,
    botAdmin: `𝄄ׄㅤ𝅄💮⃞፝͜͡⌒𝅄 Este comando sólo puede ser ejecutado si soy administradora del grupo.`,
    restrict: `𝄄ׄㅤ𝅄🫐⃞፝͜͡⌒𝅄 Este comando solo puede ser usado por mi Owner. ¿Quién te crees?`
  }[type]

  if (msg) return conn.reply(m.chat, msg, m).then(_ => m.react("🛑"))
}

// ----- WATCH FILE -----
const file = fileURLToPath(import.meta.url)
watchFile(file, () => {
  unwatchFile(file)
  console.log(chalk.magenta("Se actualizó 'handler.js'"))
})