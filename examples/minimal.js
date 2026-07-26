// Smallest runnable demo. Every layout option is exposed as a flag:
//
//   bare examples/minimal.js                            # boxed, bottom, left
//   bare examples/minimal.js --no-border --align right   # single line, right
//   bare examples/minimal.js --position top --border thick
//
const { Program, quit, key, style } = require('bare-tui')
const updater = require('../')
const { wire } = require('../pear')
const { mock } = require('../mock')
const flags = require('./flags')

const layout = flags.parse()
const mockUpdater = mock()

class App {
  constructor() {
    this.upd = updater.create({
      mode: 'confirm',
      onAccept: async () => {
        await mockUpdater.apply()
      },
      ...layout
    })
    this.message = 'Press s to simulate an update, q to quit'
  }

  update(msg) {
    if (key.matches(msg, 'ctrl+c', 'q')) return [this, quit]

    if (key.matches(msg, 's')) {
      this.message = 'Simulating update download…'
      this.upd.focused = true
      return [this, () => mockUpdater.download({ version: '1.2.3', delayMs: 2000 })]
    }

    const [upd, cmd] = this.upd.update(msg)
    this.upd = upd
    return [this, cmd]
  }

  view() {
    const header = style().bold(true).foreground('magenta').render(' ◆ bare-tui-updater demo')

    const body = style()
      .width(70)
      .height(8)
      .border(style.borders.rounded)
      .borderForeground('blue')
      .render(this.message + '\n\n' + flags.describe(layout))

    const footer = style().faint(true).render(' s simulate · q quit')

    // layout() stacks these blocks, inserts the banner at `position`, and drops
    // it entirely while idle — so it costs zero rows until there's an update.
    return this.upd.layout(header, body, footer)
  }
}

const app = new App()
const program = new Program(app)

// Turn the mock updater's events into the Msgs the widget consumes.
wire(app.upd, { updater: mockUpdater, send: program.send.bind(program) })

program.run()
