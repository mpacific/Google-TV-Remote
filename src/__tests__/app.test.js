// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  appState, setIndicator, setHint, toast, setRemoteEnabled, updateSB,
  handleConnect, onMsg, send, k, sendPower, sendPin,
  esc, loadApps, renderApps, init,
} from '../public/app.js';

// ── Minimal DOM required by app.js ────────────────────────────────────────
const DOM = `
  <div id="wsIndicator" class="ws-indicator"></div>
  <div id="statusHint" class="status-hint">hint</div>
  <div id="toast" class="toast"></div>
  <div id="remote" class="remote off"></div>
  <div id="sbApp" class="sb-val">—</div>
  <div id="sbPwr" class="sb-val">—</div>
  <div id="sbVol" class="sb-val">—</div>
  <input id="ipInput" value="" />
  <button id="connectBtn"></button>
  <div id="pinPanel" class="pin-panel"></div>
  <input id="pinInput" value="" />
  <button id="powerBtn" class="btn-power"></button>
  <button id="muteBtn">🔔</button>
  <button id="appsLoadBtn" disabled></button>
  <button id="appsCopyBtn" class="apps-copy-btn">
    <svg></svg>
    Copy list
  </button>
  <div id="appsLoading" class="apps-state"></div>
  <div id="appsErrorMsg" class="apps-error-msg"></div>
  <div id="appsAdbNote" class="apps-adb-note"></div>
  <div id="appsGrid"></div>
`;

// ── MockWebSocket ──────────────────────────────────────────────────────────
class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    this.sent = [];
    MockWebSocket.lastInstance = this;
  }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = MockWebSocket.CLOSED; }
}
MockWebSocket.CONNECTING = 0;
MockWebSocket.OPEN = 1;
MockWebSocket.CLOSED = 3;

// ── Test setup ─────────────────────────────────────────────────────────────
beforeEach(() => {
  document.body.innerHTML = DOM;
  vi.stubGlobal('WebSocket', MockWebSocket);

  // Reset appState between tests
  appState.ws = null;
  appState.powered = null;
  appState.vol = null;
  appState.muted = false;
  appState.app = null;
  appState.installedApps = [];
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ══ esc ═══════════════════════════════════════════════════════════════════
describe('esc', () => {
  it('escapes ampersands', () => {
    expect(esc('a&b')).toBe('a&amp;b');
  });
  it('escapes less-than', () => {
    expect(esc('<script>')).toBe('&lt;script&gt;');
  });
  it('escapes double quotes', () => {
    expect(esc('"hello"')).toBe('&quot;hello&quot;');
  });
  it('leaves safe strings unchanged', () => {
    expect(esc('Netflix')).toBe('Netflix');
  });
  it('coerces non-strings', () => {
    expect(esc(42)).toBe('42');
  });
  it('escapes all four entities in one string', () => {
    expect(esc('<a href="x&y">')).toBe('&lt;a href=&quot;x&amp;y&quot;&gt;');
  });
});

// ══ setIndicator ══════════════════════════════════════════════════════════
describe('setIndicator', () => {
  it('sets the className on wsIndicator', () => {
    setIndicator('connected');
    expect(document.getElementById('wsIndicator').className).toBe('ws-indicator connected');
  });
  it('clears extra classes when empty string is passed', () => {
    setIndicator('');
    expect(document.getElementById('wsIndicator').className).toBe('ws-indicator ');
  });
  it('reflects each state class', () => {
    for (const state of ['connecting', 'pairing', 'connected', 'error']) {
      setIndicator(state);
      expect(document.getElementById('wsIndicator').className).toContain(state);
    }
  });
});

// ══ setHint ════════════════════════════════════════════════════════════════
describe('setHint', () => {
  it('sets the text content', () => {
    setHint('Hello', false);
    expect(document.getElementById('statusHint').textContent).toBe('Hello');
  });
  it('adds "live" class when live=true', () => {
    setHint('msg', true);
    expect(document.getElementById('statusHint').className).toContain('live');
  });
  it('omits "live" class when live=false', () => {
    setHint('msg', false);
    expect(document.getElementById('statusHint').className).not.toContain('live');
  });
  it('omits "live" class when live is not passed', () => {
    setHint('msg');
    expect(document.getElementById('statusHint').className).not.toContain('live');
  });
});

// ══ toast ═════════════════════════════════════════════════════════════════
describe('toast', () => {
  it('sets the text and adds "show" class', () => {
    toast('Something went wrong');
    const el = document.getElementById('toast');
    expect(el.textContent).toBe('Something went wrong');
    expect(el.classList.contains('show')).toBe(true);
  });
  it('removes "show" class after 4500ms', () => {
    vi.useFakeTimers();
    toast('temp');
    vi.advanceTimersByTime(4500);
    expect(document.getElementById('toast').classList.contains('show')).toBe(false);
    vi.useRealTimers();
  });
  it('resets the timer when called a second time', () => {
    vi.useFakeTimers();
    toast('first');
    vi.advanceTimersByTime(3000);
    toast('second');               // resets the 4500ms clock
    vi.advanceTimersByTime(3000);  // only 3s into second call — still showing
    expect(document.getElementById('toast').classList.contains('show')).toBe(true);
    vi.useRealTimers();
  });
});

// ══ setRemoteEnabled ══════════════════════════════════════════════════════
describe('setRemoteEnabled', () => {
  it('removes "off" class when enabled', () => {
    setRemoteEnabled(true);
    expect(document.getElementById('remote').classList.contains('off')).toBe(false);
  });
  it('adds "off" class when disabled', () => {
    document.getElementById('remote').classList.remove('off');
    setRemoteEnabled(false);
    expect(document.getElementById('remote').classList.contains('off')).toBe(true);
  });
});

// ══ updateSB ═════════════════════════════════════════════════════════════
describe('updateSB', () => {
  it('shows "—" for app when state.app is null', () => {
    appState.app = null;
    updateSB();
    expect(document.getElementById('sbApp').textContent).toBe('—');
  });
  it('shows last package segment for a dotted app name', () => {
    appState.app = 'com.netflix.ninja';
    updateSB();
    expect(document.getElementById('sbApp').textContent).toBe('ninja');
  });
  it('shows app name as-is when it has no dots', () => {
    appState.app = 'Netflix';
    updateSB();
    expect(document.getElementById('sbApp').textContent).toBe('Netflix');
  });
  it('shows "ON" with "on" class when powered is true', () => {
    appState.powered = true;
    updateSB();
    const el = document.getElementById('sbPwr');
    expect(el.textContent).toBe('ON');
    expect(el.className).toContain('on');
  });
  it('shows "OFF" without "on" class when powered is false', () => {
    appState.powered = false;
    updateSB();
    const el = document.getElementById('sbPwr');
    expect(el.textContent).toBe('OFF');
    expect(el.className).not.toContain('on');
  });
  it('shows "—" when powered is null', () => {
    appState.powered = null;
    updateSB();
    expect(document.getElementById('sbPwr').textContent).toBe('—');
  });
  it('shows volume level when not muted', () => {
    appState.vol = 15;
    appState.muted = false;
    updateSB();
    expect(document.getElementById('sbVol').textContent).toBe('15');
  });
  it('appends mute indicator when muted', () => {
    appState.vol = 15;
    appState.muted = true;
    updateSB();
    expect(document.getElementById('sbVol').textContent).toBe('15 ✕');
  });
  it('shows "—" for volume when vol is null', () => {
    appState.vol = null;
    updateSB();
    expect(document.getElementById('sbVol').textContent).toBe('—');
  });
});

// ══ send / k / sendPower ══════════════════════════════════════════════════
describe('send', () => {
  it('does nothing when ws is null', () => {
    appState.ws = null;
    expect(() => send({ type: 'ping' })).not.toThrow();
  });
  it('does nothing when ws is not OPEN', () => {
    appState.ws = { readyState: MockWebSocket.CONNECTING, send: vi.fn() };
    send({ type: 'ping' });
    expect(appState.ws.send).not.toHaveBeenCalled();
  });
  it('sends JSON when ws is OPEN', () => {
    const mockSend = vi.fn();
    appState.ws = { readyState: MockWebSocket.OPEN, send: mockSend };
    send({ type: 'ping' });
    expect(mockSend).toHaveBeenCalledWith('{"type":"ping"}');
  });
});

describe('k', () => {
  it('sends a sendKey message with the given key code', () => {
    const mockSend = vi.fn();
    appState.ws = { readyState: MockWebSocket.OPEN, send: mockSend };
    k('KEYCODE_DPAD_UP');
    expect(JSON.parse(mockSend.mock.calls[0][0])).toEqual({ type: 'sendKey', key: 'KEYCODE_DPAD_UP' });
  });
});

describe('sendPower', () => {
  it('sends a sendPower message', () => {
    const mockSend = vi.fn();
    appState.ws = { readyState: MockWebSocket.OPEN, send: mockSend };
    sendPower();
    expect(JSON.parse(mockSend.mock.calls[0][0])).toEqual({ type: 'sendPower' });
  });
});

// ══ sendPin ════════════════════════════════════════════════════════════════
describe('sendPin', () => {
  it('does nothing when the PIN input is empty', () => {
    const mockSend = vi.fn();
    appState.ws = { readyState: MockWebSocket.OPEN, send: mockSend };
    document.getElementById('pinInput').value = '';
    sendPin();
    expect(mockSend).not.toHaveBeenCalled();
  });
  it('sends the code and clears the input', () => {
    const mockSend = vi.fn();
    appState.ws = { readyState: MockWebSocket.OPEN, send: mockSend };
    document.getElementById('pinInput').value = '123456';
    sendPin();
    expect(JSON.parse(mockSend.mock.calls[0][0])).toEqual({ type: 'sendCode', code: '123456' });
    expect(document.getElementById('pinInput').value).toBe('');
  });
  it('updates the hint text after sending', () => {
    appState.ws = { readyState: MockWebSocket.OPEN, send: vi.fn() };
    document.getElementById('pinInput').value = '654321';
    sendPin();
    expect(document.getElementById('statusHint').textContent).toBe('Verifying PIN…');
  });
});

// ══ loadApps ═══════════════════════════════════════════════════════════════
describe('loadApps', () => {
  it('sends a getApps message', () => {
    const mockSend = vi.fn();
    appState.ws = { readyState: MockWebSocket.OPEN, send: mockSend };
    loadApps();
    expect(JSON.parse(mockSend.mock.calls[0][0])).toEqual({ type: 'getApps' });
  });
});

// ══ renderApps ═════════════════════════════════════════════════════════════
describe('renderApps', () => {
  it('shows "No apps found" for an empty list', () => {
    renderApps([]);
    expect(document.getElementById('appsGrid').textContent).toContain('No apps found');
  });
  it('renders one tile per app', () => {
    renderApps([
      { package: 'com.netflix.ninja', component: 'com.netflix.ninja/.MainActivity', name: 'Netflix', color: '#E50914' },
      { package: 'com.plexapp.android', component: 'com.plexapp.android/.Main', name: 'Plex', color: '#E5A00D' },
    ]);
    expect(document.querySelectorAll('.app-tile').length).toBe(2);
  });
  it('sets data-component on each tile', () => {
    renderApps([
      { package: 'com.netflix.ninja', component: 'com.netflix.ninja/.MainActivity', name: 'Netflix', color: '#E50914' },
    ]);
    const tile = document.querySelector('.app-tile');
    expect(tile.dataset.component).toBe('com.netflix.ninja/.MainActivity');
  });
  it('renders the first letter of the app name in the icon', () => {
    renderApps([
      { package: 'com.plexapp.android', component: 'com.plexapp.android/.Main', name: 'Plex', color: '#E5A00D' },
    ]);
    expect(document.querySelector('.app-icon').textContent.trim()).toBe('P');
  });
  it('renders the app name in the tile label', () => {
    renderApps([
      { package: 'com.plexapp.android', component: 'com.plexapp.android/.Main', name: 'Plex', color: '#E5A00D' },
    ]);
    expect(document.querySelector('.app-name').textContent.trim()).toBe('Plex');
  });
  it('HTML-escapes name, package, component, and color', () => {
    renderApps([
      { package: 'a&b', component: 'a&b/<Main>', name: '<Bad>', color: '#fff' },
    ]);
    const html = document.getElementById('appsGrid').innerHTML;
    expect(html).not.toContain('<Bad>');
    expect(html).toContain('&lt;Bad&gt;');
    expect(html).toContain('a&amp;b');
  });
});

// ══ handleConnect ═══════════════════════════════════════════════════════════
describe('handleConnect', () => {
  it('shows a toast and aborts when IP is empty', () => {
    document.getElementById('ipInput').value = '';
    handleConnect();
    expect(document.getElementById('toast').classList.contains('show')).toBe(true);
    expect(appState.ws).toBeNull();
  });
  it('creates a WebSocket when IP is provided', () => {
    document.getElementById('ipInput').value = '192.168.1.100';
    handleConnect();
    expect(appState.ws).toBeInstanceOf(MockWebSocket);
    expect(appState.ws.url).toBe('ws://localhost:3000');
  });
  it('disables the connect button while connecting', () => {
    document.getElementById('ipInput').value = '192.168.1.1';
    handleConnect();
    expect(document.getElementById('connectBtn').disabled).toBe(true);
  });
  it('saves the IP to localStorage', () => {
    document.getElementById('ipInput').value = '10.0.0.5';
    handleConnect();
    expect(localStorage.getItem('tvIP')).toBe('10.0.0.5');
  });
  it('closes an existing connection before opening a new one', () => {
    const oldWs = { close: vi.fn(), readyState: MockWebSocket.OPEN };
    appState.ws = oldWs;
    document.getElementById('ipInput').value = '192.168.1.1';
    handleConnect();
    expect(oldWs.close).toHaveBeenCalled();
  });
  it('sets indicator to connecting', () => {
    document.getElementById('ipInput').value = '192.168.1.1';
    handleConnect();
    expect(document.getElementById('wsIndicator').className).toContain('connecting');
  });
  it('sends connect message with host on WebSocket open', () => {
    document.getElementById('ipInput').value = '192.168.1.55';
    handleConnect();
    appState.ws.readyState = MockWebSocket.OPEN;
    appState.ws.onopen();
    expect(appState.ws.sent[0]).toEqual({ type: 'connect', host: '192.168.1.55' });
  });
  it('re-enables connect button and sets error on socket error', () => {
    document.getElementById('ipInput').value = '192.168.1.1';
    handleConnect();
    appState.ws.onerror();
    expect(document.getElementById('connectBtn').disabled).toBe(false);
    expect(document.getElementById('wsIndicator').className).toContain('error');
  });
  it('re-enables connect button and resets state on socket close', () => {
    document.getElementById('ipInput').value = '192.168.1.1';
    handleConnect();
    appState.ws.onclose();
    expect(document.getElementById('connectBtn').disabled).toBe(false);
    expect(document.getElementById('wsIndicator').className).not.toContain('connected');
  });
  it('routes incoming messages through onMsg', () => {
    document.getElementById('ipInput').value = '192.168.1.1';
    handleConnect();
    // Simulate a powered=true message arriving over the socket
    appState.ws.onmessage({ data: JSON.stringify({ type: 'powered', value: true }) });
    expect(appState.powered).toBe(true);
  });
  it('silently ignores malformed JSON messages', () => {
    document.getElementById('ipInput').value = '192.168.1.1';
    handleConnect();
    expect(() => appState.ws.onmessage({ data: 'not-json' })).not.toThrow();
  });
});

// ══ onMsg ═════════════════════════════════════════════════════════════════
describe('onMsg — secret', () => {
  it('shows the pin panel', () => {
    onMsg({ type: 'secret' });
    expect(document.getElementById('pinPanel').classList.contains('show')).toBe(true);
  });
  it('sets the indicator to pairing', () => {
    onMsg({ type: 'secret' });
    expect(document.getElementById('wsIndicator').className).toContain('pairing');
  });
});

describe('onMsg — ready', () => {
  it('enables the remote', () => {
    onMsg({ type: 'ready' });
    expect(document.getElementById('remote').classList.contains('off')).toBe(false);
  });
  it('sets the indicator to connected', () => {
    onMsg({ type: 'ready' });
    expect(document.getElementById('wsIndicator').className).toContain('connected');
  });
  it('hides the pin panel', () => {
    document.getElementById('pinPanel').classList.add('show');
    onMsg({ type: 'ready' });
    expect(document.getElementById('pinPanel').classList.contains('show')).toBe(false);
  });
  it('enables the Load Apps button', () => {
    onMsg({ type: 'ready' });
    expect(document.getElementById('appsLoadBtn').disabled).toBe(false);
  });
});

describe('onMsg — powered', () => {
  it('adds "on" class to power button when powered=true', () => {
    onMsg({ type: 'powered', value: true });
    expect(document.getElementById('powerBtn').classList.contains('on')).toBe(true);
  });
  it('removes "on" class when powered=false', () => {
    document.getElementById('powerBtn').classList.add('on');
    onMsg({ type: 'powered', value: false });
    expect(document.getElementById('powerBtn').classList.contains('on')).toBe(false);
  });
  it('updates appState.powered', () => {
    onMsg({ type: 'powered', value: true });
    expect(appState.powered).toBe(true);
  });
});

describe('onMsg — volume', () => {
  it('reads level from value.level when present', () => {
    onMsg({ type: 'volume', value: { level: 20, muted: false } });
    expect(appState.vol).toBe(20);
  });
  it('reads value directly when no .level key', () => {
    onMsg({ type: 'volume', value: 12 });
    expect(appState.vol).toBe(12);
  });
  it('shows mute icon when muted=true', () => {
    onMsg({ type: 'volume', value: { level: 5, muted: true } });
    expect(document.getElementById('muteBtn').textContent).toBe('🔇');
  });
  it('shows bell icon when muted=false', () => {
    onMsg({ type: 'volume', value: { level: 5, muted: false } });
    expect(document.getElementById('muteBtn').textContent).toBe('🔔');
  });
});

describe('onMsg — current_app', () => {
  it('stores the app in appState and updates the status bar', () => {
    onMsg({ type: 'current_app', value: 'com.netflix.ninja' });
    expect(appState.app).toBe('com.netflix.ninja');
    expect(document.getElementById('sbApp').textContent).toBe('ninja');
  });
});

describe('onMsg — error', () => {
  it('shows the error message in a toast', () => {
    onMsg({ type: 'error', message: 'Connection refused' });
    expect(document.getElementById('toast').textContent).toBe('Connection refused');
    expect(document.getElementById('toast').classList.contains('show')).toBe(true);
  });
  it('falls back to "Unknown error" when no message', () => {
    onMsg({ type: 'error' });
    expect(document.getElementById('toast').textContent).toBe('Unknown error');
  });
  it('re-enables the connect button', () => {
    document.getElementById('connectBtn').disabled = true;
    onMsg({ type: 'error', message: 'oops' });
    expect(document.getElementById('connectBtn').disabled).toBe(false);
  });
});

describe('onMsg — unpaired', () => {
  it('disables the remote', () => {
    document.getElementById('remote').classList.remove('off');
    onMsg({ type: 'unpaired' });
    expect(document.getElementById('remote').classList.contains('off')).toBe(true);
  });
  it('sets the indicator to error', () => {
    onMsg({ type: 'unpaired' });
    expect(document.getElementById('wsIndicator').className).toContain('error');
  });
});

describe('onMsg — appsLoading', () => {
  it('shows the loading spinner', () => {
    onMsg({ type: 'appsLoading' });
    expect(document.getElementById('appsLoading').classList.contains('show')).toBe(true);
  });
  it('hides the error message', () => {
    document.getElementById('appsErrorMsg').classList.add('show');
    onMsg({ type: 'appsLoading' });
    expect(document.getElementById('appsErrorMsg').classList.contains('show')).toBe(false);
  });
  it('disables the Load Apps button', () => {
    document.getElementById('appsLoadBtn').disabled = false;
    onMsg({ type: 'appsLoading' });
    expect(document.getElementById('appsLoadBtn').disabled).toBe(true);
  });
});

describe('onMsg — apps', () => {
  const LIST = [
    { package: 'com.netflix.ninja', component: 'com.netflix.ninja/.Main', name: 'Netflix', color: '#E50914' },
  ];
  it('hides the loading spinner', () => {
    document.getElementById('appsLoading').classList.add('show');
    onMsg({ type: 'apps', list: LIST });
    expect(document.getElementById('appsLoading').classList.contains('show')).toBe(false);
  });
  it('stores the list in appState.installedApps', () => {
    onMsg({ type: 'apps', list: LIST });
    expect(appState.installedApps).toEqual(LIST);
  });
  it('renders tiles into the grid', () => {
    onMsg({ type: 'apps', list: LIST });
    expect(document.querySelectorAll('.app-tile').length).toBe(1);
  });
  it('shows the copy button', () => {
    onMsg({ type: 'apps', list: LIST });
    expect(document.getElementById('appsCopyBtn').classList.contains('show')).toBe(true);
  });
  it('re-enables the Load Apps button', () => {
    onMsg({ type: 'apps', list: LIST });
    expect(document.getElementById('appsLoadBtn').disabled).toBe(false);
  });
});

describe('onMsg — appsError', () => {
  it('hides the loading spinner', () => {
    document.getElementById('appsLoading').classList.add('show');
    onMsg({ type: 'appsError', message: 'ADB refused' });
    expect(document.getElementById('appsLoading').classList.contains('show')).toBe(false);
  });
  it('shows the ADB note', () => {
    onMsg({ type: 'appsError', message: 'ADB refused' });
    expect(document.getElementById('appsAdbNote').classList.contains('show')).toBe(true);
  });
  it('sets the error message text', () => {
    onMsg({ type: 'appsError', message: 'ADB refused' });
    expect(document.getElementById('appsErrorMsg').textContent).toBe('ADB refused');
    expect(document.getElementById('appsErrorMsg').classList.contains('show')).toBe(true);
  });
  it('re-enables the Load Apps button', () => {
    onMsg({ type: 'appsError', message: 'err' });
    expect(document.getElementById('appsLoadBtn').disabled).toBe(false);
  });
});

// ══ init — event wiring ════════════════════════════════════════════════════
describe('init', () => {
  it('restores a saved IP from localStorage', () => {
    localStorage.setItem('tvIP', '10.10.10.1');
    init();
    expect(document.getElementById('ipInput').value).toBe('10.10.10.1');
  });
  it('does not set ipInput when localStorage has nothing', () => {
    localStorage.removeItem('tvIP');
    document.getElementById('ipInput').value = '';
    init();
    expect(document.getElementById('ipInput').value).toBe('');
  });
  it('triggers handleConnect on Enter in ipInput', () => {
    init();
    document.getElementById('ipInput').value = '';
    document.getElementById('ipInput').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    );
    // empty IP → toast shown (connect aborted, but handler was wired)
    expect(document.getElementById('toast').classList.contains('show')).toBe(true);
  });
  it('triggers sendPin on Enter in pinInput', () => {
    const mockSend = vi.fn();
    appState.ws = { readyState: MockWebSocket.OPEN, send: mockSend };
    document.getElementById('pinInput').value = '112233';
    init();
    document.getElementById('pinInput').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    );
    expect(JSON.parse(mockSend.mock.calls[0][0])).toMatchObject({ type: 'sendCode', code: '112233' });
  });
  it('sends launchApp when an app tile is clicked', () => {
    const mockSend = vi.fn();
    appState.ws = { readyState: MockWebSocket.OPEN, send: mockSend };
    onMsg({
      type: 'apps',
      list: [{ package: 'com.netflix.ninja', component: 'com.netflix.ninja/.Main', name: 'Netflix', color: '#E50914' }],
    });
    init();
    document.querySelector('.app-tile').click();
    expect(JSON.parse(mockSend.mock.calls[0][0])).toEqual({
      type: 'launchApp',
      component: 'com.netflix.ninja/.Main',
    });
  });
});
