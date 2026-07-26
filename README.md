# bare-tui-updater

A drop-in "update available" status-line widget for [bare-tui](https://github.com/holepunchto/bare-tui) apps using [pear-runtime](https://docs.pears.com/)'s OTA updater.

Provides an unobtrusive banner notification styled after Claude Code's CLI update flow: a user-controlled confirm gate before applying an update, visual progress during download/apply, and a restart prompt.

It takes **zero rows in your layout until there is an update**, and you choose how it appears when there is one — boxed or as a single plain line, at the top or bottom, left/center/right aligned.

## Install

```sh
npm install bare-tui-updater
```

## Quick Start

```js
const { Program, quit, key, style } = require('bare-tui')
const updater = require('bare-tui-updater')
const { wire } = require('bare-tui-updater/pear')

const pear = new PearRuntime({ ... })

class App {
  constructor() {
    this.upd = updater.create({
      mode: 'confirm',
      border: false,      // single line instead of a box
      position: 'bottom', // or 'top'
      align: 'right',     // or 'left' (default) / 'center'
      onAccept: async () => {
        await pear.updater.applyUpdate()
      }
    })
  }
  update(msg) {
    if (key.matches(msg, 'ctrl+c')) return [this, quit]
    const [u, cmd] = this.upd.update(msg)
    this.upd = u
    return [this, cmd]
  }
  view() {
    // Costs zero rows while idle; the banner appears only when there's an update.
    return this.upd.layout('My app...')
  }
}

const program = new Program(new App())
wire(this.upd, { updater: pear.updater, send: program.send.bind(program) })
program.run()
```

## API

### `updater.create(opts)`

Returns a bare-tui component (`{ update(msg), view() }`).

**Options:**

- `mode` — `'confirm'` (default) | `'silent'` | `'notify-only'`
  - **confirm**: download happens silently; once staged, a banner appears and the user presses a key to apply.
  - **silent**: apply immediately on ready, no user interaction for apply (still shows "restart" prompt after apply).
  - **notify-only**: user must call `applyUpdate()` themselves; widget only narrates the lifecycle.
- `onAccept` — `async () => void` (required for `'confirm'`/`'silent'` modes)
  - Called when the user accepts an update (or immediately in `'silent'` mode). Should call `await pear.updater.applyUpdate()` (or equivalent).
- `acceptKey` — string, default `'u'` — the key to press to apply a ready update.
- `dismissible` — boolean, default `true` — whether `esc` can dismiss the banner.
- `autoDismissMs` — number, default `0` (never auto-dismiss) — hide the banner after N milliseconds in `applied`/`error` states.
- `showProgress` — boolean, default `true` — show a spinner during download.
- `theme` — object — style overrides (see [theme.js](./theme.js)).
- `copy` — object — text overrides for every message.

**Layout options** (see [Layout Behavior](#layout-behavior)):

- `border` — `true` (default) | `false` | `'rounded'` | `'normal'` | `'thick'` | `'double'` | `'none'` | a border-chars object.
  - `true`/a name draws a box — **3 rows**. `false`/`'none'` renders a plain single line — **1 row**. Use `false` in apps that are already box-heavy.
- `position` — `'bottom'` (default) | `'top'` — where `layout()` places the banner relative to your blocks.
- `align` — `'left'` (default) | `'center'` | `'right'` — horizontal placement of the banner within the available width.
- `width` — number | `'auto'` — total outer width of the banner. Defaults to `64` when bordered (fits the longest built-in message) and `'auto'` (hug the text) when borderless. Longer text truncates with `…`.
- `containerWidth` — number, default `0` — the width `align` measures against. Leave unset and `layout()` uses the widest block you pass it; set it (e.g. on `resize`) to align against the full terminal instead.

**Component API:**

- `update(msg)` — `(model, cmd)` — processes a Msg and returns the updated model + a Cmd.
- `view()` — `string` — the rendered banner, or `''` when idle.
- `layout(...blocks)` — `string` — stacks your blocks and inserts the banner per `position`, contributing zero rows when idle.
- `height()` — `number` — rows the widget occupies right now: `0` idle, `1` borderless, `3` boxed. Useful when you budget fixed heights.
- `focus()` / `blur()` — gates key handling.

### `wire(widget, { updater, send })`

Connects a widget to a pear-runtime `updater` instance.

- `updater` — an EventEmitter with `.on('updating'|'updating-delta'|'updated'|'error')` (i.e., `pear.updater`).
- `send` — function to inject Msgs into the bare-tui Program (i.e., `program.send.bind(program)`).

Returns a `detach()` function to unsubscribe.

```js
const detach = wire(this.upd, { updater: pear.updater, send: program.send })
// later...
detach()
```

### `mock.mock()`

Returns a fake updater for demos and tests. Useful because `pear-runtime-updater.applyUpdate()` silently no-ops outside a bundled build.

```js
const { mock } = require('bare-tui-updater/mock')
const mockUpd = mock()
await mockUpd.download({ version: '1.2.3' })
await mockUpd.apply()
```

## Message Types

The widget consumes these Msg types (produced by the `wire()` adapter or emitted manually):

| Msg                                  | Meaning                                        |
| ------------------------------------ | ---------------------------------------------- |
| `{ type: 'update.downloading' }`     | Update download started.                       |
| `{ type: 'update.progress', delta }` | One Hyperdrive mirror diff (raw pass-through). |
| `{ type: 'update.ready', version }`  | New build staged on disk, awaiting apply.      |
| `{ type: 'update.error', error }`    | Download/apply error.                          |
| `{ type: 'update.apply' }`           | Internal: user pressed accept key.             |
| `{ type: 'update.applied', runId }`  | Internal: apply finished.                      |
| `{ type: 'update.dismiss' }`         | User pressed escape.                           |
| `{ type: 'key' }`                    | Keyboard input (from bare-tui).                |

## Layout Behavior

The widget costs **zero rows while idle** and expands only when there's something to say. How many rows it takes when it does appear depends on `border`:

| `border`           | rows when visible | look              |
| ------------------ | ----------------- | ----------------- |
| `true` (default)   | 3                 | bordered box      |
| `false` / `'none'` | 1                 | plain status line |

`height()` reports this at any moment (`0` when idle), so hosts that compute fixed panel heights can subtract it.

### Recommended: let `layout()` place it

`layout()` stacks your blocks, inserts the banner according to `position`, aligns it per `align`, and omits it entirely when idle:

```js
const upd = updater.create({
  border: false, // single line — good for apps that are already box-heavy
  position: 'bottom', // or 'top'
  align: 'right', // or 'left' (default) / 'center'
  onAccept: () => pear.updater.applyUpdate()
})

view() {
  return upd.layout(this._header(), this._body(), this._footer())
}
```

With no `containerWidth` set, alignment is measured against the widest block you passed — so `align: 'right'` lines the banner up with the right edge of your layout without you tracking terminal size. Set `upd.containerWidth = msg.width` on `resize` to align against the full terminal instead.

### Manual placement

If the banner belongs in the middle of an existing layout, keep using `view()` — but **`style.joinVertical` reserves one row per argument regardless of content**, and an empty string still becomes a blank padded line. Filter the empties out or the widget costs a permanent blank row while idle:

```js
view() {
  return style.joinVertical(
    style.position.left,
    ...[
      this._header(),      // fixed height
      this._body(),        // fixed height
      this.upd.view(),     // 1 or 3 lines when active, '' when idle
      this._footer()       // fixed height
    ].filter(Boolean)      // Drop empty strings so idle = 0 rows
  )
}
```

**Plan your layout for a 1- or 3-row insertion/removal when an update is available, and 0 rows the rest of the time — don't budget fixed space for it.**

## Restart Handling

**The widget does not restart the process automatically.** After applying an update, it displays "restart to use it" and the user/shell is responsible for relaunching the CLI.

This is intentional: there is no cross-platform restart primitive in `pear-runtime`, and safe restart logic depends heavily on whether the app is a standalone `bare-build` binary (re-exec `Bare.argv[0]`) or running from source (`bare bin.js`, cannot safely restart itself). The decision is yours.

A simple re-exec pattern (for standalone binaries):

```js
const { spawn } = require('bare-subprocess')

async function restart() {
  const child = spawn(Bare.argv[0], Bare.argv.slice(1), {
    detached: true,
    stdio: 'inherit'
  })
  child.unref()
  await new Promise((r) => setImmediate(r))
  Bare.exit(0)
}
```

Wire this into your app's menu or call it after `onAccept` if you want automatic restart. See [examples/pear.js](./examples/pear.js) for a complete integration.

## Examples

- [minimal.js](./examples/minimal.js) — Smallest runnable demo with the mock updater; uses `layout()`.
- [pear.js](./examples/pear.js) — `pear-runtime` wiring plus manual placement and `containerWidth` on resize.

Both take flags so you can try every layout combination without editing code:

```sh
bare examples/minimal.js --help
bare examples/minimal.js --no-border --align right
bare examples/minimal.js --position top --border thick
bare examples/pear.js --align center --width 50
```

Press `s` to simulate an update, `u` to apply, `esc` to dismiss, `q` to quit.

## License

Apache-2.0
