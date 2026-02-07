import fetch from 'node-fetch'

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) {
        return conn.reply(m.chat, `💔 *Ella no te quiere y por eso te ignora...*\n\n📌 Ejemplo: ${usedPrefix + command} memes`, m)
    }
    
    await conn.reply(m.chat, '💘 *Buscando... mientras ella te bloquea*', m)
    
    try {
        const apiUrl = `https://nexevo-api.vercel.app/search/pinterest?q=${encodeURIComponent(text)}`
        
        let res = await fetch(apiUrl)
        let data = await res.json()
        
        if (!data.status || !data.result || data.result.length === 0) {
            await conn.reply(m.chat, '😔 *No encontré nada... como ella no te encontró a ti*', m)
            return
        }
        
        let images = data.result.slice(0, 5)
        
        for (let i = 0; i < images.length; i++) {
            let img = images[i]
            
            if (img.image_large_url) {
                await conn.sendFile(m.chat, img.image_large_url, '', '', m)
                
                if (i < images.length - 1) {
                    await new Promise(r => setTimeout(r, 2000))
                }
            }
        }
        
        await conn.reply(m.chat, '💔 *Ella no te quiere...*\n😤 *Siempre serás patético por eso ella te dejó*', m)
        
    } catch (e) {
        await conn.reply(m.chat, '💔 *Error... como tu relación con ella*', m)
    }
}

handler.help = ['pinterest']
handler.tags = ['search']
handler.command = ['pinterest', 'pins', 'pin']
handler.register = true

export default handler