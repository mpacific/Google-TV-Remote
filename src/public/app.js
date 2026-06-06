// ── State ──────────────────────────────────────────────────────────────────
export const appState = {
  ws: null,
  powered: null,
  app: null,
};

// ── UI helpers ─────────────────────────────────────────────────────────────
export function setIndicator(cls) {
  document.getElementById('wsIndicator').className = 'ws-indicator ' + cls;
}

export function setHint(msg, live) {
  const el = document.getElementById('statusHint');
  el.textContent = msg;
  el.className = 'status-hint' + (live ? ' live' : '');
}

export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 4500);
}

export function setRemoteEnabled(on) {
  document.getElementById('remote').classList.toggle('off', !on);
}

export function updateSB() {
  const app = appState.app || '';
  document.getElementById('sbApp').textContent = app
    ? (app.includes('.') ? app.split('.').pop() : app)
    : '—';

  const pe = document.getElementById('sbPwr');
  if (appState.powered === true)       { pe.textContent = 'ON';  pe.className = 'sb-val on'; }
  else if (appState.powered === false) { pe.textContent = 'OFF'; pe.className = 'sb-val'; }
  else                                 { pe.textContent = '—';   pe.className = 'sb-val'; }
}

// ── Connect ────────────────────────────────────────────────────────────────
export function handleConnect() {
  const host = document.getElementById('ipInput').value.trim();
  if (!host) { toast('Enter the TV IP address first'); return; }

  if (appState.ws) { appState.ws.close(); appState.ws = null; }
  setRemoteEnabled(false);
  setIndicator('connecting');
  setHint('Connecting…', true);
  document.getElementById('connectBtn').disabled = true;
  localStorage.setItem('tvIP', host);

  try {
    appState.ws = new WebSocket('ws://localhost:3000');

    appState.ws.onopen = () => {
      setHint('Reaching TV…', true);
      appState.ws.send(JSON.stringify({ type: 'connect', host }));
    };

    appState.ws.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      onMsg(m);
    };

    appState.ws.onclose = () => {
      setRemoteEnabled(false);
      setIndicator('');
      setHint('Disconnected');
      document.getElementById('pinPanel').classList.remove('show');
      document.getElementById('connectBtn').disabled = false;
    };

    appState.ws.onerror = () => {
      setIndicator('error');
      setHint('Could not reach server');
      toast('Cannot connect — is the server running?');
      document.getElementById('connectBtn').disabled = false;
    };
  } catch (e) {
    setIndicator('error');
    toast(e.message);
    document.getElementById('connectBtn').disabled = false;
  }
}

// ── Message handler ────────────────────────────────────────────────────────
export function onMsg(m) {
  switch (m.type) {
    case 'secret':
      setIndicator('pairing');
      setHint('Check your TV — enter the PIN shown', true);
      document.getElementById('pinPanel').classList.add('show');
      document.getElementById('pinInput').focus();
      break;

    case 'ready':
      setRemoteEnabled(true);
      setIndicator('connected');
      setHint(`Connected · ${document.getElementById('ipInput').value.trim()}`, true);
      document.getElementById('pinPanel').classList.remove('show');
      document.getElementById('connectBtn').disabled = false;
      break;

    case 'powered':
      appState.powered = m.value;
      document.getElementById('powerBtn').classList.toggle('on', !!m.value);
      updateSB();
      break;

    case 'current_app':
      appState.app = m.value;
      updateSB();
      break;

    case 'error':
      toast(m.message || 'Unknown error');
      setIndicator('error');
      setHint('Error');
      document.getElementById('connectBtn').disabled = false;
      break;

    case 'unpaired':
      setRemoteEnabled(false);
      setIndicator('error');
      setHint('Unpaired — reconnect to pair again');
      document.getElementById('connectBtn').disabled = false;
      break;
  }
}

// ── Send helpers ───────────────────────────────────────────────────────────
export function send(msg) {
  if (appState.ws?.readyState === WebSocket.OPEN) appState.ws.send(JSON.stringify(msg));
}

export function k(key) { send({ type: 'sendKey', key }); }

export function sendPower() { send({ type: 'sendPower' }); }

export function sendPin() {
  const code = document.getElementById('pinInput').value.trim();
  if (!code) return;
  send({ type: 'sendCode', code });
  document.getElementById('pinInput').value = '';
  setHint('Verifying PIN…', true);
}

// ── Init (event listeners + localStorage restore) ─────────────────────────
export function init() {
  document.getElementById('ipInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleConnect();
  });

  document.getElementById('pinInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') sendPin();
  });

  const saved = localStorage.getItem('tvIP');
  if (saved) document.getElementById('ipInput').value = saved;
}
