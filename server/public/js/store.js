/** Live state store: socket snapshots + REST commands + toast helper. */

export const store = {
  state: null,
  comparison: null,
  connected: false,
  listeners: new Set(),
};

export function subscribe(fn) {
  store.listeners.add(fn);
  if (store.state) fn(store.state);
  return () => store.listeners.delete(fn);
}

function emit() {
  for (const fn of store.listeners) fn(store.state);
}

export async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

export async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    toast(data.error || 'Request failed', 'error');
    throw new Error(data.error || res.statusText);
  }
  if (data.snapshot) {
    store.state = data.snapshot;
    emit();
  }
  return data;
}

export function toast(text, kind = 'ok') {
  const stack = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind === 'error' ? 'error' : ''}`;
  el.textContent = text;
  stack.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => el.remove(), 320);
  }, 2600);
}

let socket = null;

export function connect() {
  if (typeof io === 'undefined') {
    // socket.io client failed to load - fall back to polling
    setInterval(async () => {
      try {
        store.state = await get('/api/state');
        store.connected = true;
        emit();
      } catch {
        store.connected = false;
      }
    }, 500);
    return;
  }
  socket = io({ transports: ['websocket', 'polling'] });
  socket.on('snapshot', (snapshot) => {
    store.state = snapshot;
    store.connected = true;
    emit();
  });
  socket.on('disconnect', () => {
    store.connected = false;
  });
}

/* ---------------------------------------------------------- command API */

export const api = {
  hallCall: (floor, dir) => post('/api/call/hall', { floor, dir }),
  carCall: (liftId, floor) => post('/api/call/car', { liftId, floor }),
  request: (from, to) => post('/api/request', { from, to }),
  settings: (patch) => post('/api/settings', patch),
  auto: (on, rate) => post('/api/auto', { on, rate }),
  pause: (paused) => post('/api/pause', { paused }),
  reset: () => post('/api/reset', {}),
  stopLift: (id) => post(`/api/lift/${id}/stop`, {}),
  emergency: (action) => post('/api/emergency', { action }),
  requests: (params) => get(`/api/requests?${new URLSearchParams(params)}`),
  comparison: (params) => get(`/api/comparison?${new URLSearchParams(params)}`),
};
