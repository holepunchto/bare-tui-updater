# bare-tui-updater

A drop-in "update available" status-line widget for [bare-tui](https://github.com/holepunchto/bare-tui) apps using [pear-runtime](https://docs.pears.com/)'s OTA updater.

Provides an unobtrusive one-line banner notification styled after Claude Code's CLI update flow: a user-controlled confirm gate before applying an update, visual progress during download/apply, and a restart prompt.

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
    return style.joinVertical(style.position.left,
      'My app...',
      this.upd.view()
    )
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
- `width` — number, default `60` — max width of the banner (truncates with `…`).
- `theme` — object — style overrides (see [theme.js](./theme.js)).
- `copy` — object — text overrides for every message.

**Component API:**

- `update(msg)` — `(model, cmd)` — processes a Msg and returns the updated model + a Cmd.
- `view()` — `string` — renders to a single line or `''` (empty when idle).
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

The widget's `view()` returns either `''` (when idle) or a 3-line bordered block. This is non-intrusive by default: plan your layout for a **3-row insertion/removal when an update is available, and 0 rows the rest of the time**.

**Critical:** `style.joinVertical` reserves one row per argument regardless of content — an empty string still becomes a blank padded line. To prevent a permanent blank row at idle, **filter out falsy/empty segments before joining**:

```js
view() {
  return style.joinVertical(
    style.position.left,
    ...[
      this._header(),      // fixed height
      this._body(),        // fixed height
      this.upd.view(),     // 3 lines (active) or '' (idle)
      this._footer()       // fixed height
    ].filter(Boolean)       // Drop empty strings so idle = 0 rows
  )
}
```

Without `.filter(Boolean)`, the widget reserves a permanent blank line in the layout — not intrusive once you know it's there, but not the zero-rows-at-idle behavior. With the filter, the update notification inserts/removes a 3-line block cleanly as needed.

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

- [minimal.js](./examples/minimal.js) — Smallest runnable demo with the mock updater.
- [pear.js](./examples/pear.js) — Full integration with a real `pear-runtime` instance.

## License

Apache-2.0
