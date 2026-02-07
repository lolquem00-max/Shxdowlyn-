// sockets/print.js
// Utilidades para imprimir eventos relacionados con sub-sockets en consola
// Formato en caja acorde a lo solicitado

function boxify(lines) {
  const top = '╔✿︎' + '═'.repeat(8) + '𑁍' + '═'.repeat(8) + '✿︎╗'
  const bottom = '╚✿︎' + '═'.repeat(8) + '𑁍' + '═'.repeat(8) + '✿︎╝'
  const body = lines.map(l => `║${l}`).join('\n')
  return `${top}\n${body}\n${bottom}`
}

export function printCommandEvent({ message = '', connection = 'Pendiente', type = 'SubBot' } = {}) {
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

export function printSessionEvent({ action = 'Session creada en', number = 'unknown' } = {}) {
  const lines = [
    `${action}`,
    `(${number})`
  ]
  console.log(boxify(lines))
}

// Funciones auxiliares para casos específicos (conveniencia)
export function printSessionCreated(number) {
  printSessionEvent({ action: 'Session creada en', number })
}

export function printSessionClosed(number) {
  printSessionEvent({ action: 'Session cerrada en', number })
}

export function printSessionRestarted(number) {
  printSessionEvent({ action: 'Session reiniciada en', number })
}

export function printBotEdited(number) {
  printSessionEvent({ action: 'Bot editado en', number })
}