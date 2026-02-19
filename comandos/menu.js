import moment from "moment-timezone";
import fetch from "node-fetch";
const { prepareWAMessageMedia, generateWAMessageFromContent } = (await import("@whiskeysockets/baileys")).default;

let handler = async (m, { conn, usedPrefix }) => {
  try {
    const now = moment().tz("America/Tegucigalpa");
    const timeStr = now.format("HH:mm:ss");
    const tagUser = '@' + m.sender.split('@')[0];
    const videoUrl = "https://files.catbox.moe/1joj6p.mp4";

    // Preparar video
    const mediaMessage = await prepareWAMessageMedia(
      { video: { url: videoUrl }, gifPlayback: true },
      { upload: conn.waUploadToServer }
    );

    // Texto del menú
    const txt = `
ㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤ
橫㈵𓂂ㅤㅤ𓐮𝖲ۣؗ𝖧ۤ𝖷ؗ𝖣ۣ𝖮ؗ𝖶ㅤㅤ▞ㅤㅤ𓆭𓆭₂₈₎
◯◯▸ㅤㅤ⎯⎯▬𝖫ؗ𝖸ۣۤ𝖭ㅤㅤ🐚ㅤㅤ ▓█

⟍𝄄𝄄𝄄𝄄𝄄₂₈₎ㅤㅤ 🐢ㅤㅤ#𝖼𝗋𝖾𝖺𝗍𝗈𝗋ㅤㅤ⬤⬤⏋
> ㅤㅤㅤㅤ﹫𝗌𝗁𝗑𝖽𝗈𝗐𝗅𝗒𝗇ㅤㅤ𔘓

ㅤ  𝗐𝖾𝗅𝖼𝗈𝗆𝖾ㅤ𝗌𝗈𝗒ㅤ𝗌⵿𝗁͟𝗑᤻͟𝖽᤻͟𝗈⵿𝗐ㅤ𝗅𝖺ㅤ
ㅤ     𝗌𝗈𝗇𝗋𝗂𝗌𝖺ㅤ𝗁𝖾𝖼𝗁𝖺ㅤ𝖼͟𝗈᤻͟𝖽⵿𝗂𝗀᤻͟𝗈

ㅤ   𝖺ㅤ𝖼𝗈𝗇𝗍𝗂𝗇𝗎𝖺𝖼𝗂𝗈𝗇ㅤ𝗅𝖾ㅤ𝗆𝗎𝖾𝗌
ㅤㅤ   -𝗍𝗋𝗈ㅤ𝗆𝗂𝗌ㅤ𝖼⵿𝗈͟𝗆᤻͟𝖺᤻͟𝗇᤻͟𝖽᤻͟𝗈⵿𝗌

＿＿／ ㅤㅤ ◢𝖺𝖽𝗆𝗂𝗇𝗂𝗌𝗍𝗋. ㅤㅤ  攤䥵𓌙

𓊋㈵➧ㅤㅤ🔘ㅤㅤ〉〉ㅤ.𝗆𝖾𝗇𝗎/help
𓊋㈵➧ㅤㅤ🔘ㅤㅤ〉〉ㅤ.𝗉𝗋𝗈𝗆𝗈𝗋𝖾/.𝖽𝖾𝗆𝗈𝗍𝖾 @
𓊋㈵➧ㅤㅤ🔘ㅤㅤ〉〉ㅤ.𝗀𝗉 / 𝗀𝗋𝗎𝗉𝗈 ( on/off )
𓊋㈵➧ㅤㅤ🔘ㅤㅤ〉〉ㅤ.𝗐𝖾𝗅𝖼𝗈𝗆𝖾 ( on / off ) 
𓊋㈵➧ㅤㅤ🔘ㅤㅤ〉〉ㅤ.𝗍𝖺𝗀
𓊋㈵➧ㅤㅤ🔘ㅤㅤ〉〉ㅤ.𝗄𝗂𝖼𝗄 @

＿＿／ ㅤ ㅤ ◢𝗋𝖺𝗆𝖽𝗈𝗆 ㅤ ㅤ  攤䥵𓌙

𓊋㈵➧ㅤㅤ🔘ㅤㅤ〉〉ㅤ.𝗉𝗅𝖺𝗒
𓊋㈵➧ㅤㅤ🔘ㅤㅤ〉〉ㅤ.𝗀𝖺𝗆𝖾

> ㅤㅤㅤㅤ@proximoㅤㅤ𔘓

▙▅▚ ㅤ ⇲𝖢𝖧𝖠𝖭𝖭𝖤𝖫ㅤ⦙⦙⦙◗ ㅤ 𓂧⁸⁶

ㅤㅤ𝖼𝗋𝖾𝖺𝗍𝗈𝗋/decoㅤㅤ𔘓ㅤㅤ𝗌𝗁𝖾𝗋𝗒𝗅

> © 2026 creado por Jade.

━━━━━━━━━━━━━━━━━━━━━━
🕒 Hora: ${timeStr}
👤 Usuario: ${tagUser}
`;

const msg = {
  body: { text: txt },
  footer: { text: "SHXDOWLYN" },
  nativeFlowMessage: {
    buttons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "Shxdowlyn Interface",
          sections: [
            {
              title: "Shxdowlyn Garden",
              highlight_label: "ELITE",
              rows: [
                { title: "Menú Completo", description: "Ver todos los comandos", id: `${usedPrefix}allmenu` },
                { title: "Estado del Sistema", description: "Velocidad y rendimiento", id: `${usedPrefix}ping` },
                { title: "Fundador", description: "Contacto del creador", id: `${usedPrefix}owner` }
              ]
            }
          ]
        })
      },
      {
        name: "cta_copy",
        buttonParamsJson: JSON.stringify({
          display_text: "Copiar Identidad",
          id: "shxdowlyn_core",
          copy_code: "I AM HAPPY"
        })
      },
      {
        name: "cta_url",
        buttonParamsJson: JSON.stringify({
          display_text: "Canal Oficial",
          url: "https://whatsapp.com/channel/0029VbBx9210gcfSqAtvxf1t"
        })
      }
    ],
    messageParamsJson: JSON.stringify({
      limited_time_offer: {
        text: "Shadow Menu List",
        url: "https://whatsapp.com/channel/0029VbBx9210gcfSqAtvxf1t",
        copy_code: "SHADOW-BOT-MD",
        expiration_time: 1754613436864329
      },
      bottom_sheet: {
        in_thread_buttons_limit: 2,
        divider_indices: [1, 2],
        list_title: "Shxdowlyn Interface",
        button_title: "On Menu shxdowlyn"
      },
      tap_target_configuration: {
        title: "▸ SHXDOWLYN ◂",
        description: "Menú Principal",
        canonical_url: "https://whatsapp.com/channel/0029VbBx9210gcfSqAtvxf1t",
        domain: "https://whatsapp.com",
        button_index: 0
      }
    })
  },
  contextInfo: {
    mentionedJid: [m.sender],
    isForwarded: true,
    forwardingScore: 999999
  }
};

await conn.relayMessage(m.chat, msg, {});