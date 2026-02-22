import speed from 'performance-now'

let handler = async (m, { conn }) => {
  try {
    const start = speed()
    const uptime = process.uptime()

    const end = speed()
    const latency = (end - start).toFixed(2)

    const hours = Math.floor(uptime / 3600)
    const minutes = Math.floor((uptime % 3600) / 60)
    const seconds = Math.floor(uptime % 60)

    await conn.reply(
      m.chat,
      `ⴵ Pong 🏓
⚡ Velocidad: ${latency} ms
⏳ Activo: ${hours}h ${minutes}m ${seconds}s`,
      m
    )

  } catch (err) {
    console.error('Error en ping:', err)
    await m.reply('❌ Error al medir la velocidad.')
  }
}

handler.help = ['ping']
handler.tags = ['info']
handler.command = ['ping', 'p']

export default handler
