// sockets/print.js
export function boxify(lines) {
  const top = '╔✿︎' + '═'.repeat(8) + '𑁍' + '═'.repeat(8) + '✿︎╗'
  const bottom = '╚✿︎' + '═'.repeat(8) + '𑁍' + '═'.repeat(8) + '✿︎╝'
  const body = lines.map(l => `║${l}`).join('\n')
  return `${top}\n${body}\n${bottom}`
}

export function printCommandEvent({ message, connection = 'Pendiente', type = 'SubBot' }) {
  const lines = [
    '❁ `Mención grupal` ❁',
    '',
    '*[❀] Mensaje:*',
    '',
    `Mensaje: (${message})`,
    `Conexion: (${connection})`,
    `Tipo: ${type}`
  ]
  console.log(boxify(lines))
}

export function printSessionEvent({ action = 'Session creada en', number = 'unknown' }) {
  const lines = [
    `${action}`,
    `(${number})`
  ]
  console.log(boxify(lines))
}