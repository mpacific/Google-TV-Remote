import { vi, describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { WebSocket as WsClient } from 'ws';
import fs from 'fs';

// ── Hoisted state shared between the mock factory and test bodies ─────────────
// vi.hoisted() runs before any imports so the values are available inside vi.mock().
const { setLastRemote, getLastRemote, startError } = vi.hoisted(() => {
  let instance: any = null;
  // Setting startError.value before sending a 'connect' message makes that
  // connect's remote.start() reject, without needing to intercept after construction.
  const startError = { value: null as Error | null };
  return {
    setLastRemote: (r: any) => { instance = r; },
    getLastRemote: () => instance,
    startError,
  };
});

// ── Mock androidtv-remote ─────────────────────────────────────────────────────
vi.mock('androidtv-remote', async () => {
  const { EventEmitter } = await import('node:events');

  class MockRemote extends EventEmitter {
    constructor(_host: string, _opts: unknown) {
      super();
      setLastRemote(this);
    }
    start = vi.fn().mockImplementation(() => {
      if (startError.value) {
        const err = startError.value;
        startError.value = null;
        return Promise.reject(err);
      }
      return Promise.resolve(true);
    });
    stop           = vi.fn();
    sendKey        = vi.fn();
    sendPower      = vi.fn();
    sendCode       = vi.fn();
    getCertificate = vi.fn().mockReturnValue({ key: 'test-key', cert: 'test-cert' });
  }

  return {
    AndroidRemote: MockRemote,
    RemoteKeyCode: {
      KEYCODE_DPAD_UP:    19,
      KEYCODE_HOME:        3,
      KEYCODE_DPAD_CENTER: 23,
    },
    RemoteDirection: { SHORT: 0 },
  };
});

import { server, wss, loadCert, saveCert } from '../server';

// ── Helpers ───────────────────────────────────────────────────────────────────
let port: number;

function connect(): Promise<WsClient> {
  return new Promise((resolve, reject) => {
    const ws = new WsClient(`ws://localhost:${port}`);
    ws.once('open',  () => resolve(ws));
    ws.once('error', reject);
  });
}

// Register a persistent listener before triggering the action so rapid back-to-back
// messages are never missed.
function collectMessages(ws: WsClient, count: number): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const msgs: Record<string, unknown>[] = [];
    function onMessage(data: Buffer) {
      msgs.push(JSON.parse(data.toString()));
      if (msgs.length === count) {
        ws.off('message', onMessage);
        resolve(msgs);
      }
    }
    ws.on('message', onMessage);
    ws.once('error', reject);
  });
}

function nextMessage(ws: WsClient): Promise<Record<string, unknown>> {
  return collectMessages(ws, 1).then(m => m[0]);
}

function send(ws: WsClient, msg: object) {
  ws.send(JSON.stringify(msg));
}

// Send a 'connect' message and wait for the MockRemote to be constructed + start() called
async function connectToTV(ws: WsClient, host = '192.168.1.1') {
  send(ws, { type: 'connect', host });
  await new Promise(r => setTimeout(r, 40));
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
beforeAll(() => new Promise<void>(resolve => server.listen(0, () => {
  port = (server.address() as { port: number }).port;
  resolve();
})));

afterAll(() => {
  // closeAllConnections() (Node ≥18) ensures lingering test sockets don't block close()
  (server as any).closeAllConnections?.();
  return new Promise<void>(resolve => wss.close(() => server.close(() => resolve())));
});

afterEach(() => {
  vi.restoreAllMocks();
  startError.value = null;
});

// ── loadCert ──────────────────────────────────────────────────────────────────
describe('loadCert', () => {
  it('returns null when the cert file does not exist', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    expect(loadCert()).toBeNull();
  });

  it('returns parsed JSON when the cert file exists', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('{"key":"k","cert":"c"}' as any);
    expect(loadCert()).toEqual({ key: 'k', cert: 'c' });
  });

  it('returns null when the cert file contains invalid JSON', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('not-json' as any);
    expect(loadCert()).toBeNull();
  });
});

// ── saveCert ──────────────────────────────────────────────────────────────────
describe('saveCert', () => {
  it('writes the cert as formatted JSON', () => {
    const spy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    saveCert({ key: 'k', cert: 'c' });
    expect(spy).toHaveBeenCalledWith(
      expect.any(String),
      JSON.stringify({ key: 'k', cert: 'c' }, null, 2),
    );
  });
});

// ── connect message ───────────────────────────────────────────────────────────
describe('connect message', () => {
  it('creates an AndroidRemote and calls start()', async () => {
    const ws = await connect();
    await connectToTV(ws);
    expect(getLastRemote()).not.toBeNull();
    expect(getLastRemote().start).toHaveBeenCalled();
    ws.close();
  });

  it('stops an existing remote before creating a new one', async () => {
    const ws = await connect();
    await connectToTV(ws);
    const first = getLastRemote();

    await connectToTV(ws, '192.168.1.2');
    expect(first.stop).toHaveBeenCalled();
    ws.close();
  });

  it('forwards a start() error to the client', async () => {
    startError.value = new Error('connection timeout');
    const ws = await connect();
    const p = nextMessage(ws);         // listen BEFORE the message triggers start()
    send(ws, { type: 'connect', host: '192.168.1.1' });
    const msg = await p;
    expect(msg.type).toBe('error');
    expect(msg.message).toContain('connection timeout');
    ws.close();
  });
});

// ── remote events → client messages ──────────────────────────────────────────
describe('remote events → client messages', () => {
  it('forwards secret event', async () => {
    const ws = await connect();
    await connectToTV(ws);
    const p = nextMessage(ws);
    getLastRemote().emit('secret');
    expect(await p).toEqual({ type: 'secret' });
    ws.close();
  });

  it('forwards ready event and saves the cert', async () => {
    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    const ws = await connect();
    await connectToTV(ws);
    const p = nextMessage(ws);
    getLastRemote().emit('ready');
    expect(await p).toEqual({ type: 'ready' });
    expect(writeSpy).toHaveBeenCalled();
    ws.close();
  });

  it('forwards powered event with value', async () => {
    const ws = await connect();
    await connectToTV(ws);
    const p = nextMessage(ws);
    getLastRemote().emit('powered', true);
    expect(await p).toEqual({ type: 'powered', value: true });
    ws.close();
  });

  it('forwards current_app event', async () => {
    const ws = await connect();
    await connectToTV(ws);
    const p = nextMessage(ws);
    getLastRemote().emit('current_app', 'com.netflix.ninja');
    expect(await p).toEqual({ type: 'current_app', value: 'com.netflix.ninja' });
    ws.close();
  });

  it('forwards unpaired event and deletes the cert file', async () => {
    const rmSpy = vi.spyOn(fs, 'rmSync').mockImplementation(() => {});
    const ws = await connect();
    await connectToTV(ws);
    const p = nextMessage(ws);
    getLastRemote().emit('unpaired');
    expect(await p).toEqual({ type: 'unpaired' });
    expect(rmSpy).toHaveBeenCalled();
    ws.close();
  });
});

// ── sendKey ───────────────────────────────────────────────────────────────────
describe('sendKey message', () => {
  it('calls remote.sendKey with the correct keycode and SHORT direction', async () => {
    const ws = await connect();
    await connectToTV(ws);
    send(ws, { type: 'sendKey', key: 'KEYCODE_DPAD_UP' });
    await new Promise(r => setTimeout(r, 30));
    expect(getLastRemote().sendKey).toHaveBeenCalledWith(19, 0); // keycode 19, SHORT=0
    ws.close();
  });

  it('does nothing for an unknown key name', async () => {
    const ws = await connect();
    await connectToTV(ws);
    const remote = getLastRemote();
    remote.sendKey.mockClear();
    send(ws, { type: 'sendKey', key: 'KEYCODE_NONEXISTENT' });
    await new Promise(r => setTimeout(r, 30));
    expect(remote.sendKey).not.toHaveBeenCalled();
    ws.close();
  });
});

// ── sendPower ─────────────────────────────────────────────────────────────────
describe('sendPower message', () => {
  it('calls remote.sendPower()', async () => {
    const ws = await connect();
    await connectToTV(ws);
    send(ws, { type: 'sendPower' });
    await new Promise(r => setTimeout(r, 30));
    expect(getLastRemote().sendPower).toHaveBeenCalled();
    ws.close();
  });
});

// ── sendCode ──────────────────────────────────────────────────────────────────
describe('sendCode message', () => {
  it('calls remote.sendCode() with the PIN', async () => {
    const ws = await connect();
    await connectToTV(ws);
    send(ws, { type: 'sendCode', code: '123456' });
    await new Promise(r => setTimeout(r, 30));
    expect(getLastRemote().sendCode).toHaveBeenCalledWith('123456');
    ws.close();
  });
});

// ── WebSocket lifecycle ───────────────────────────────────────────────────────
describe('WebSocket lifecycle', () => {
  it('calls remote.stop() when the client disconnects', async () => {
    const ws = await connect();
    await connectToTV(ws);
    const remote = getLastRemote();
    await new Promise<void>(resolve => { ws.close(); ws.once('close', resolve); });
    await new Promise(r => setTimeout(r, 40));
    expect(remote.stop).toHaveBeenCalled();
  });

  it('silently ignores malformed JSON', async () => {
    const ws = await connect();
    ws.send('not-json');
    await new Promise(r => setTimeout(r, 30));
    // No crash, no message back — just verify we're still connected
    expect(ws.readyState).toBe(WsClient.OPEN);
    ws.close();
  });
});
