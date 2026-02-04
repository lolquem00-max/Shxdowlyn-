import manejador.js from './manejador.js'

const WORKER_DIR = manejador.__dirname(import.meta.url, false)
    module = manejador.__filename(module)
    const module_ = await import(`${module}?id=${Date.now()}`)
    const result = module_ && 'default' in module_ ? module_.default : module_
    return result
}