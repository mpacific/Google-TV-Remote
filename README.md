# Google TV Web Remote

A web-based remote control for Google TV / Android TV. Run a small Node server on
your computer, open the page in any browser on the same network — phone, tablet, or
laptop — and control your TV.

It speaks the native Android TV Remote protocol (the same one the official Google
TV phone app uses), so there's no app to install on the TV and no ADB required.
Pairing is a one-time PIN exchange; the certificate is saved and reused afterward.

## Features

- **D-pad** — up / down / left / right / OK
- **Navigation** — Back, Home, Menu
- **Media** — rewind, play/pause, fast-forward
- **Power** — toggle the TV on/off
- **Live status bar** — current foreground app and power state
- Works from any browser on your LAN; the server is the only thing that talks to the TV

## Requirements

- [Node.js](https://nodejs.org/) 18 or newer
- A Google TV / Android TV device on the same local network
- The TV's IP address (Settings → Network → Status)

## TV setup

Network debugging must be enabled on the TV so it accepts a remote connection:

1. Settings → Device Preferences → About → tap **Build** 7 times to enable Developer Options
2. Developer Options → **Network debugging** → ON
3. Note the TV's IP address: Settings → Network → Status

## Quick start

```bash
npm install
npm run dev        # starts the server at http://localhost:3000
```

Then open **http://localhost:3000** in a browser.

### First connection (pairing)

1. Enter your TV's IP address and click **Connect**.
2. The TV displays a 6-digit PIN. Type it into the page and click **Pair**.
3. Once paired, the remote becomes active. The pairing certificate is saved to
   `pairing.json` and reused on future connections, so you won't need to pair again.

Deleting `pairing.json` forces a fresh pairing.

## Usage from other devices

The server listens on your computer; any device on the same network can use the
remote by visiting `http://<your-computer-ip>:3000`. Keep the server process
running while you use it.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the server with live reload (development) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled server from `dist/` |
| `npm test` | Run the test suite |
| `npm run test:coverage` | Run tests with a coverage report |

## How it works

The browser talks only to the local Node server over a single WebSocket. The
server holds the connection to the TV using the
[`androidtv-remote`](https://www.npmjs.com/package/androidtv-remote) protocol
(ports 6466/6467). See [IMPLEMENTATION.md](IMPLEMENTATION.md) for architecture,
the WebSocket message protocol, and details on pairing and certificate persistence.

## Troubleshooting

- **Can't connect / connection refused** — confirm the TV's IP is correct, that
  the TV and computer are on the same network, and that **Network debugging** is
  enabled on the TV.
- **No PIN appears** — make sure nothing else is already paired/connected to the
  TV's remote service, then click Connect again.
- **Stuck or rejected pairing** — delete `pairing.json` and reconnect to pair from
  scratch.
