// Integration example with the pear-runtime wiring (backed by the mock updater
// so it runs anywhere). Unlike minimal.js, this one places the banner by hand
// instead of using upd.layout() — the pattern you need when the widget sits in
// the middle of an existing layout, or when you want alignment measured against
// the real terminal width.
//
//   bare examples/pear.js --align right --no-border
//
const { Program, quit, key, style } = require('bare-tui')
const updater = require('../')
const { wire } = require('../pear')
const { mock } = require('../mock')
const flags = require('./flags')

const layout = flags.parse()
const mockUpdater = mock()

class DemoApp {
  constructor() {
    this.width = 60
    this.message =
      'Press "s" to simulate an update check\nPress "u" to apply when ready\nPress "q" to quit'
    this.upd = updater.create({
      mode: 'confirm',
      acceptKey: 'u',
      onAccept: async () => {
        this.message = 'Applying update...'
        await mockUpdater.apply()
      },
      ...layout
    })
  }

  update(msg) {
    if (key.matches(msg, 'ctrl+c', 'q')) return [this, quit]

    if (msg.type === 'resize') {
      this.width = msg.width || this.width
      // Align the banner against the full terminal width rather than the
      // widest block in the layout.
      this.upd.containerWidth = this.width
      return [this, null]
    }

    if (key.matches(msg, 's')) {
      this.message = 'Downloading update...'
      return [this, () => mockUpdater.download({ version: '1.2.3', delayMs: 2000 })]
    }

    const [upd, updCmd] = this.upd.update(msg)
    this.upd = upd
    return [this, updCmd]
  }

  view() {
    const header = style()
      .bold(true)
      .foreground('magenta')
      .render(' ◆ bare-tui-updater demo (with mock updater)')

    const body = style()
      .width(Math.max(20, Math.min(60, this.width - 2)))
      .height(8)
      .border(style.borders.rounded)
      .borderForeground('blue')
      .render(this.message + '\n\n' + flags.describe(layout))

    const footer = style().faint(true).render(' s simulate update · q quit')

    // '' while idle, an aligned 1- or 3-line block otherwise. filter(Boolean)
    // is what keeps idle at zero rows: joinVertical reserves a row per argument.
    const banner = this.upd.view()
    const parts =
      this.upd.position === 'top' ? [banner, header, body, footer] : [header, body, banner, footer]

    return style.joinVertical(style.position.left, ...parts.filter(Boolean))
  }
}

const program = new Program(new DemoApp())

wire(mockUpdater, { updater: mockUpdater, send: program.send.bind(program) })

program.run()
