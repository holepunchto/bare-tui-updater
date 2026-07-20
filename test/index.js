const test = require('brittle')
const { create } = require('../')
const { mock } = require('../mock')

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
    matches: function(...chords) { return chords.some(c => this.is(c)) }
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
    matches: function(...chords) { return chords.some(c => this.is(c)) }
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
    matches: function(...chords) { return chords.some(c => this.is(c)) }
  }
  let [u2] = u1.update(escKeyMsg2)
  t.is(u2.tag, oldTag + 1, 'tag incremented on dismiss')

  const staleHideMsg = { type: 'update.hide', id: u2.id, tag: oldTag }
  let [u3] = u2.update(staleHideMsg)
  t.is(u3.state, 'idle', 'stale tag does not affect state')
})
