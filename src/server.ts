import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import path from 'path';
import fs from 'fs';
import { AndroidRemote, RemoteKeyCode, RemoteDirection } from 'androidtv-remote';

const PORT = 3000;
export let CERT_FILE = path.join(__dirname, '..', 'pairing.json');

// ── HTTP + WebSocket server ──────────────────────────────────────────────────
const app = express();
app.use(express.static(path.join(__dirname, 'public')));

export const server = createServer(app);
export const wss = new WebSocketServer({ server });

interface PairingData { key: string; cert: string }

export function loadCert(): PairingData | null {
  try {
    if (fs.existsSync(CERT_FILE)) return JSON.parse(fs.readFileSync(CERT_FILE, 'utf8'));
  } catch { /* ignore */ }
  return null;
}

export function saveCert(data: PairingData) {
  fs.writeFileSync(CERT_FILE, JSON.stringify(data, null, 2));
}

wss.on('connection', (ws: WebSocket) => {
  console.log('Browser connected');

  let remote: InstanceType<typeof AndroidRemote> | null = null;
  let tvHost = '';

  function send(msg: object) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  ws.on('message', async (data) => {
    let msg: { type: string; host?: string; code?: string; key?: string };
    try { msg = JSON.parse(data.toString()); } catch { return; }

    // ── Connect remote ───────────────────────────────────────────────────────
    if (msg.type === 'connect' && msg.host) {
      tvHost = msg.host;

      if (remote) { try { remote.stop(); } catch {} remote = null; }

      const savedCert = loadCert();
      const r = new AndroidRemote(tvHost, {
        pairing_port: 6467,
        remote_port: 6466,
        service_name: 'GoogleTVRemote',
        cert: savedCert ?? undefined,
      });
      remote = r;

      r.on('secret', ()              => send({ type: 'secret' }));
      r.on('ready', ()               => { saveCert(r.getCertificate() as PairingData); send({ type: 'ready' }); });
      r.on('powered',  (v: boolean)  => send({ type: 'powered',     value: v }));
      r.on('current_app', (v: string) => send({ type: 'current_app', value: v }));
      r.on('unpaired', ()            => { fs.rmSync(CERT_FILE, { force: true }); send({ type: 'unpaired' }); });

      try { await r.start(); } catch (err: unknown) {
        send({ type: 'error', message: `Remote failed: ${err instanceof Error ? err.message : err}` });
      }
    }

    // ── Pairing PIN ──────────────────────────────────────────────────────────
    if (msg.type === 'sendCode' && msg.code && remote) {
      try { remote.sendCode(msg.code); } catch (err: unknown) {
        send({ type: 'error', message: String(err) });
      }
    }

    // ── Key press ────────────────────────────────────────────────────────────
    if (msg.type === 'sendKey' && msg.key && remote) {
      const keyCode = RemoteKeyCode[msg.key as keyof typeof RemoteKeyCode];
      if (keyCode !== undefined) remote.sendKey(keyCode, RemoteDirection.SHORT);
    }

    // ── Power ────────────────────────────────────────────────────────────────
    if (msg.type === 'sendPower' && remote) remote.sendPower();
  });

  ws.on('close', () => {
    console.log('Browser disconnected');
    if (remote) { try { remote.stop(); } catch {} remote = null; }
  });
});

if (!process.env.VITEST) {
  server.listen(PORT, () => {
    console.log(`Google TV Remote running at http://localhost:${PORT}`);
  });
}
