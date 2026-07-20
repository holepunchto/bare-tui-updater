const { Program, quit, key, style } = require('bare-tui')
const updater = require('../')
const { wire } = require('../pear')
const { mock } = require('../mock')

const mockUpdater = mock()

class DemoApp {
  constructor() {
    this.message =
      'Press "s" to simulate an update check\nPress "u" to apply when ready\nPress "q" to quit'
    this.upd = updater.create({
      mode: 'confirm',
      acceptKey: 'u',
      onAccept: async () => {
        this.message = 'Applying update...'
        await mockUpdater.apply()
      }
    })
  }

  update(msg) {
    if (key.matches(msg, 'ctrl+c', 'q')) return [this, quit]

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
      .width(60)
      .height(8)
      .border(style.borders.rounded)
      .borderForeground('blue')
      .render(this.message)

    const footer = style().faint(true).render(' s simulate update · q quit')

    return style.joinVertical(
      style.position.left,
      ...[header, body, this.upd.view(), footer].filter(Boolean)
    )
  }
}

const program = new Program(new DemoApp())

wire(mockUpdater, { updater: mockUpdater, send: program.send.bind(program) })

program.run()
