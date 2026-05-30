// ── State ──────────────────────────────────────────────────────────────────
export const appState = {
  ws: null,
  powered: null,
  vol: null,
  muted: false,
  app: null,
  installedApps: [],
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

  document.getElementById('sbVol').textContent =
    appState.vol != null ? (appState.muted ? `${appState.vol} ✕` : `${appState.vol}`) : '—';
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
      document.getElementById('appsLoadBtn').disabled = false;
      break;

    case 'powered':
      appState.powered = m.value;
      document.getElementById('powerBtn').classList.toggle('on', !!m.value);
      updateSB();
      break;

    case 'volume':
      appState.vol   = m.value?.level ?? m.value;
      appState.muted = m.value?.muted ?? false;
      document.getElementById('muteBtn').textContent = appState.muted ? '🔇' : '🔔';
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

    case 'appsLoading':
      document.getElementById('appsLoading').classList.add('show');
      document.getElementById('appsErrorMsg').classList.remove('show');
      document.getElementById('appsLoadBtn').disabled = true;
      break;

    case 'apps':
      document.getElementById('appsLoading').classList.remove('show');
      document.getElementById('appsAdbNote').classList.remove('show');
      document.getElementById('appsLoadBtn').disabled = false;
      appState.installedApps = m.list;
      renderApps(m.list);
      document.getElementById('appsCopyBtn').classList.add('show');
      break;

    case 'appsError':
      document.getElementById('appsLoading').classList.remove('show');
      document.getElementById('appsLoadBtn').disabled = false;
      document.getElementById('appsAdbNote').classList.add('show');
      const errEl = document.getElementById('appsErrorMsg');
      errEl.textContent = m.message;
      errEl.classList.add('show');
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

// ── Apps ───────────────────────────────────────────────────────────────────
export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function loadApps() {
  send({ type: 'getApps' });
}

export function copyPackageList() {
  const text = appState.installedApps.map(a => `${a.package} -> ${a.name}`).join('\n');
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('appsCopyBtn');
    btn.classList.add('copied');
    btn.querySelector('svg').style.display = 'none';
    btn.childNodes[btn.childNodes.length - 1].textContent = ' Copied!';
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.querySelector('svg').style.display = '';
      btn.childNodes[btn.childNodes.length - 1].textContent = ' Copy list';
    }, 2000);
  });
}

export function renderApps(list) {
  const grid = document.getElementById('appsGrid');
  if (!list.length) {
    grid.innerHTML = '<div style="font-size:12px;color:var(--t3);padding:12px 0">No apps found</div>';
    return;
  }
  grid.innerHTML = list.map(app => `
    <div class="app-tile" data-component="${esc(app.component)}" title="${esc(app.package)}">
      <div class="app-icon" style="background:${esc(app.color)}">${esc(app.name.charAt(0))}</div>
      <span class="app-name">${esc(app.name)}</span>
    </div>
  `).join('');
}

// ── Init (event listeners + localStorage restore) ─────────────────────────
export function init() {
  document.getElementById('appsGrid').addEventListener('click', e => {
    const tile = e.target.closest('.app-tile');
    if (tile?.dataset.component) send({ type: 'launchApp', component: tile.dataset.component });
  });

  document.getElementById('ipInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleConnect();
  });

  document.getElementById('pinInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') sendPin();
  });

  const saved = localStorage.getItem('tvIP');
  if (saved) document.getElementById('ipInput').value = saved;
}
