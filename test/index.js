const test = require('brittle')
const { style } = require('bare-tui')
const { create } = require('../')
const { mock } = require('../mock')

const ready = (upd) => upd.update({ type: 'update.ready', version: '1.0.0' })[0]

test('basic state transitions', (t) => {
  const upd = create({ mode: 'confirm', onAccept: () => Promise.resolve() })

  t.is(upd.state, 'idle', 'starts in idle')
  t.is(upd.view(), '', 'idle view is empty')

  let [u1] = upd.update({ type: 'update.downloading' })
  t.is(u1.state, 'downloading', 'downloading on update.downloading')
  t.not(u1.view(), '', 'downloading view is not empty')

  let [u2] = u1.update({ type: 'update.ready', version: '1.2.3' })
  t.is(u2.state, 'ready', 'ready on update.ready')
  t.ok(u2.view().includes('1.2.3'), 'view includes version')

  // Create a message that mimics KeyMsg behavior
  const uKeyMsg = {
    type: 'key',
    is: (chord) => chord === 'u',
    matches: function (...chords) {
      return chords.some((c) => this.is(c))
    }
  }
  let [u3] = u2.update(uKeyMsg)
  t.is(u3.state, 'applying', 'applying on accept key')

  let [u4] = u3.update({ type: 'update.applied', runId: u3.runId })
  t.is(u4.state, 'applied', 'applied on update.applied')
  t.ok(u4.view().includes('restart'), 'applied view mentions restart')
})

test('error handling', (t) => {
  const upd = create({ mode: 'confirm', onAccept: () => Promise.resolve() })

  let [u1] = upd.update({ type: 'update.downloading' })
  let [u2] = u1.update({ type: 'update.error', error: new Error('Network failed') })

  t.is(u2.state, 'error', 'error state on update.error')
  t.ok(u2.view().includes('failed'), 'error view mentions failure')
  t.ok(u2.view().includes('Network failed'), 'error view includes message')
})

test('dismiss key', (t) => {
  const upd = create({ mode: 'confirm', dismissible: true })

  let [u1] = upd.update({ type: 'update.ready', version: '1.0.0' })
  t.is(u1.state, 'ready', 'ready state')

  const escKeyMsg = {
    type: 'key',
    is: (chord) => chord === 'esc',
    matches: function (...chords) {
      return chords.some((c) => this.is(c))
    }
  }
  let [u2] = u1.update(escKeyMsg)
  t.is(u2.state, 'idle', 'esc dismisses')
  t.is(u2.view(), '', 'idle view after dismiss')
})

test('mock updater integration', async (t) => {
  const mockUpd = mock()
  const widget = create({ onAccept: () => mockUpd.apply() })

  const msgs = []
  const send = (msg) => msgs.push(msg)

  const { wire } = require('../pear')
  wire(widget, { updater: mockUpd, send })

  await mockUpd.download({ version: '2.0.0' })
  t.ok(
    msgs.some((m) => m.type === 'update.downloading'),
    'downloading msg sent'
  )
  t.ok(
    msgs.some((m) => m.type === 'update.ready'),
    'ready msg sent'
  )
  t.ok(
    msgs.some((m) => m.version === '2.0.0'),
    'version in ready msg'
  )
})

test('stale command guard', (t) => {
  const upd = create({ autoDismissMs: 100 })

  let [u1] = upd.update({ type: 'update.ready', version: '1.0.0' })
  const oldTag = u1.tag

  const escKeyMsg2 = {
    type: 'key',
    is: (chord) => chord === 'esc',
    matches: function (...chords) {
      return chords.some((c) => this.is(c))
    }
  }
  let [u2] = u1.update(escKeyMsg2)
  t.is(u2.tag, oldTag + 1, 'tag incremented on dismiss')

  const staleHideMsg = { type: 'update.hide', id: u2.id, tag: oldTag }
  let [u3] = u2.update(staleHideMsg)
  t.is(u3.state, 'idle', 'stale tag does not affect state')
})

test('border option controls height', (t) => {
  const boxed = create()
  t.is(boxed.height(), 0, 'idle occupies no rows')
  t.is(style.height(ready(boxed).view()), 3, 'boxed banner is 3 lines')
  t.is(ready(boxed).height(), 3, 'height() agrees with the rendered block')

  const plain = create({ border: false })
  t.is(style.height(ready(plain).view()), 1, 'borderless banner is 1 line')
  t.is(ready(plain).height(), 1, 'height() agrees with the rendered block')
  t.absent(ready(plain).view().includes('╭'), 'no border characters')

  const thick = create({ border: 'thick' })
  t.ok(ready(thick).view().includes('┏'), 'named border is used')

  t.exception(() => create({ border: 'squiggly' }), 'unknown border name throws')
})

test('width option', (t) => {
  t.is(style.width(ready(create()).view()), 64, 'boxed default is 64 cells wide')
  t.ok(ready(create()).view().includes('dismiss'), 'default width fits the longest message')
  t.is(style.width(ready(create({ width: 40 })).view()), 40, 'explicit width is the outer width')
  t.ok(style.width(ready(create({ border: false })).view()) < 60, 'borderless hugs its text')
})

test('align pads within containerWidth', (t) => {
  const left = ready(create({ border: false, containerWidth: 80 }))
  t.absent(left.view().startsWith(' '), 'left alignment adds no padding')

  const right = ready(create({ border: false, align: 'right', containerWidth: 80 }))
  t.is(style.width(right.view()), 80, 'right-aligned block fills the container')
  t.ok(right.view().startsWith(' '), 'right alignment pads on the left')

  const center = ready(create({ border: false, align: 'center', containerWidth: 80 }))
  const pad =
    style.stripAnsi(center.view()).length - style.stripAnsi(center.view()).trimStart().length
  t.ok(pad > 0 && style.width(center.view()) < 80, 'center pads left only, leaves right ragged')

  const unknown = ready(create({ border: false, align: 'right' }))
  t.absent(unknown.view().startsWith(' '), 'no containerWidth means no alignment')

  t.exception(() => create({ align: 'sideways' }), 'unknown alignment throws')
})

test('layout places the banner and drops it when idle', (t) => {
  const blocks = ['header', 'body-is-wider-than-header', 'footer']

  const idle = create()
  t.is(
    idle.layout(...blocks),
    style.joinVertical(style.position.left, ...blocks),
    'idle is a plain join'
  )
  t.is(style.height(idle.layout(...blocks)), 3, 'idle adds zero rows')

  const bottom = ready(create({ border: false }))
  const lines = bottom.layout(...blocks).split('\n')
  t.is(lines.length, 4, 'borderless banner adds one row')
  t.ok(style.stripAnsi(lines[3]).includes('Update'), 'banner is last by default')

  const top = ready(create({ border: false, position: 'top' }))
  t.ok(
    style.stripAnsi(top.layout(...blocks).split('\n')[0]).includes('Update'),
    'position top is first'
  )

  t.exception(() => create({ position: 'middle' }), 'unknown position throws')
})

test('layout aligns against the widest block', (t) => {
  const wide = 'x'.repeat(100)
  const upd = ready(create({ border: false, align: 'right' }))
  const banner = upd.layout('header', wide).split('\n')[2]
  t.is(style.width(banner), 100, 'banner is padded out to the widest host block')
})
