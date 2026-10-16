import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import http from 'node:http';
import { Server } from 'socket.io';
import { Simulation, formatDuration } from './engine/simulation.js';
import { ALGORITHMS } from './engine/algorithms.js';
import { compareAlgorithms } from './engine/comparison.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const TICK_MS = 50; // 20 Hz physics
const PUSH_MS = 100; // 10 Hz UI updates

const sim = new Simulation({ autoMode: true, autoRate: 5 });
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true } });

const num = (v, fallback) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? fallback : Number(v));
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function ok(res, payload) {
  res.json({ ok: true, ...payload });
}
function fail(res, message, code = 400) {
  res.status(code).json({ ok: false, error: message });
}

app.get('/api/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

app.get('/api/state', (_req, res) => res.json(sim.snapshot()));

app.get('/api/stats', (_req, res) => {
  const s = sim.stats;
  res.json({
    ok: true,
    served: s.served,
    totalRequests: s.totalRequests,
    waiting: s.waiting,
    riding: s.riding,
    avgWait: s.avgWait,
    avgWaitText: formatDuration(s.avgWait),
    longestWait: s.longestWait,
    longestWaitText: formatDuration(s.longestWait),
    trend: sim.trendSeries(),
  });
});

app.get('/api/requests', (req, res) => {
  const list = sim.listRequests({
    page: num(req.query.page, 1),
    size: clamp(num(req.query.size, 10), 5, 100),
    status: String(req.query.status || 'all'),
    query: String(req.query.q || ''),
  });
  res.json({ ok: true, ...list });
});

app.get('/api/comparison', (req, res) => {
  const minutes = clamp(num(req.query.minutes, 5), 1, 20);
  const rate = clamp(num(req.query.rate, 12), 1, 60);
  res.json({ ok: true, ...compareAlgorithms({ minutes, rate, floors: sim.config.floors, liftCount: sim.config.liftCount, capacity: sim.config.capacity, speed: sim.config.speed }) });
});

/** Press an up/down button on a floor. */
app.post('/api/call/hall', (req, res) => {
  const floor = clamp(num(req.body?.floor, NaN), 0, sim.levels - 1);
  const dir = Number(req.body?.dir) >= 0 ? 1 : -1;
  if (Number.isNaN(floor)) return fail(res, 'floor is required');
  const call = sim.addHallCall(floor, dir);
  if (!call) return fail(res, 'that call does not make sense');
  ok(res, { request: sim.requestView(call), snapshot: sim.snapshot() });
});

/** Press a destination inside a lift car. */
app.post('/api/call/car', (req, res) => {
  const liftId = num(req.body?.liftId, NaN);
  const floor = num(req.body?.floor, NaN);
  if (Number.isNaN(liftId) || Number.isNaN(floor)) return fail(res, 'liftId and floor are required');
  if (!sim.liftById(liftId)) return fail(res, `no lift ${liftId}`, 404);
  sim.addCarCall(liftId, clamp(floor, 0, sim.levels - 1));
  ok(res, { snapshot: sim.snapshot() });
});

/** Queue an explicit from -> to trip (used by the requests page + tests). */
app.post('/api/request', (req, res) => {
  const from = num(req.body?.from, NaN);
  const to = num(req.body?.to, NaN);
  if (Number.isNaN(from) || Number.isNaN(to)) return fail(res, 'from and to are required');
  const call = sim.addRequest(clamp(from, 0, sim.levels - 1), clamp(to, 0, sim.levels - 1), { manual: true });
  if (!call) return fail(res, 'origin and destination must differ');
  ok(res, { request: sim.requestView(call) });
});

app.post('/api/settings', (req, res) => {
  const b = req.body || {};
  let result;
  try {
    result = sim.applyConfig({
      floors: clamp(num(b.floors, sim.config.floors), 2, 30),
      liftCount: clamp(num(b.liftCount, sim.config.liftCount), 1, 6),
      capacity: clamp(num(b.capacity, sim.config.capacity), 1, 30),
      speed: clamp(num(b.speed, sim.config.speed), 0.2, 5),
      algorithm: b.algorithm && ALGORITHMS.includes(String(b.algorithm).toUpperCase()) ? String(b.algorithm).toUpperCase() : undefined,
      morningRush: typeof b.morningRush === 'boolean' ? b.morningRush : undefined,
      simSpeed: clamp(num(b.simSpeed, sim.config.simSpeed), 0.25, 20),
    });
  } catch (err) {
    return fail(res, err.message);
  }
  ok(res, { rebuilt: result.rebuilt, snapshot: sim.snapshot() });
});

app.post('/api/auto', (req, res) => {
  const b = req.body || {};
  sim.setAutoMode(b.on ?? !sim.config.autoMode, b.rate);
  ok(res, { snapshot: sim.snapshot() });
});

app.post('/api/pause', (req, res) => {
  sim.paused = req.body?.paused ?? !sim.paused;
  ok(res, { snapshot: sim.snapshot() });
});

app.post('/api/reset', (_req, res) => {
  sim.hardReset();
  ok(res, { snapshot: sim.snapshot() });
});

app.post('/api/lift/:id/stop', (req, res) => {
  const lift = sim.stopLift(Number(req.params.id));
  if (!lift) return fail(res, `no lift ${req.params.id}`, 404);
  ok(res, { snapshot: sim.snapshot() });
});

app.post('/api/emergency', (req, res) => {
  const action = String(req.body?.action || '');
  if (action === 'stop') sim.emergencyStop();
  else if (action === 'release') sim.releaseEmergency();
  else if (action === 'ground') sim.sendAllToGround();
  else return fail(res, 'action must be stop, release or ground');
  ok(res, { snapshot: sim.snapshot() });
});

io.on('connection', (socket) => {
  socket.emit('snapshot', sim.snapshot());
});

let lastPush = 0;
setInterval(() => {
  const now = Date.now();
  sim.step(TICK_MS / 1000);
  if (now - lastPush >= PUSH_MS) {
    lastPush = now;
    io.emit('snapshot', sim.snapshot());
  }
}, TICK_MS);

server.listen(PORT, () => {
  console.log(`\n  Lift Controller Simulator`);
  console.log(`  API      http://localhost:${PORT}/api/state`);
  console.log(`  Dashboard http://localhost:${PORT}\n`);
});
