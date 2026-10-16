import { icon } from './icons.js';
import { store, subscribe, connect, api, toast } from './store.js';
import { createDashboard } from './views/dashboard.js';
import { createSimulation } from './views/simulation.js';
import { createStatistics } from './views/statistics.js';
import { createRequests } from './views/requests.js';
import { createSettings } from './views/settings.js';
import { createEmergency } from './views/emergency.js';

const ROUTES = {
  dashboard: { title: 'Dashboard', subtitle: "Welcome back! Here's what's happening in your building.", create: createDashboard },
  simulation: { title: 'Simulation', subtitle: 'Control the lifts, call floors and watch the movement.', create: createSimulation },
  statistics: { title: 'Statistics', subtitle: 'Analyse performance, waiting times and compare algorithms.', create: createStatistics },
  requests: { title: 'Requests', subtitle: 'View and manage all passenger requests in real time.', create: createRequests },
  settings: { title: 'Settings', subtitle: 'Configure building and lift parameters.', create: createSettings },
  emergency: { title: 'Emergency', subtitle: 'Use these controls in case of emergency.', create: createEmergency },
};

const nav = document.getElementById('nav');
const viewBox = document.getElementById('view');
const titleEl = document.getElementById('page-title');
const subtitleEl = document.getElementById('page-subtitle');
const clockEl = document.getElementById('sim-clock');
const dateEl = document.getElementById('sim-date');
const pillEl = document.getElementById('status-pill');
const pauseBtn = document.getElementById('pause-btn');

nav.innerHTML = Object.entries(ROUTES)
  .map(
    ([key, r]) => `<a class="nav-item" href="#/${key}" data-route="${key}">${icon(key === 'requests' ? 'list' : key)}<span>${r.title}</span></a>`,
  )
  .join('');

const instances = new Map();
let current = null;

const ctx = {
  state: () => store.state,
  setSubtitle: (text) => {
    if (subtitleEl.dataset.override !== text) {
      subtitleEl.dataset.override = text;
      subtitleEl.textContent = text;
    }
  },
};

function routeFromHash() {
  const key = (location.hash.replace(/^#\//, '') || 'dashboard').split('?')[0];
  return ROUTES[key] ? key : 'dashboard';
}

function show(key) {
  current = key;
  const route = ROUTES[key];
  titleEl.textContent = route.title;
  subtitleEl.dataset.override = '';
  subtitleEl.textContent = route.subtitle;
  nav.querySelectorAll('.nav-item').forEach((a) => a.classList.toggle('active', a.dataset.route === key));
  document.body.classList.remove('nav-open');

  let instance = instances.get(key);
  if (!instance) {
    instance = route.create(ctx);
    instances.set(key, instance);
  }
  viewBox.replaceChildren(instance.el);
  if (store.state) instance.update(store.state);
}

dateEl.textContent = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

subscribe((state) => {
  clockEl.textContent = state.clock;
  const emergency = state.emergency;
  const paused = state.paused;
  const label = !store.connected
    ? 'Reconnecting…'
    : emergency
      ? 'EMERGENCY STOP'
      : paused
        ? 'Paused'
        : 'System Running';
  pillEl.className = `pill ${!store.connected || emergency ? 'alert' : paused ? 'paused' : 'pill-live'}`;
  pillEl.innerHTML = `<i></i><span>${label}</span>`;
  pauseBtn.classList.toggle('on', paused);
  pauseBtn.title = paused ? 'Resume the simulation' : 'Pause the simulation';
  instances.get(current)?.update(state);
});

pauseBtn.onclick = async () => {
  const res = await api.pause(!store.state?.paused);
  toast(res.snapshot.paused ? 'Simulation paused' : 'Simulation resumed');
};

document.getElementById('menu-toggle').onclick = () => document.body.classList.toggle('nav-open');

window.addEventListener('hashchange', () => show(routeFromHash()));
show(routeFromHash());
connect();

window.addEventListener('offline', () => toast('Connection lost - reconnecting…', 'error'));
