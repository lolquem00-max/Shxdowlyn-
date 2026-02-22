import { readFileSync, writeFileSync, existsSync } from 'fs'

const { initAuthCreds, BufferJSON, proto } = (await import('@whiskeysockets/baileys')).default

function bind(conn) {
    if (!conn.chats) conn.chats = {}

    function updateNameToDb(contacts) {
        if (!contacts) return
        try {
            contacts = contacts.contacts || contacts
            for (const contact of contacts) {
                const id = conn.decodeJid(contact.id)
                if (!id || id === 'status@broadcast') continue

                let chats = conn.chats[id]
                if (!chats) chats = conn.chats[id] = { ...contact, id }

                conn.chats[id] = {
                    ...chats,
                    ...contact,
                    id,
                    ...(id.endsWith('@g.us')
                        ? { subject: contact.subject || contact.name || chats.subject || '' }
                        : { name: contact.notify || contact.name || chats.name || chats.notify || '' })
                }
            }
        } catch (e) {
            console.error('Error updating contacts:', e)
        }
    }

    conn.ev.on('contacts.upsert', updateNameToDb)
    conn.ev.on('groups.update', updateNameToDb)
    conn.ev.on('contacts.set', updateNameToDb)

    conn.ev.on('chats.set', async ({ chats }) => {
        try {
            for (let { id, name, readOnly } of chats) {
                id = conn.decodeJid(id)
                if (!id || id === 'status@broadcast') continue

                const isGroup = id.endsWith('@g.us')
                let chat = conn.chats[id]
                if (!chat) chat = conn.chats[id] = { id }

                chat.isChats = !readOnly
                if (name) chat[isGroup ? 'subject' : 'name'] = name

                if (isGroup) {
                    const metadata = await conn.groupMetadata(id).catch(() => null)
                    if (metadata) {
                        chat.subject = name || metadata.subject
                        chat.metadata = metadata
                    }
                }
            }
        } catch (e) {
            console.error('Error in chats.set:', e)
        }
    })

    conn.ev.on('group-participants.update', async ({ id }) => {
        try {
            if (!id) return
            id = conn.decodeJid(id)
            if (id === 'status@broadcast') return

            if (!(id in conn.chats)) conn.chats[id] = { id }

            const metadata = await conn.groupMetadata(id).catch(() => null)
            if (!metadata) return

            conn.chats[id].isChats = true
            conn.chats[id].subject = metadata.subject
            conn.chats[id].metadata = metadata
        } catch (e) {
            console.error('Error updating participants:', e)
        }
    })
}

const KEY_MAP = {
    'pre-key': 'preKeys',
    'session': 'sessions',
    'sender-key': 'senderKeys',
    'app-state-sync-key': 'appStateSyncKeys',
    'app-state-sync-version': 'appStateVersions',
    'sender-key-memory': 'senderKeyMemory'
}

function useSingleFileAuthState(filename, logger) {
    let creds
    let keys = {}
    let saveCount = 0

    function safeWrite(data) {
        try {
            writeFileSync(
                filename,
                JSON.stringify(data, BufferJSON.replacer, 2)
            )
        } catch (err) {
            console.error('Error writing auth file:', err)
        }
    }

    const saveState = (forceSave = false) => {
        try {
            logger?.trace?.('saving auth state')
            saveCount++
            if (forceSave || saveCount > 5) {
                safeWrite({ creds, keys })
                saveCount = 0
            }
        } catch (err) {
            console.error('Error during saveState:', err)
        }
    }

    // --------- LECTURA SEGURA DEL JSON ----------
    if (existsSync(filename)) {
        try {
            const raw = readFileSync(filename, { encoding: 'utf-8' })

            if (!raw || raw.trim() === '') {
                throw new Error('Auth file vacío')
            }

            const result = JSON.parse(raw, BufferJSON.reviver)

            if (!result?.creds || !result?.keys) {
                throw new Error('Auth file inválido')
            }

            creds = result.creds
            keys = result.keys

        } catch (err) {
            console.error('Auth JSON corrupto. Regenerando credenciales...', err)

            creds = initAuthCreds()
            keys = {}

            safeWrite({ creds, keys })
        }
    } else {
        creds = initAuthCreds()
        keys = {}
        safeWrite({ creds, keys })
    }
    // --------------------------------------------

    return {
        state: {
            creds,
            keys: {
                get: (type, ids) => {
                    const key = KEY_MAP[type]
                    return ids.reduce((dict, id) => {
                        let value = keys[key]?.[id]

                        if (value) {
                            if (type === 'app-state-sync-key') {
                                value = proto.AppStateSyncKeyData.fromObject(value)
                            }
                            dict[id] = value
                        }

                        return dict
                    }, {})
                },
                set: (data) => {
                    try {
                        for (const _key in data) {
                            const key = KEY_MAP[_key]
                            keys[key] = keys[key] || {}
                            Object.assign(keys[key], data[_key])
                        }
                        saveState()
                    } catch (err) {
                        console.error('Error setting keys:', err)
                    }
                }
            }
        },
        saveState
    }
}

export default {
    bind,
    useSingleFileAuthState
}