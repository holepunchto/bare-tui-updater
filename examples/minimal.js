const { Program, quit, key, style } = require('bare-tui')
const updater = require('../')
const { mock } = require('../mock')

const mockUpdater = mock()

class App {
  constructor() {
    this.upd = updater.create({
      mode: 'confirm',
      onAccept: async () => {
        await mockUpdater.apply()
      }
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
      .render(this.message)

    const footer = style().faint(true).render(' s simulate · q quit')

    return style.joinVertical(style.position.left, ...[header, body, this.upd.view(), footer].filter(Boolean))
  }
}

const program = new Program(new App())
program.run()
