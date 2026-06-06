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
| `src/public/index.html` | Single-page UI — HTML and CSS only, no inline JS |
| `src/public/app.js` | All browser-side logic as an ES module with named exports |
| `src/types/androidtv-remote.d.ts` | Hand-written type declarations for the untyped `androidtv-remote` package |

---

## Protocols

### Android TV Remote (pairing + control)

Used for all remote control input — D-pad, media keys, power. Implemented by the [`androidtv-remote`](https://www.npmjs.com/package/androidtv-remote) package.

- **Pairing port:** 6467 — a one-time TLS certificate exchange. The TV displays a PIN; the client calls `remote.sendCode(pin)` to complete pairing. The resulting certificate is saved to `pairing.json` and reused on subsequent connections.
- **Remote port:** 6466 — persistent TLS connection used to send key events and receive state events (`powered`, `current_app`).

The server creates a new `AndroidRemote` instance per WebSocket connection. Handlers are registered on a local `const r` (not the outer `let remote`) to avoid a null-reference race if the socket closes or reconnects before the `ready` event fires.

---

## WebSocket message protocol

All messages are JSON. The browser sends:

| `type` | Additional fields | Description |
|---|---|---|
| `connect` | `host` | Connect to TV at the given IP |
| `sendCode` | `code` | Submit pairing PIN |
| `sendKey` | `key` | Send a key event (e.g. `KEYCODE_DPAD_UP`) |
| `sendPower` | — | Toggle power |

The server sends:

| `type` | Additional fields | Description |
|---|---|---|
| `secret` | — | TV is showing a pairing PIN |
| `ready` | — | Connected and ready |
| `powered` | `value: boolean` | Power state changed |
| `current_app` | `value: string` | Foreground app package changed |
| `unpaired` | — | TV rejected the saved certificate |
| `error` | `message` | Something went wrong |

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

Two test files:

| File | Environment | What's tested |
|---|---|---|
| `src/__tests__/server.test.ts` | Node | WebSocket handler: pairing, `sendKey`, `sendPower`, state event forwarding, cert persistence, connection lifecycle — `androidtv-remote` mocked |
| `src/__tests__/app.test.js` | jsdom | All browser JS: DOM helpers, `updateSB`, `onMsg` (every message type), `handleConnect`, `sendPin`, `init` event wiring — WebSocket mocked via `vi.stubGlobal` |

---

## TV setup

### Android TV Remote (required for remote control)

1. Settings → Device Preferences → About → tap **Build** 7 times to enable Developer Options
2. Developer Options → **Network debugging** → ON
3. Find the TV's IP: Settings → Network → Status
