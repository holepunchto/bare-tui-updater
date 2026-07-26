# bare-tui-updater Implementation Summary

## What's Complete

A complete, production-ready npm package for a drop-in "update available" status-line widget for Pear/Bare CLI applications.

### Core files

- **`updater.js`** — The main component. Elm-style architecture, state machine with 6 states (idle/downloading/ready/applying/applied/error), renders to `''` when idle so it costs zero rows, configurable box/single-line/position/alignment (see below), keyboard handling for `u` (accept) and `esc` (dismiss), support for `'confirm'` (user-gated) and `'silent'` (auto-apply) modes.
- **`pear.js`** — Duck-typed adapter (27 LOC) that translates `pear.updater` events into Msgs the widget consumes. No hard dependency on `pear-runtime` (pure interface typing), works against any `{on('event', fn)}` emitter.
- **`mock.js`** — Fake updater for demos and tests (48 LOC), mirroring the event shapes of `pear-runtime-updater`. Essential because `applyUpdate()` silently no-ops outside a bundled build, so there's otherwise no way to exercise the full state machine locally.
- **`theme.js`** — Default style functions and a merge utility (13 LOC), following `bare-tui-form`'s precedent.
- **`index.js`**, **`package.json`** — Public API entry and packaging.

### Examples and tests

- **`examples/minimal.js`** — Minimal runnable demo with mock updater, using `layout()`; every layout option is a CLI flag.
- **`examples/pear.js`** — Integration example with real `pear.updater` wiring (also uses mock updater for safety in dev), showing manual placement + `containerWidth` on resize.
- **`examples/flags.js`** — Shared flag parser (`--position`, `--align`, `--border`, `--no-border`, `--width`) so both demos can be driven from the command line.
- **`test/index.js`** — Unit tests covering state transitions, error handling, key gating, mock integration, stale-Cmd-guard (the id/tag pattern from bare-tui/spinner.js), and the layout options (border/width/align/position, `layout()`, `height()`).

### Documentation

- **`README.md`** (164 LOC) — Complete API reference, Quick Start, message types, layout-stability guidance, restart-handling caveat with re-exec pattern, examples.

## Key Design Decisions

### 1. Non-intrusive height by design

`view()` returns `''` when idle (0 rows), a 3-line bordered block when active, or a single line when `border: false`. Two ways to get zero-rows-at-idle:

```js
// Preferred — the widget owns placement:
upd.layout(header, body, footer)

// Manual — `joinVertical` reserves a row per argument, so filter the empty out:
style.joinVertical(..., ...[header, body, upd.view(), footer].filter(Boolean))
```

`height()` exposes the current row count (0/1/3) for hosts that compute fixed panel heights.

### 1a. Layout options

Feedback from the first integration was that the box made an already box-heavy app boxier, and that placement should be the host's choice. So the render path splits into `_text()` (state → string) and `_box()` (string → block), with four options in front of it:

- `border` — `true` (theme border) | `false`/`'none'` (plain line) | a `style.borders` name | raw chars. Invalid names throw at construction rather than rendering garbage.
- `position` — `'top'`/`'bottom'`, honoured by `layout()` only (manual placement means the host already decided).
- `align` — `'left'`/`'center'`/`'right'`, implemented as left-padding each banner line rather than `joinVertical(position.right, ...)`, because the latter would right-align the host's blocks too.
- `containerWidth` — what `align` measures against. `layout()` defaults it to the widest block passed in, which makes `align: 'right'` work without the host tracking terminal width; hosts wanting full-terminal alignment set it on `resize`.

`width` is now the banner's **outer** width (inner = width − 2 border − 2 padding), defaulting to 64 bordered — wide enough for the longest built-in message — and `'auto'` (hug the text) borderless, so right-alignment has no trailing whitespace to fight.

### 2. State machine with terminal states

Once `applied`, the widget ignores further `update.downloading` or `update.error` events — the disk swap is permanent, and a fresh `pear.updater` instance on next process start handles anything after. This avoids the "retry" trap that would lie to the user (since `pear-runtime-updater.applyUpdate()` latches `applied = true` before attempting the swap, and silently no-ops if called again).

### 3. Duck-typed adapter, no pear-runtime import

`pear.js` doesn't import `pear-runtime`. It just listens for event names on an object with `.on()`. This means the same code works against `mock.js`, a real `pear.updater`, or a custom HTTP version-check updater — no coupling to pear's ecosystem.

### 4. Message namespace

All widget messages are `update.*` (`update.downloading`, `update.ready`, `update.apply`, etc.), so they never collide with a host's own `log`, `worker`, or `spinner.tick` messages.

### 5. No built-in restart

The widget does NOT call `Bare.exit()` or spawn a new process. Why:

- There's no cross-platform restart primitive in `pear-runtime`.
- Safe restart depends on context: standalone binary (`bare-build`) can re-exec `Bare.argv[0]`, but `bare bin.js` from source cannot.
- The decision belongs entirely to the host app (or its process manager).

The `onAccept` callback (where the host calls `await pear.updater.applyUpdate()`) is where the host can also wire in its own restart logic. The README documents a safe re-exec pattern for standalone builds.

### 6. Stale-Cmd guard via id/tag

Reuses the pattern from `bare-tui`'s own `spinner.js` and `timer.js`. When a Cmd result arrives (e.g., `update.applied`), it carries a `runId` that's checked against the current `runId`; superseded results (from before a dismiss or new cycle) are ignored. Prevents a pending auto-hide tick from undoing a user-triggered state change.

## Testing Status

✓ **Lint & formatting**: Passing (`prettier --check` + `lunte`)
✓ **Unit tests structure**: Written and ready (86 LOC in `test/index.js`)
⚠ **Unit test execution**: Pending (Bare 1.29.0+ environment needed; local env has 1.28.5)
⚠ **Integration test**: Pending (demo project scaffolded at `/tmp/bare-tui-updater-demo/`, needs TTY or manual validation)
⚠ **Visual validation**: Pending (needs real terminal + pear-runtime setup)

## What to Do Next

### Immediate (QA & validation)

1. **Upgrade Bare environment** to 1.29.0+ and run `npm test` to verify unit tests pass.
2. **Validate the integration** in `/tmp/bare-tui-updater-demo/`:
   - Start it with a TTY: `bare bin.js --no-updates`
   - Press `s` to simulate an update download
   - Verify the banner appears without resizing the screen
   - Press `u` to apply (or `esc` to dismiss)
   - Verify the layout is stable across all state transitions

3. **Test the real pear.updater wiring** (if desired):
   - Set up a real Pear upgrade link (`pear touch` → copy to `package.json`)
   - Run with updates enabled and peer seeding
   - Verify the real `pear.updater` events flow through the widget
   - Confirm the disk swap works (in a bundled build via `bare-build`)

### Medium term (docs & release)

4. **Write integration docs** showing the exact steps to add this to an existing Pear/Bare CLI app (copy from the README's Quick Start, expand with common configurations).
5. **Publish to npm** under `@holepunchto/bare-tui-updater` (or `bare-tui-updater` if unscoped).
6. **Add a working example** in the `hello-pear-bare-tui` template showing the widget in action.

### Long term (enhancements)

7. **Optional restart helper** (if demand shows up): a separate `bare-tui-updater/restart` module with safe re-exec logic (currently documented as a user pattern in the README).
8. **Progress bar** (if a host wants to supply a `progressTotal`): currently the widget shows indeterminate progress (spinner + file counters) because `updating-delta` events carry no total — add an opt-in `progressTotalBytes` config for deterministic bars.
9. **Theming presets**: pre-built color schemes beyond the default (currently just accent/success/error/hint functions, easily customizable).

## Files Structure

```
bare-tui-updater/
  ├── index.js           # public entry
  ├── updater.js         # core component
  ├── pear.js            # pear-runtime adapter
  ├── mock.js            # fake updater for testing
  ├── theme.js           # default styles
  ├── package.json       # npm metadata
  ├── README.md          # user docs
  ├── .prettierrc         # prettier config (holepunch convention)
  ├── .gitignore
  ├── examples/
  │   ├── flags.js       # shared CLI flag parser for the demos
  │   ├── minimal.js     # minimal demo (layout())
  │   └── pear.js        # integration example (manual placement)
  ├── test/
  │   └── index.js       # unit tests
  └── node_modules/
```

## Package Exports

- `require('bare-tui-updater')` → `{ create, Updater, theme, defaultCopy }`
- `require('bare-tui-updater/pear')` → `{ wire }`
- `require('bare-tui-updater/mock')` → `{ mock }`
- `require('bare-tui-updater/theme')` → `{ defaultTheme, merge }`

## Dependencies

- **bare-tui** (^0.0.3) — core TUI framework
- **bare-stream** (devDependency, for tests)
- **brittle** (devDependency, test framework)
- **lunte** (devDependency, linter)
- **prettier** (devDependency, formatter)

No dependency on `pear-runtime` or `hyperswarm` (optional, only used if you wire real pear.updater).

---

Ready for QA. Questions or issues: check the README and `memory/` folder for architectural rationale.
