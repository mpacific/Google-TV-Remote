# Implementation

A web-based Google TV remote control. Open `http://localhost:3000` on any device on your local network to control the TV.

## Quick start

```bash
npm install
npm run dev        # starts server at http://localhost:3000
```

First run requires pairing (see [Pairing](#pairing) below).

---

## Architecture

```
Browser (index.html + app.js)
        │  WebSocket (ws://localhost:3000)
        ▼
   server.ts  (Express + ws)
   ┌──────────────────────────────────┐
   │  Android TV Remote protocol      │  ← androidtv-remote  (port 6466/6467)
   │  ADB over TCP                    │  ← @devicefarmer/adbkit  (port 5555)
   └──────────────────────────────────┘
        │
        ▼
   Google TV device
```

The server is the sole connection point to the TV. The browser only ever talks to the Node.js server over a single WebSocket; it never connects to the TV directly.

---

## Source files

| File | Purpose |
|---|---|
| `src/server.ts` | HTTP server (Express), WebSocket handler, pairing cert persistence |
| `src/appUtils.ts` | Pure functions and data: `APP_DB`, `HIDDEN_PACKAGES`, name/color resolution |
| `src/adbUtils.ts` | ADB connection, app discovery (`listTvApps`), app launch (`launchApp`) |
| `src/public/index.html` | Single-page UI — HTML and CSS only, no inline JS |
| `src/public/app.js` | All browser-side logic as an ES module with named exports |
| `src/types/androidtv-remote.d.ts` | Hand-written type declarations for the untyped `androidtv-remote` package |

---

## Protocols

### Android TV Remote (pairing + control)

Used for all remote control input — D-pad, volume, media keys, power. Implemented by the [`androidtv-remote`](https://www.npmjs.com/package/androidtv-remote) package.

- **Pairing port:** 6467 — a one-time TLS certificate exchange. The TV displays a PIN; the client calls `remote.sendCode(pin)` to complete pairing. The resulting certificate is saved to `pairing.json` and reused on subsequent connections.
- **Remote port:** 6466 — persistent TLS connection used to send key events and receive state events (`powered`, `volume`, `current_app`).

The server creates a new `AndroidRemote` instance per WebSocket connection. Handlers are registered on a local `const r` (not the outer `let remote`) to avoid a null-reference race if the socket closes or reconnects before the `ready` event fires.

### ADB over TCP

Used only for app discovery and launching. Requires the TV to have **ADB debugging over network** enabled (Developer Options) and `adb` installed on the host machine (`brew install android-platform-tools`).

- Connects to the TV on port 5555 via [`@devicefarmer/adbkit`](https://www.npmjs.com/package/@devicefarmer/adbkit).
- App discovery runs `pm query-activities --components -a android.intent.action.MAIN -c android.intent.category.LEANBACK_LAUNCHER` to get every app registered with the TV (Leanback) launcher.
- App launching calls `device.startActivity({ action, category, component })` which maps to `am start -a … -c … -n <component>`.

---

## App name resolution

Three-tier lookup in `resolveApp()` (`src/appUtils.ts`):

1. **`APP_DB`** — static map of ~50 known package names to display names and brand colors. Covers the most common streaming services.
2. **Device label** — for packages not in `APP_DB`, the server runs a single batched shell script (`pm dump <pkg> | grep nonLocalizedLabel`) across all unknown packages. Some apps set a literal `android:label` string in their manifest; those show up here.
3. **Fallback** — splits the package name on `.`, strips common non-name segments (`android`, `tv`, `mobile`, `app`, TLDs, etc.) via `SKIP_SEGMENTS`, and capitalises the first meaningful segment. Color is derived deterministically from a hash of the package name.

`HIDDEN_PACKAGES` is a separate set of packages that are filtered out before the list is returned to the browser, regardless of the above.

---

## WebSocket message protocol

All messages are JSON. The browser sends:

| `type` | Additional fields | Description |
|---|---|---|
| `connect` | `host` | Connect to TV at the given IP |
| `sendCode` | `code` | Submit pairing PIN |
| `sendKey` | `key` | Send a key event (e.g. `KEYCODE_DPAD_UP`) |
| `sendPower` | — | Toggle power |
| `getApps` | — | Discover installed apps via ADB |
| `launchApp` | `component` | Launch app by component name |

The server sends:

| `type` | Additional fields | Description |
|---|---|---|
| `secret` | — | TV is showing a pairing PIN |
| `ready` | — | Connected and ready |
| `powered` | `value: boolean` | Power state changed |
| `volume` | `value: {level, muted}` | Volume state changed |
| `current_app` | `value: string` | Foreground app package changed |
| `unpaired` | — | TV rejected the saved certificate |
| `error` | `message` | Something went wrong |
| `appsLoading` | — | ADB app discovery started |
| `apps` | `list: AppInfo[]` | App discovery complete |
| `appsError` | `message` | ADB discovery failed |

---

## Certificate persistence

On first connection the pairing flow generates a self-signed TLS certificate. After the PIN is accepted, the certificate is written to `pairing.json` (git-ignored) and loaded on every subsequent connection, skipping the PIN step.

Deleting `pairing.json` forces a full re-pair.

---

## Tests

```bash
npm test               # run all tests
npm run test:coverage  # with coverage report
```

Three test files, 137 tests total:

| File | Environment | What's tested |
|---|---|---|
| `src/__tests__/appUtils.test.ts` | Node | `APP_DB` data integrity, `fallbackName`, `colorFor`, `resolveApp`, `HIDDEN_PACKAGES`, `SKIP_SEGMENTS` |
| `src/__tests__/adbUtils.test.ts` | Node | `readStream`, `fetchLabelsFromDevice`, `listTvApps`, `launchApp` — ADB client mocked with `vi.hoisted` + `vi.mock` |
| `src/__tests__/app.test.js` | jsdom | All browser JS: `esc`, DOM helpers, `updateSB`, `onMsg` (every message type), `handleConnect`, `renderApps`, `sendPin`, `init` event wiring — WebSocket mocked via `vi.stubGlobal` |

---

## TV setup

### Android TV Remote (required for remote control)

1. Settings → Device Preferences → About → tap **Build** 7 times to enable Developer Options
2. Developer Options → **Network debugging** → ON
3. Find the TV's IP: Settings → Network → Status

### ADB (required for app discovery)

1. Developer Options → **ADB debugging** → ON
2. On your Mac: `brew install android-platform-tools && adb start-server`
3. First connection: accept the "Allow ADB debugging?" prompt on the TV screen

---

## Adding app names

Edit `APP_DB` in `src/appUtils.ts`. Each entry is:

```ts
'com.package.name': { name: 'Display Name', color: '#RRGGBB' },
```

To find package names for apps on your TV: connect, click **Load Apps**, then **Copy list**. Paste the result — it's in `package -> current_name` format, one per line.

To hide an app from the grid, add its package to `HIDDEN_PACKAGES` in the same file.
