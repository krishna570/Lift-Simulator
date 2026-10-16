import { mulberry32, randInt } from './rng.js';
import { ALGORITHMS, callCost, insertStop } from './algorithms.js';

export const DEFAULT_CONFIG = {
  floors: 10, // above-ground floors; the building also has G
  liftCount: 2,
  capacity: 8,
  speed: 1.0, // m/s
  floorHeight: 3.0, // metres between floors
  doorOpen: 2.0, // s
  doorClose: 1.0, // s
  boardTime: 0.4, // s per person boarding or leaving
  algorithm: 'SMART',
  autoMode: false,
  autoRate: 5, // passengers per minute
  morningRush: false,
  simSpeed: 1,
  seed: 20261016,
};

export const START_CLOCK = 10 * 3600; // the queue forms at 10:00 AM
const STARVE_LIMIT = 45; // s before an ignored call is force-reassigned
const HANDOFF_LIMIT = 4; // s after a lift stops planning to serve a call

export function floorLabel(index) {
  return index === 0 ? 'G' : String(index);
}

/** Object.assign copies explicit `undefined`, which would wipe a config key. */
function definedOnly(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

export function formatClock(simSeconds) {
  const total = Math.floor(START_CLOCK + simSeconds);
  let h = Math.floor(total / 3600) % 24;
  const m = Math.floor(total / 60) % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0s';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s ? `${m}m ${s}s` : `${m}m`;
}

class Lift {
  constructor(index, levels, capacity) {
    this.id = index + 1;
    this.name = `Lift ${index + 1}`;
    this.levels = levels;
    this.capacity = capacity;
    this.pos = 0;
    this.floor = 0;
    this.direction = 0; // -1 down, 0 idle, 1 up
    this.state = 'idle'; // idle | moving | doors_open | doors_close | halted
    this.stops = []; // [{floor}] in visit order
    this.carCalls = []; // floors pressed from inside the lift
    this.passengers = []; // request ids riding
    this.doorTimer = 0;
    this.doorOpenTotal = 0;
    this.doorProgress = 0;
    this.halted = false;
    this.recall = false; // sent back to the ground floor, serving nobody else
    this.travel = 0;
    this.trips = 0;
  }

  get statusText() {
    if (this.halted) return 'Stopped';
    if (this.recall) return 'Returning to Ground';
    switch (this.state) {
      case 'moving':
        return this.direction > 0 ? 'Moving Up' : 'Moving Down';
      case 'doors_open':
        return 'Doors Open';
      case 'doors_close':
        return 'Doors Closing';
      default:
        return 'Idle';
    }
  }
}

export class Simulation {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.reset(this.config);
  }

  get levels() {
    return this.config.floors + 1;
  }

  reset(patch = {}) {
    this.config = { ...this.config, ...definedOnly(patch) };
    this.time = 0;
    this.emergency = false;
    this.paused = false;
    this.random = mulberry32(this.config.seed >>> 0);
    this.nextId = 1;
    this.spawnCredit = 0;
    this.requests = [];
    this.byIdMap = new Map();
    this.activeMap = new Map();
    this.servedCount = 0;
    this.cancelledCount = 0;
    this.events = [];
    this.waiting = Array.from({ length: this.levels }, () => []);
    this.hallCalls = new Map(); // `${floor}:${dir}` -> {floor, dir}
    this.lifts = Array.from({ length: this.config.liftCount }, (_, i) => new Lift(i, this.levels, this.config.capacity));
    this.log('system', `Simulation reset - ${this.config.floors} floors, ${this.config.liftCount} lifts, ${this.config.algorithm} dispatch`);
  }

  hardReset() {
    this.reset({ seed: (Math.random() * 1e9) | 0 });
  }

  // ------------------------------------------------------------------ config

  applyConfig(patch) {
    if (patch.algorithm && !ALGORITHMS.includes(patch.algorithm)) throw new Error(`Unknown algorithm ${patch.algorithm}`);
    const rebuild =
      (patch.floors !== undefined && patch.floors !== this.config.floors) ||
      (patch.liftCount !== undefined && patch.liftCount !== this.config.liftCount);
    if (rebuild) {
      this.reset({ ...patch, seed: (Math.random() * 1e9) | 0 });
      return { rebuilt: true };
    }
    Object.assign(this.config, definedOnly(patch));
    for (const lift of this.lifts) lift.capacity = this.config.capacity;
    return { rebuilt: false };
  }

  // -------------------------------------------------------------------- time

  step(dt) {
    if (this.paused) return;
    const scaled = dt * this.config.simSpeed;
    this.time += scaled;

    if (this.emergency) {
      for (const lift of this.lifts) {
        lift.state = 'halted';
        lift.doorProgress = 0;
      }
      return;
    }

    if (this.config.autoMode) this.generatePassengers(scaled);
    this.dispatch();
    for (const lift of this.lifts) this.updateLift(lift, scaled);
    this.reassignStarved();
  }

  updateLift(lift, dt) {
    if (lift.halted) {
      lift.state = 'halted';
      return;
    }
    let guard = 0;
    while (guard++ < 64) {
      const before = lift.state;
      if (lift.state === 'doors_open') {
        lift.doorTimer -= dt;
        lift.doorProgress = Math.max(0, Math.min(1, 1 - lift.doorTimer / Math.max(0.1, lift.doorOpenTotal)));
        if (lift.doorTimer > 0) return;
        lift.state = 'doors_close';
        lift.doorTimer = this.config.doorClose;
        lift.doorProgress = 0;
        return;
      }

      if (lift.state === 'doors_close') {
        lift.doorTimer -= dt;
        lift.doorProgress = Math.max(0, Math.min(1, 1 - lift.doorTimer / this.config.doorClose));
        if (lift.doorTimer > 0) return;
        lift.doorProgress = 0;
        this.departOrIdle(lift);
        if (lift.state === 'idle' || lift.state === 'moving') return;
        continue;
      }

      if (lift.state === 'idle') {
        this.departOrIdle(lift);
        if (lift.state === 'idle') return;
        if (lift.state === 'moving') break;
        continue;
      }

      // moving
      const target = lift.stops[0];
      if (!target) {
        this.departOrIdle(lift);
        if (lift.state !== 'moving') return;
        continue;
      }
      const floorsPerSecond = this.config.speed / this.config.floorHeight;
      const remaining = (target.floor - lift.pos) * lift.direction;
      const move = floorsPerSecond * dt;

      if (remaining <= move) {
        lift.travel += Math.abs(target.floor - lift.pos) * this.config.floorHeight;
        lift.pos = target.floor;
        lift.floor = target.floor;
        this.arrive(lift, target.floor);
        continue;
      }

      lift.pos += lift.direction * move;
      lift.travel += move * this.config.floorHeight;
      lift.floor = Math.round(lift.pos);
      return;
    }
  }

  departOrIdle(lift) {
    if (!lift.stops.length) {
      lift.state = 'idle';
      lift.direction = 0;
      return;
    }
    const next = lift.stops[0].floor;
    if (next === lift.pos) {
      this.arrive(lift, next);
      return;
    }
    lift.direction = Math.sign(next - lift.pos);
    lift.state = 'moving';
  }

  arrive(lift, floor) {
    lift.stops = lift.stops.filter((s) => s.floor !== floor);
    lift.trips += 1;

    const riding = new Set(lift.passengers);
    let alighted = 0;
    for (const id of lift.passengers) {
      const req = this.byIdMap.get(id);
      if (!req || req.dest !== floor) continue;
      req.status = 'served';
      req.droppedAt = this.time;
      req.journey = this.time - (req.pickedAt ?? req.createdAt);
      this.servedCount += 1;
      this.activeMap.delete(req.id);
      riding.delete(id);
      alighted += 1;
      this.log('served', `${req.name} exited ${lift.name} at ${floorLabel(floor)} after ${formatDuration(req.waited)} wait`);
    }
    lift.passengers = [...riding];

    const queue = this.waiting[floor] ?? [];
    const stayers = [];
    let boarded = 0;
    for (const req of queue) {
      const wanted = req.assignedLift === lift.id && !lift.recall;
      if (!wanted || !this.activeMap.has(req.id) || lift.passengers.length >= lift.capacity) {        stayers.push(req);
        continue;
      }
      req.status = 'in_progress';
      req.pickedAt = this.time;
      req.waited = this.time - req.createdAt;
      req.onBoard = lift.id;
      lift.passengers.push(req.id);
      boarded += 1;
      this.dropHallCall(req);
      insertStop(lift, req.dest, this.config.algorithm);
      this.log('board', `${req.name} boarded ${lift.name} for ${floorLabel(req.dest)} (waited ${formatDuration(req.waited)})`);
    }
    this.waiting[floor] = stayers;

    const carStops = lift.carCalls.filter((f) => f === floor).length;
    lift.carCalls = lift.carCalls.filter((f) => f !== floor);

    if (lift.recall && floor === 0) {
      lift.recall = false;
      lift.stops = [];
      lift.carCalls = [];
      this.log('system', `${lift.name} parked at ground floor`);
    }

    lift.doorOpenTotal = this.config.doorOpen + (alighted + boarded + carStops) * this.config.boardTime;
    lift.doorTimer = lift.doorOpenTotal;
    lift.state = 'doors_open';
    lift.doorProgress = 0;
  }

  // -------------------------------------------------------------- dispatching

  /** Hand every unassigned waiting request to the best lift. */
  dispatch() {
    for (const req of this.activeMap.values()) {
      if (req.status !== 'waiting' || req.assignedLift) continue;
      const call = { floor: req.from, dir: req.dir, age: this.time - req.createdAt };
      let best = null;
      let bestCost = Infinity;
      for (const lift of this.lifts) {
        const cost = callCost(lift, call, this.config.algorithm);
        if (cost < bestCost) {
          bestCost = cost;
          best = lift;
        }
      }
      if (!best || !Number.isFinite(bestCost)) continue;
      req.assignedLift = best.id;
      insertStop(best, req.from, this.config.algorithm);
    }
  }

  /** A lift that reversed or overshot hands its calls back to the pool. */
  reassignStarved() {
    for (const req of this.activeMap.values()) {
      if (req.status !== 'waiting') continue;
      const age = this.time - req.createdAt;
      const lift = req.assignedLift ? this.liftById(req.assignedLift) : null;
      const planned = lift && (lift.stops.some((s) => s.floor === req.from) || Math.abs(lift.pos - req.from) < 0.01);
      if (!lift || lift.halted || !planned || age > STARVE_LIMIT) {
        req.assignedLift = null;
      }
    }
  }

  dropHallCall(req) {
    const stillWaiting = this.waiting[req.from]?.some((r) => r.dir === req.dir && r.status === 'waiting');
    if (!stillWaiting) this.hallCalls.delete(`${req.from}:${req.dir}`);
  }

  rebuildHallCalls() {
    this.hallCalls = new Map();
    for (const floor of this.waiting) {
      for (const req of floor) {
        if (req.status !== 'waiting') continue;
        this.hallCalls.set(`${req.from}:${req.dir}`, { floor: req.from, dir: req.dir });
      }
    }
  }

  // ----------------------------------------------------------------- requests

  addRequest(from, to, options = {}) {
    if (from === to || from < 0 || from >= this.levels || to < 0 || to >= this.levels) return null;
    const id = this.nextId++;
    const req = {
      id,
      name: options.name ?? `P-${String(id).padStart(3, '0')}`,
      from,
      to,
      dest: to,
      dir: Math.sign(to - from),
      createdAt: this.time,
      assignedLift: null,
      pickedAt: null,
      droppedAt: null,
      waited: 0,
      journey: null,
      status: 'waiting',
      manual: !!options.manual,
    };
    this.requests.push(req);
    this.byIdMap.set(id, req);
    this.activeMap.set(id, req);
    this.waiting[from].push(req);
    this.hallCalls.set(`${from}:${req.dir}`, { floor: from, dir: req.dir });
    this.log('request', `${req.name} called ${req.dir > 0 ? 'up' : 'down'} at ${floorLabel(from)} for ${floorLabel(to)}`);
    return req;
  }

  /** Hall-button press with no known destination: invent a plausible one. */
  addHallCall(floor, dir) {
    const options = [];
    for (let f = 0; f < this.levels; f++) {
      if (f === floor) continue;
      if (dir > 0 && f > floor) options.push(f);
      if (dir < 0 && f < floor) options.push(f);
    }
    if (!options.length) {
      for (let f = 0; f < this.levels; f++) if (f !== floor) options.push(f);
    }
    const to = options[Math.floor(this.random() * options.length)];
    return this.addRequest(floor, to, { manual: true });
  }

  /** Floor button pressed inside a lift. */
  addCarCall(liftId, floor) {
    const lift = this.liftById(liftId);
    if (!lift || floor < 0 || floor >= this.levels) return null;
    if (!lift.carCalls.includes(floor)) lift.carCalls.push(floor);
    if (!lift.halted && !lift.recall) insertStop(lift, floor, this.config.algorithm);
    this.log('car', `${lift.name}: destination ${floorLabel(floor)} selected`);
    return lift;
  }

  liftById(id) {
    return this.lifts.find((l) => l.id === id);
  }

  // -------------------------------------------------------------- generators

  generatePassengers(dt) {
    this.spawnCredit += (this.config.autoRate / 60) * dt;
    let guard = 0;
    while (this.spawnCredit >= 1 && guard++ < 60) {
      this.spawnCredit -= 1;
      const [from, to] = this.pickTrip();
      this.addRequest(from, to);
    }
  }

  pickTrip() {
    const top = this.levels - 1;
    if (this.config.morningRush && this.random() < 0.78) return [0, randInt(this.random, 1, top)];
    if (this.config.morningRush && this.random() < 0.5) return [randInt(this.random, 1, top), 0];

    const weights = [];
    const mid = Math.round(top / 2);
    for (let f = 0; f < this.levels; f++) weights.push(f === 0 ? 5 : 1 + Math.max(0, 4 - Math.abs(f - mid)) * 0.4);
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.random() * total;
    let from = 0;
    for (let f = 0; f < weights.length; f++) {
      r -= weights[f];
      if (r <= 0) {
        from = f;
        break;
      }
    }
    let to = randInt(this.random, 0, top);
    if (to === from) to = (from + 1 + Math.floor(this.random() * (this.levels - 1))) % this.levels;
    return [from, to];
  }

  // -------------------------------------------------------------------- stats

  get stats() {
    const done = this.requests.filter((r) => r.status === 'served');
    const waits = done.map((r) => r.waited ?? 0);
    const avgWait = waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : 0;
    const longestServed = waits.length ? Math.max(...waits) : 0;
    const queued = [...this.activeMap.values()].filter((r) => r.status === 'waiting');
    const currentLongest = queued.length ? Math.max(...queued.map((r) => this.time - r.createdAt)) : 0;
    return {
      served: this.servedCount,
      totalRequests: this.requests.length,
      waiting: queued.length,
      riding: this.lifts.reduce((a, l) => a + l.passengers.length, 0),
      avgWait,
      longestServed,
      currentLongest,
      longestWait: Math.max(longestServed, currentLongest),
      cancelled: this.cancelledCount,
    };
  }

  trendSeries() {
    const buckets = new Map();
    for (const r of this.requests) {
      if (r.status !== 'served') continue;
      const m = Math.floor((r.pickedAt ?? r.createdAt) / 60);
      if (!buckets.has(m)) buckets.set(m, []);
      buckets.get(m).push(r.waited ?? 0);
    }
    const series = [...buckets.keys()]
      .sort((a, b) => a - b)
      .map((m) => ({
        minute: m,
        avg: buckets.get(m).reduce((a, b) => a + b, 0) / buckets.get(m).length,
        longest: Math.max(...buckets.get(m)),
        served: buckets.get(m).length,
      }));
    return series.slice(-14);
  }

  // ----------------------------------------------------------------- controls

  setAutoMode(on, rate) {
    this.config.autoMode = !!on;
    if (rate !== undefined) this.config.autoRate = Math.max(0, Math.min(60, Number(rate)));
    this.log('system', `Auto mode ${this.config.autoMode ? `ON at ${this.config.autoRate} passengers/min` : 'OFF'}`);
  }

  emergencyStop() {
    this.emergency = true;
    for (const lift of this.lifts) {
      lift.halted = true;
      lift.state = 'halted';
      lift.doorTimer = 0;
      lift.doorProgress = 0;
    }
    this.log('alert', 'EMERGENCY STOP - all lifts halted');
  }

  releaseEmergency() {
    this.emergency = false;
    for (const lift of this.lifts) {
      lift.halted = false;
      lift.recall = false;
      lift.state = 'idle';
      this.departOrIdle(lift);
    }
    this.log('system', 'Emergency cleared - lifts released');
  }

  sendAllToGround() {
    this.emergency = false;
    for (const lift of this.lifts) {
      for (const id of lift.passengers) {
        const req = this.byIdMap.get(id);
        if (req && req.status === 'in_progress') {
          req.status = 'cancelled';
          this.cancelledCount += 1;
          this.activeMap.delete(req.id);
        }
      }
      for (const req of this.activeMap.values()) if (req.assignedLift === lift.id) req.assignedLift = null;
      lift.passengers = [];
      lift.carCalls = [];
      lift.stops = [{ floor: 0 }];
      lift.halted = false;
      lift.recall = true;
      lift.state = 'idle';
      this.departOrIdle(lift);
    }
    this.log('alert', 'All lifts recalled to the ground floor');
  }

  stopLift(liftId) {
    const lift = this.liftById(liftId);
    if (!lift) return null;
    lift.halted = !lift.halted;
    if (lift.halted) {
      lift.state = 'halted';
      this.log('alert', `${lift.name} stopped by the operator`);
    } else {
      lift.state = 'idle';
      this.log('system', `${lift.name} resumed`);
      this.departOrIdle(lift);
    }
    return lift;
  }

  log(type, text) {
    this.events.unshift({ t: this.time, clock: formatClock(this.time), type, text });
    if (this.events.length > 80) this.events.length = 80;
  }

  // ----------------------------------------------------------------- snapshot

  snapshot() {
    const stats = this.stats;
    this.rebuildHallCalls();
    return {
      time: this.time,
      clock: formatClock(this.time),
      running: !this.paused && !this.emergency,
      paused: this.paused,
      emergency: this.emergency,
      config: { ...this.config },
      algorithms: ALGORITHMS,
      levels: this.levels,
      floorLabels: Array.from({ length: this.levels }, (_, i) => floorLabel(i)),
      stats: {
        ...stats,
        avgWaitText: formatDuration(stats.avgWait),
        longestWaitText: formatDuration(stats.longestWait),
        currentLongestText: formatDuration(stats.currentLongest),
        trend: this.trendSeries(),
      },
      hallCalls: [...this.hallCalls.values()].map((c) => ({
        floor: c.floor,
        dir: c.dir,
        count: this.waiting[c.floor].filter((r) => r.dir === c.dir && r.status === 'waiting').length,
        assigned: [...new Set(this.waiting[c.floor].filter((r) => r.dir === c.dir && r.assignedLift).map((r) => r.assignedLift))],
      })),
      lifts: this.lifts.map((lift) => ({
        id: lift.id,
        name: lift.name,
        floor: lift.floor,
        pos: lift.pos,
        state: lift.state,
        status: lift.statusText,
        direction: lift.direction,
        doorProgress: lift.doorProgress,
        capacity: lift.capacity,
        load: lift.passengers.length,
        passengers: lift.passengers.map((id) => this.byIdMap.get(id)).filter(Boolean).map((r) => ({ id: r.id, dest: r.dest, label: floorLabel(r.dest) })),
        stops: lift.stops.map((s) => s.floor),
        carCalls: [...lift.carCalls],
        trips: lift.trips,
        travel: lift.travel,
        halted: lift.halted,
        recall: lift.recall,
      })),
      requests: this.requests.slice(-40).reverse().map((r) => this.requestView(r)),
      requestCount: this.requests.length,
      events: this.events.slice(0, 25),
    };
  }

  requestView(r) {
    const waited = r.status === 'served' ? r.waited : this.time - r.createdAt;
    return {
      id: r.id,
      name: r.name,
      from: r.from,
      to: r.to,
      fromLabel: floorLabel(r.from),
      toLabel: floorLabel(r.to),
      dir: r.dir,
      status: r.status,
      assignedLift: r.assignedLift,
      createdAt: r.createdAt,
      createdClock: formatClock(r.createdAt),
      waited,
      waitedText: formatDuration(waited),
      journey: r.journey,
    };
  }

  listRequests({ page = 1, size = 10, status = 'all', query = '' } = {}) {
    const q = String(query).trim().toLowerCase();
    let rows = this.requests.slice().reverse();
    if (status && status !== 'all') rows = rows.filter((r) => r.status === status);
    if (q) {
      rows = rows.filter(
        (r) =>
          String(r.id).includes(q) ||
          floorLabel(r.from).toLowerCase().includes(q) ||
          floorLabel(r.to).toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q),
      );
    }
    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / size));
    const safePage = Math.min(Math.max(1, Number(page) || 1), pages);
    const start = (safePage - 1) * size;
    return { total, page: safePage, pages, rows: rows.slice(start, start + size).map((r) => this.requestView(r)) };
  }
}
