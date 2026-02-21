import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } from "@whiskeysockets/baileys"
import { handler } from "./manejador.js"  // tu manejador

const startBot = async () => {
  // 📂 Carpeta para guardar la sesión
  const { state, saveCreds } = await useMultiFileAuthState('./sessions')

  // 🔍 Obtener la versión más reciente de WhatsApp Web
  const { version } = await fetchLatestBaileysVersion()

  // ⚡ Conectar al socket de WhatsApp
  const conn = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    version
  })

  // 💾 Guardar credenciales automáticamente
  conn.ev.on('creds.update', saveCreds)

  // 🔄 Estado de la conexión
  conn.ev.on('connection.update', (update) => {
    if (update.connection === 'open') console.log('✅ Conectado a WhatsApp')
    if (update.connection === 'close') console.log('❌ Conexión cerrada, reinicia el bot')
  })

  // 📨 Cada mensaje entrante pasa por tu manejador
  conn.ev.on('messages.upsert', async (chatUpdate) => {
    try {
      // “call” para usar this como la conexión
      await handler.call(conn, chatUpdate)
    } catch (e) {
      console.error('Error en handler:', e)
    }
  })

  console.log('🤖 Bot iniciado y escuchando mensajes...')
}

startBot()