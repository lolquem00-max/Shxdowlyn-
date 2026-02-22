import { resolve, dirname } from 'path'
import _fs, { existsSync, readFileSync } from 'fs'
const { promises: fs } = _fs

class db {
    constructor(filepath, ...args) {
        this.file = resolve(filepath)
        this.logger = console

        this._jsonargs = args
        this._state = false
        this._queue = []
        this._data = {}

        this._load()

        this._interval = setInterval(async () => {
            if (!this._state && this._queue.length) {
                this._state = true
                const task = this._queue.shift()
                try {
                    await this[task]()
                } catch (e) {
                    this.logger.error('DB task error:', e)
                }
                this._state = false
            }
        }, 1000)
    }

    get data() {
        return this._data
    }

    set data(value) {
        this._data = value || {}
        this.save()
    }

    load() {
        this._queue.push('_load')
    }

    save() {
        this._queue.push('_save')
    }

    _load() {
        try {
            if (!existsSync(this.file)) {
                this._data = {}
                return this._data
            }

            const raw = readFileSync(this.file, 'utf-8')

            if (!raw || raw.trim() === '') {
                throw new Error('Database vacío')
            }

            this._data = JSON.parse(raw)
            return this._data

        } catch (e) {
            this.logger.error('Database corrupto. Reiniciando...', e)
            this._data = {}
            this._rewrite()
            return this._data
        }
    }

    async _save() {
        try {
            const dir = dirname(this.file)
            if (!existsSync(dir)) {
                await fs.mkdir(dir, { recursive: true })
            }

            await fs.writeFile(
                this.file,
                JSON.stringify(this._data || {}, ...this._jsonargs)
            )

            return this.file
        } catch (e) {
            this.logger.error('Error guardando database:', e)
        }
    }

    async _rewrite() {
        try {
            await fs.writeFile(
                this.file,
                JSON.stringify({}, ...this._jsonargs)
            )
        } catch (e) {
            this.logger.error('Error reescribiendo database:', e)
        }
    }
}

export default db