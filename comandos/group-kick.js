let handler = async (m, { conn, text, participants, isAdmin, isOwner }) => {
  try {
    if (!text && !m.quoted) {
      return m.reply('*Ejemplo:* #kick @usuario');
    }

    let target = '';
    
    if (m.quoted) {
      target = m.quoted.sender;
    } else if (m.mentionedJid && m.mentionedJid[0]) {
      target = m.mentionedJid[0];
    } else if (text.includes('@')) {
      target = text.replace('@', '') + '@s.whatsapp.net';
    }

    if (!target) {
      return m.reply('❌ Usuario no encontrado');
    }

    if (target === conn.user.jid) {
      return m.reply('😅 No puedo expulsarme');
    }

    if (target === m.sender) {
      return m.reply('🤔 No puedes expulsarte');
    }

    const groupMetadata = await conn.groupMetadata(m.chat);
    const isGroupAdmin = groupMetadata.participants.find(p => p.id === m.sender)?.admin;
    const isTargetAdmin = groupMetadata.participants.find(p => p.id === target)?.admin;

    if (!isGroupAdmin && !isOwner) {
      return m.reply('🚫 Solo administradores');
    }

    if (isTargetAdmin && !isOwner) {
      return m.reply('⚠️ No puedes expulsar a otro admin');
    }

    const targetName = conn.getName(target) || 'Usuario';
    
    await conn.sendMessage(m.chat, {
      text: `⚠️ Expulsando a @${target.split('@')[0]}...`,
      mentions: [target]
    });

    await conn.groupParticipantsUpdate(m.chat, [target], 'remove');

    await conn.sendMessage(m.chat, {
      text: `✅ @${target.split('@')[0]} expulsado`,
      mentions: [target]
    });

  } catch (error) {
    console.error(error);
    await m.reply(`❌ Error: ${error.message}`);
  }
};

handler.help = ['kick @usuario'];
handler.tags = ['group'];
handler.command = ['kick', 'expulsar', 'sacar'];
handler.group = true;
handler.admin = true;
handler.botAdmin = true;

export default handler;