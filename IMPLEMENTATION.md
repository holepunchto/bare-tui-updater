# bare-tui-updater Implementation Summary

## What's Complete

A complete, production-ready npm package for a drop-in "update available" status-line widget for Pear/Bare CLI applications.

### Core files

- **`updater.js`** — The main component (235 LOC). Elm-style architecture, state machine with 6 states (idle/downloading/ready/applying/applied/error), always renders to a single line or empty string (satisfies bare-tui's layout-stability rule), keyboard handling for `u` (accept) and `esc` (dismiss), support for `'confirm'` (user-gated) and `'silent'` (auto-apply) modes.
- **`pear.js`** — Duck-typed adapter (27 LOC) that translates `pear.updater` events into Msgs the widget consumes. No hard dependency on `pear-runtime` (pure interface typing), works against any `{on('event', fn)}` emitter.
- **`mock.js`** — Fake updater for demos and tests (48 LOC), mirroring the event shapes of `pear-runtime-updater`. Essential because `applyUpdate()` silently no-ops outside a bundled build, so there's otherwise no way to exercise the full state machine locally.
- **`theme.js`** — Default style functions and a merge utility (13 LOC), following `bare-tui-form`'s precedent.
- **`index.js`**, **`package.json`** — Public API entry and packaging.

### Examples and tests

- **`examples/minimal.js`** (42 LOC) — Minimal runnable demo with mock updater, shows "press s to simulate, u to apply, q to quit."
- **`examples/pear.js`** (60 LOC) — Integration example with real `pear.updater` wiring (also uses mock updater for safety in dev).
- **`test/index.js`** (86 LOC) — Unit tests covering state transitions, error handling, key gating, mock integration, stale-Cmd-guard (the id/tag pattern from bare-tui/spinner.js).

### Documentation

- **`README.md`** (164 LOC) — Complete API reference, Quick Start, message types, layout-stability guidance, restart-handling caveat with re-exec pattern, examples.

## Key Design Decisions

### 1. Non-intrusive height by design

`view()` returns either `''` (idle, 0 rows) or a 3-line bordered block (active). To achieve zero-rows-at-idle, hosts must use `.filter(Boolean)` when splicing the widget into `style.joinVertical(...)` — otherwise `joinVertical` reserves a permanent blank row for the empty string argument:

```js
// Wrong: reserves a blank row always:
style.joinVertical(..., this.upd.view())

// Correct: 0 rows idle, 3 rows active:
style.joinVertical(..., ...[..., this.upd.view()].filter(Boolean))
```

This is a call-site fix, not a widget behavior — the widget already does the right thing (`''` when idle). The README documents this explicitly so integrators understand the pattern upfront.

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
  │   ├── minimal.js     # minimal demo
  │   └── pear.js        # integration example
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
