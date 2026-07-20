const { EventEmitter } = require('bare-events')

function mock() {
  const emitter = new EventEmitter()

  emitter.nextVersion = null
  emitter.updated = false
  emitter.updating = false
  emitter.bundled = true

  emitter.download = async (opts = {}) => {
    if (emitter.updated) return emitter
    emitter.updating = true
    emitter.emit('updating')

    const delayMs = opts.delayMs || 1000
    const deltaCount = opts.deltaCount || 3
    const deltaDelayMs = delayMs / deltaCount

    for (let i = 0; i < deltaCount; i++) {
      await new Promise((resolve) => setTimeout(resolve, deltaDelayMs))
      emitter.emit('updating-delta', { op: 'add', bytesAdded: 1024 * 100 })
    }

    emitter.updating = false
    emitter.updated = true
    emitter.nextVersion = opts.version || '1.2.3'
    emitter.emit('updated')
    return emitter
  }

  emitter.apply = (opts = {}) => {
    if (!emitter.updated) throw new Error('No update to apply')
    if (opts.shouldFail) throw new Error('Mock applyUpdate failed')
    emitter.applied = true
    return Promise.resolve(emitter)
  }

  emitter.error = (error) => {
    emitter.updating = false
    emitter.updated = false
    emitter.emit('error', error || new Error('Mock updater error'))
    return Promise.resolve(emitter)
  }

  emitter.reset = () => {
    emitter.nextVersion = null
    emitter.updated = false
    emitter.updating = false
    emitter.applied = false
    return emitter
  }

  return emitter
}

module.exports = { mock }
