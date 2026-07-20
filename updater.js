const { style, key } = require('bare-tui')
const spinner = require('bare-tui').spinner
const theme = require('./theme')

let nextId = 1

class Updater {
  constructor(opts = {}) {
    this.id = nextId++
    this.tag = 0
    this.width = opts.width || 60
    this.themeOverrides = theme.merge(opts.theme)
    this.onAccept = opts.onAccept || null
    this.autoDismissMs = opts.autoDismissMs ?? 0
    this.acceptKey = opts.acceptKey || 'u'
    this.focused = opts.focused !== false
    this.mode = opts.mode || 'confirm'
    this.showProgress = opts.showProgress !== false
    this.dismissible = opts.dismissible !== false
    this.copy = { ...defaultCopy, ...(opts.copy || {}) }

    this.state = 'idle'
    this.version = null
    this.error = null
    this.progressCount = 0
    this.progressBytesAdded = 0
    this.spinner = spinner.create({ fps: 8 })

    if (this.mode === 'silent' && this.onAccept) {
      this._applyTimer = null
    }
  }

  focus() {
    this.focused = true
    return this
  }

  blur() {
    this.focused = false
    return this
  }

  visible() {
    return this.state !== 'idle'
  }

  update(msg) {
    if (!msg) return [this, null]

    switch (msg.type) {
      case 'update.downloading':
        if (this.state === 'applied' || this.state === 'applying') return [this, null]
        this.state = 'downloading'
        this.progressCount = 0
        this.progressBytesAdded = 0
        this.tag++
        return [this, this.spinner.init()]

      case 'update.progress':
        if (this.state !== 'downloading') return [this, null]
        if (msg.delta) {
          this.progressCount++
          if (msg.delta.bytesAdded) this.progressBytesAdded += msg.delta.bytesAdded
        }
        return [this, null]

      case 'update.ready':
        if (this.state === 'applied' || this.state === 'applying') return [this, null]
        this.state = 'ready'
        this.version = msg.version || this.version
        this.tag++
        if (this.mode === 'silent' && this.onAccept) {
          return [this, this._acceptCmd()]
        }
        return [this, this._autoDismissCmd()]

      case 'update.apply':
        if (this.state !== 'ready') return [this, null]
        this.state = 'applying'
        this.tag++
        return [this, this._acceptCmd()]

      case 'update.applied':
        if (msg.runId !== this.runId) return [this, null]
        this.state = 'applied'
        return [this, this._autoDismissCmd()]

      case 'update.error':
        if (this.state === 'applied') return [this, null]
        this.state = 'error'
        this.error = msg.error
        this.tag++
        return [this, this._autoDismissCmd()]

      case 'update.dismiss':
        if (!this.dismissible) return [this, null]
        this.state = 'idle'
        this.tag++
        return [this, null]

      case 'update.hide':
        if (msg.id === this.id && msg.tag === this.tag) this.state = 'idle'
        return [this, null]

      case 'spinner.tick': {
        if (this.state !== 'downloading' && this.state !== 'applying') return [this, null]
        const [s, cmd] = this.spinner.update(msg)
        this.spinner = s
        return [this, cmd]
      }

      case 'key':
        return this._onKey(msg)

      default:
        return [this, null]
    }
  }

  _onKey(msg) {
    if (!this.focused) return [this, null]

    // Check if msg is a KeyMsg-like object or check the chord directly
    const matches = (chord) => {
      if (typeof msg.is === 'function') return msg.is(chord)
      if (msg.chord === chord) return true
      return false
    }

    if (this.state === 'ready' && (matches(this.acceptKey) || matches('enter'))) {
      this.state = 'applying'
      this.tag++
      return [this, this._acceptCmd()]
    }

    if (
      this.dismissible &&
      (this.state === 'ready' || this.state === 'applied' || this.state === 'error') &&
      matches('esc')
    ) {
      this.state = 'idle'
      this.tag++
      return [this, null]
    }

    return [this, null]
  }

  _acceptCmd() {
    if (!this.onAccept) {
      return () => ({ type: 'update.apply' })
    }

    const runId = (this.runId = {})
    return () =>
      Promise.resolve(this.onAccept())
        .then(() => ({ type: 'update.applied', runId }))
        .catch((error) => ({ type: 'update.error', error, runId }))
  }

  _autoDismissCmd() {
    if (!this.autoDismissMs) return null
    const id = this.id
    const tag = ++this.tag
    const ms = this.autoDismissMs
    return () =>
      new Promise((resolve) => setTimeout(() => resolve({ type: 'update.hide', id, tag }), ms))
  }

  view() {
    const t = this.themeOverrides
    let text

    switch (this.state) {
      case 'idle':
      case 'disabled':
        return ''

      case 'downloading':
        text =
          (this.showProgress ? t.accent(this.spinner.view()) + ' ' : '') +
          'Downloading update' +
          (this.progressCount > 0
            ? ` (${this.progressCount} file${this.progressCount === 1 ? '' : 's'})`
            : '…')
        break

      case 'ready':
        text =
          t.success('✓') +
          ' Update' +
          (this.version ? ` v${this.version}` : '') +
          ' ready — ' +
          t.hint(`press ${this.acceptKey} to update, esc to dismiss`)
        break

      case 'applying':
        text =
          t.accent(this.spinner.view()) +
          ' Applying update' +
          (this.version ? ` v${this.version}` : '') +
          '…'
        break

      case 'applied':
        text =
          t.success('✓') +
          ' Updated' +
          (this.version ? ` to v${this.version}` : '') +
          ' — restart to use it'
        break

      case 'error':
        text =
          t.error('✗') +
          ' Update failed' +
          (this.error?.message ? `: ${this.error.message}` : this.error ? `: ${this.error}` : '')
        break

      default:
        return ''
    }

    return style()
      .border(t.border)
      .borderForeground('cyan')
      .padding(0, 1)
      .width(Math.max(20, this.width))
      .render(style.truncate(text, Math.max(20, this.width - 4)))
  }
}

const defaultCopy = {
  checking: 'Checking for updates…',
  downloading: 'Downloading update',
  ready: 'Update ready',
  applying: 'Applying update',
  applied: 'Updated',
  error: 'Update failed'
}

function create(opts) {
  return new Updater(opts)
}

module.exports = { create, Updater, defaultCopy }
