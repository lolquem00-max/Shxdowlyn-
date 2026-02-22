let handler = async (m, { conn, text, isAdmin, isOwner, isBotAdmin }) => {
  try {

    if (!m.isGroup) {
      return m.reply('❌ Este comando solo funciona en grupos.');
    }

    if (!isAdmin && !isOwner) {
      return m.reply('🚫 Solo administradores pueden usar este comando.');
    }

    if (!isBotAdmin) {
      return m.reply('⚠️ Necesito ser administradora para expulsar.');
    }

    if (!text && !m.quoted) {
      return m.reply('*Ejemplo:* #kick @usuario');
    }

    let target;

    // Si responde mensaje
    if (m.quoted) {
      target = m.quoted.sender;
    }

    // Si menciona
    else if (m.mentionedJid?.length) {
      target = m.mentionedJid[0];
    }

    // Si escribe número manual
    else if (text) {
      const number = text.replace(/[^0-9]/g, '');
      if (number.length < 5) {
        return m.reply('❌ Número inválido.');
      }
      target = number + '@s.whatsapp.net';
    }

    if (!target) {
      return m.reply('❌ Usuario no encontrado.');
    }

    if (target === conn.user.jid) {
      return m.reply('😅 No puedo expulsarme.');
    }

    if (target === m.sender) {
      return m.reply('🤔 No puedes expulsarte.');
    }

    const metadata = await conn.groupMetadata(m.chat);
    const participants = metadata.participants;

    const targetData = participants.find(p => p.id === target);

    if (!targetData) {
      return m.reply('❌ El usuario no está en el grupo.');
    }

    if (targetData.admin && !isOwner) {
      return m.reply('⚠️ No puedes expulsar a otro administrador.');
    }

    await conn.sendMessage(m.chat, {
      text: `⚠️ Expulsando a @${target.split('@')[0]}...`,
      mentions: [target]
    });

    await conn.groupParticipantsUpdate(m.chat, [target], 'remove');

    await conn.sendMessage(m.chat, {
      text: `✅ @${target.split('@')[0]} expulsado correctamente.`,
      mentions: [target]
    });

  } catch (error) {
    console.error('Error en kick:', error);
    await m.reply('❌ Ocurrió un error al intentar expulsar.');
  }
};

handler.help = ['kick @usuario'];
handler.tags = ['group'];
handler.command = ['kick', 'expulsar', 'sacar'];
handler.group = true;
handler.admin = true;
handler.botAdmin = true;

export default handler;