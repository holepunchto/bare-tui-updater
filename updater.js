const { style } = require('bare-tui')
const spinner = require('bare-tui').spinner
const theme = require('./theme')

let nextId = 1

const POSITIONS = ['top', 'bottom']
const ALIGNMENTS = ['left', 'center', 'right']

// `border: true` → theme border, `false`/`'none'` → borderless single line,
// a name from style.borders, or a raw border-chars object.
function resolveBorder(opt, fallback) {
  if (opt === undefined || opt === true) return fallback
  if (opt === false || opt === 'none') return null
  if (typeof opt === 'string') {
    if (!style.borders[opt]) {
      throw new Error(
        `bare-tui-updater: unknown border '${opt}' (expected one of ${Object.keys(style.borders).join(', ')}, true, false)`
      )
    }
    return style.borders[opt]
  }
  if (typeof opt === 'object') return opt
  throw new Error(`bare-tui-updater: invalid border option: ${opt}`)
}

// Borderless banners default to hugging their text so they can be aligned
// against the host layout; boxed banners get a stable frame wide enough for the
// longest default message (the `ready` line, 59 cells + border and padding).
function resolveWidth(opt, border) {
  if (opt === undefined) return border ? 64 : 0
  if (opt === 'auto' || opt === 0) return 0
  if (typeof opt !== 'number' || opt < 0) {
    throw new Error(`bare-tui-updater: invalid width option: ${opt}`)
  }
  return opt
}

function oneOf(value, allowed, fallback, name) {
  if (value === undefined || value === null) return fallback
  if (!allowed.includes(value)) {
    throw new Error(
      `bare-tui-updater: invalid ${name} '${value}' (expected one of ${allowed.join(', ')})`
    )
  }
  return value
}

class Updater {
  constructor(opts = {}) {
    this.id = nextId++
    this.tag = 0
    this.themeOverrides = theme.merge(opts.theme)
    this.border = resolveBorder(opts.border, this.themeOverrides.border)
    this.width = resolveWidth(opts.width, this.border)
    this.position = oneOf(opts.position, POSITIONS, 'bottom', 'position')
    this.align = oneOf(opts.align, ALIGNMENTS, 'left', 'align')
    this.containerWidth = opts.containerWidth || 0
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

  // Rows this widget will occupy right now: 0 when idle, 1 borderless, 3 boxed.
  // Hosts that budget layout space (fixed-height panels) can subtract this.
  height() {
    if (!this._text()) return 0
    return this.border ? 3 : 1
  }

  // Stack the host's blocks with the banner placed per `position`, dropping the
  // banner entirely when idle so it costs zero rows. When `containerWidth` is
  // unset, the widest host block defines the box the banner aligns within.
  layout(...blocks) {
    const parts = blocks.filter(Boolean).map(String)
    const text = this._text()
    if (!text) return style.joinVertical(style.position.left, ...parts)

    const container = this.containerWidth || Math.max(0, ...parts.map((p) => style.width(p)))
    const banner = this._align(this._box(text), container)
    const all = this.position === 'top' ? [banner, ...parts] : [...parts, banner]
    return style.joinVertical(style.position.left, ...all)
  }

  view() {
    const text = this._text()
    if (!text) return ''
    return this._align(this._box(text), this.containerWidth)
  }

  // Shift a rendered banner within `containerWidth` cells. Left-aligned (or an
  // unknown container) needs no padding, so the block is returned untouched.
  _align(block, containerWidth) {
    if (this.align === 'left' || !containerWidth) return block
    const extra = containerWidth - style.width(block)
    if (extra <= 0) return block
    const pad = ' '.repeat(this.align === 'right' ? extra : Math.floor(extra / 2))
    return block
      .split('\n')
      .map((line) => pad + line)
      .join('\n')
  }

  _box(text) {
    if (!this.border) {
      return this.width ? style.truncate(text, this.width) : text
    }

    // Outer width = inner + 2 padding + 2 border, so subtract 4 from the target.
    const inner = Math.max(16, (this.width || style.width(text) + 4) - 4)
    return style()
      .border(this.border)
      .borderForeground(this.themeOverrides.borderForeground)
      .padding(0, 1)
      .width(inner)
      .render(style.truncate(text, inner))
  }

  _text() {
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

    return text
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
