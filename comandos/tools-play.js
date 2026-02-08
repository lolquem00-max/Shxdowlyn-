import fetch from 'node-fetch';

let handler = async (m, { conn, text }) => {
  try {
    if (!text) {
      return m.reply(`🌸 *🎧 M U S I C  P L A Y E R* 🌸

╔══════════════════════╗
      📥 *DESCARGAR MÚSICA*
╚══════════════════════╝

✨ *Uso:* #play <nombre>
🎶 *Ejemplo:* #play Taylor Swift
🎵 *Ejemplo:* #play Bad Bunny

━━━━━━━━━━━━━━━━━━━━━━
      🤖 *${conn.getName(conn.user.jid)}*
━━━━━━━━━━━━━━━━━━━━━━`);
    }

    await m.reply(`🔍 *Buscando en YouTube...*\n\n` +
                 `🎵 *Consulta:* ${text}\n` +
                 `⏳ *Espera un momento...*`);

    const searchQuery = encodeURIComponent(text);
    const searchUrl = `https://nexevo.onrender.com/search/youtube?q=${searchQuery}`;
    
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();

    if (!searchData.status || !searchData.result || searchData.result.length === 0) {
      return m.reply(`❌ *No se encontraron resultados*\n\n` +
                    `🔍 *Búsqueda:* ${text}\n` +
                    `💡 *Intenta con otro nombre o artista*`);
    }

    const results = searchData.result.slice(0, 5);

    let listText = `🎧 *Resultados encontrados:*\n\n`;
    results.forEach((item, index) => {
      listText += `*${index + 1}.* ${item.title}\n`;
      listText += `   ⏱️ ${item.duration} | 📺 ${item.channel}\n\n`;
    });
    listText += `━━━━━━━━━━━━━━━━━━━━━━\n` +
               `📝 *Responde con el número (1-${results.length})*`;

    await conn.sendMessage(m.chat, { 
      text: listText,
      contextInfo: {
        externalAdReply: {
          title: '🎵 Descargar Música',
          body: 'Selecciona una opción',
          thumbnailUrl: results[0].imageUrl,
          sourceUrl: results[0].link,
          mediaType: 1,
          renderLargerThumbnail: true
        }
      }
    });

    conn.playSession = conn.playSession || {};
    const sessionId = m.sender + m.chat;
    conn.playSession[sessionId] = {
      results,
      timestamp: Date.now()
    };

    setTimeout(() => {
      if (conn.playSession[sessionId]) {
        delete conn.playSession[sessionId];
      }
    }, 30000);

  } catch (error) {
    console.error(error);
    await m.reply(`⚠️ *Error*\n\n${error.message}`);
  }
};

handler.before = async (m, { conn }) => {
  try {
    if (!m.text || !conn.playSession) return;
    
    const sessionId = m.sender + m.chat;
    const session = conn.playSession[sessionId];
    
    if (session && Date.now() - session.timestamp < 30000) {
      const choice = parseInt(m.text.trim());
      
      if (choice >= 1 && choice <= session.results.length) {
        delete conn.playSession[sessionId];
        
        const selected = session.results[choice - 1];
        
        await m.reply(`⬇️ *Descargando...*\n\n` +
                     `🎵 *Título:* ${selected.title}\n` +
                     `⏱️ *Duración:* ${selected.duration}\n` +
                     `📺 *Canal:* ${selected.channel}\n\n` +
                     `⏳ *Espere un momento...*`);

        const videoUrl = encodeURIComponent(selected.link);
        const downloadUrl = `https://nexevo.onrender.com/download/y?url=${videoUrl}`;
        
        const downloadResponse = await fetch(downloadUrl);
        const downloadData = await downloadResponse.json();

        if (!downloadData.status || !downloadData.result || !downloadData.result.url) {
          return m.reply('❌ *Error al descargar el audio*');
        }

        const audioInfo = downloadData.result.info;
        const audioUrl = downloadData.result.url;

        await conn.sendMessage(m.chat, {
          audio: { url: audioUrl },
          mimetype: 'audio/mpeg',
          fileName: `${selected.title.slice(0, 50)}.mp3`,
          contextInfo: {
            externalAdReply: {
              title: '🎵 ' + (selected.title.length > 25 ? selected.title.slice(0, 25) + '...' : selected.title),
              body: selected.channel,
              thumbnailUrl: audioInfo.thumbnail || selected.imageUrl,
              sourceUrl: selected.link,
              mediaType: 1,
              renderLargerThumbnail: false
            }
          }
        });
        
        return true;
      }
    }
  } catch (error) {
    console.error('Error en before:', error);
  }
};

handler.help = ['play <búsqueda>'];
handler.tags = ['music'];
handler.command = ['play', 'music'];

export default handler;