function wire(widget, { updater, send }) {
  if (typeof updater?.on !== 'function') {
    throw new TypeError('bare-tui-updater/pear: updater must have an .on() method')
  }
  if (typeof send !== 'function') {
    throw new TypeError('bare-tui-updater/pear: send must be a function')
  }

  const onUpdating = () => send({ type: 'update.downloading' })
  const onDelta = (delta) => send({ type: 'update.progress', delta })
  const onUpdated = () => send({ type: 'update.ready', version: updater.nextVersion })
  const onError = (error) => send({ type: 'update.error', error })

  updater.on('updating', onUpdating)
  updater.on('updating-delta', onDelta)
  updater.on('updated', onUpdated)
  updater.on('error', onError)

  if (updater.updated) onUpdated()
  else if (updater.updating) onUpdating()

  return function () {
    updater.off('updating', onUpdating)
    updater.off('updating-delta', onDelta)
    updater.off('updated', onUpdated)
    updater.off('error', onError)
  }
}

module.exports = { wire }
