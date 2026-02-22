import { readdirSync, existsSync, readFileSync, watch } from 'fs'
import { join, resolve } from 'path'
import { format } from 'util'
import syntaxerror from 'syntax-error'
import importFile from './import.js'
import chalk from 'chalk'

const comandosFolder = resolve('./comandos')
const comandosFilter = filename => /\.(mc)?js$/.test(filename)

let watcher = {}
let comandos = {}
let comandosFolders = []

async function filesInit(conn) {
  const folder = comandosFolder

  if (folder in watcher) {
    console.log(chalk.yellow(`⚠️ Ya se está observando la carpeta: ${folder}`))
    return comandos
  }

  comandosFolders.push(folder)

  console.log(chalk.cyan(`📂 Iniciando carga de comandos desde: ${folder}`))

  const files = readdirSync(folder).filter(comandosFilter)

  if (!files.length) {
    console.log(chalk.red(`⚠️ No se encontraron comandos en ${folder}`))
  }

  for (const filename of files) {
    try {
      const filePath = join(folder, filename)
      const module = await importFile(filePath)

      if (module) {
        comandos[filename] = module.default || module
        console.log(chalk.green(`✅ Comando cargado: ${filename}`))
      }

    } catch (e) {
      console.log(chalk.red(`❌ Error cargando comando: ${filename}`))
      console.error(e)
      delete comandos[filename]
    }
  }

  console.log(
    chalk.magenta(`🚀 Total comandos cargados: ${Object.keys(comandos).length}`)
  )

  const watching = watch(folder, (event, filename) => {
    reload(conn, event, filename)
  })

  watcher[folder] = watching

  console.log(chalk.blue(`👀 Watcher activo para cambios en comandos`))

  return comandos
}

function deletecomandosFolder(folder, isAlreadyClosed = false) {
  const resolved = resolve(folder)

  if (!(resolved in watcher)) return

  if (!isAlreadyClosed) watcher[resolved].close()

  delete watcher[resolved]

  comandosFolders = comandosFolders.filter(f => f !== resolved)

  console.log(chalk.yellow(`🛑 Watcher detenido para: ${resolved}`))
}

async function reload(conn, _event, filename) {
  if (!filename) return
  if (!comandosFilter(filename)) return

  const filePath = join(comandosFolder, filename)

  console.log(chalk.cyan(`🔄 Cambio detectado en: ${filename}`))

  if (!existsSync(filePath)) {
    console.log(chalk.yellow(`🗑 Comando eliminado: ${filename}`))
    delete comandos[filename]
    return
  }

  const err = syntaxerror(readFileSync(filePath), filename, {
    sourceType: 'module',
    allowAwaitOutsideFunction: true
  })

  if (err) {
    console.log(chalk.red(`❌ Error de sintaxis en: ${filename}`))
    console.error(format(err))
    return
  }

  try {
    const module = await importFile(filePath)
    comandos[filename] = module.default || module

    console.log(chalk.green(`♻️ Comando recargado correctamente: ${filename}`))

  } catch (e) {
    console.log(chalk.red(`❌ Error recargando comando: ${filename}`))
    console.error(e)
  }

  comandos = Object.fromEntries(
    Object.entries(comandos).sort(([a], [b]) => a.localeCompare(b))
  )

  console.log(
    chalk.magenta(`📦 Total comandos activos: ${Object.keys(comandos).length}`)
  )
}

export {
  comandosFolder,
  comandosFilter,
  comandos,
  watcher,
  comandosFolders,
  filesInit,
  deletecomandosFolder,
  reload
}