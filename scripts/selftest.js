/**
 * Engine self-test: `npm run selftest`
 * Covers the judge checks - burst of manual calls all served, and a 2 minute
 * high-rate auto run with a sane longest waiting time.
 */
import { Simulation, DEFAULT_CONFIG, formatDuration } from '../server/engine/simulation.js';
import { compareAlgorithms } from '../server/engine/comparison.js';

const STEP = 0.05;

function run(label, fn) {
  process.stdout.write(`\n${label}\n`);
  fn();
}

function settle(sim, seconds) {
  for (let i = 0; i < seconds / STEP; i++) sim.step(STEP);
}

run('1. Burst of manual calls on every floor', () => {
  const sim = new Simulation({ ...DEFAULT_CONFIG, autoMode: false, floors: 10, liftCount: 2 });
  for (let f = 0; f < sim.levels; f++) {
    sim.addHallCall(f, 1);
    if (f > 0) sim.addHallCall(f, -1);
  }
  const created = sim.requests.length;
  settle(sim, 240);
  const s = sim.stats;
  console.log(`   created ${created}, served ${s.served}, still waiting ${s.waiting}, avg ${formatDuration(s.avgWait)}, longest ${formatDuration(s.longestWait)}`);
  if (s.waiting !== 0) {
    const stuck = [...sim.activeMap.values()].filter((r) => r.status === 'waiting');
    console.log('   FAILED - unserved:', stuck.map((r) => `${r.from}->${r.to} via lift ${r.assignedLift}`).join(', '));
    process.exitCode = 1;
  } else {
    console.log('   PASS - every call served');
  }
});

run('2. Two minutes of high-rate auto traffic', () => {
  const sim = new Simulation({ ...DEFAULT_CONFIG, autoMode: true, autoRate: 25, algorithm: 'SMART' });
  settle(sim, 120);
  const s = sim.stats;
  console.log(`   requests ${s.totalRequests}, served ${s.served}, avg wait ${formatDuration(s.avgWait)}, longest ${formatDuration(s.longestWait)}`);
  if (s.longestWait > 180) {
    console.log('   FAILED - longest wait above 3 minutes');
    process.exitCode = 1;
  } else {
    console.log('   PASS');
  }
});

run('3. Capacity limit is respected', () => {
  const sim = new Simulation({ ...DEFAULT_CONFIG, autoMode: false, capacity: 2, floors: 4, liftCount: 1 });
  for (let i = 0; i < 8; i++) sim.addRequest(0, 4);
  let peak = 0;
  for (let i = 0; i < 60 / STEP; i++) {
    sim.step(STEP);
    peak = Math.max(peak, ...sim.lifts.map((l) => l.passengers.length));
  }
  console.log(`   peak load ${peak} (capacity 2), served ${sim.stats.served}`);
  if (peak > 2) {
    console.log('   FAILED - lift over capacity');
    process.exitCode = 1;
  } else console.log('   PASS');
});

run('4. Emergency stop then ground recall', () => {
  const sim = new Simulation({ ...DEFAULT_CONFIG, autoMode: true, autoRate: 20 });
  settle(sim, 30);
  sim.emergencyStop();
  const before = sim.lifts.map((l) => l.pos);
  settle(sim, 20);
  const frozen = sim.lifts.every((l, i) => Math.abs(l.pos - before[i]) < 1e-9);
  console.log(`   frozen while stopped: ${frozen}`);
  sim.config.autoMode = false;
  sim.releaseEmergency();
  sim.sendAllToGround();
  const parked = sim.lifts.map(() => false);
  for (let i = 0; i < 90 / STEP; i++) {
    sim.step(STEP);
    sim.lifts.forEach((l, idx) => {
      if (l.pos === 0) parked[idx] = true;
    });
    if (parked.every(Boolean)) break;
  }
  const atGround = parked.every(Boolean);
  console.log(`   all lifts reached ground after recall: ${atGround}`);
  if (!frozen || !atGround) process.exitCode = 1;
  else console.log('   PASS');
});

run('5. Algorithm comparison (5 min @ 12/min)', () => {
  const t0 = Date.now();
  const c = compareAlgorithms({ minutes: 5, rate: 12 });
  for (const r of c.results) {
    console.log(`   ${r.algorithm.padEnd(8)} served ${String(r.served).padStart(3)}/${r.requests}  avg ${r.avgWaitText.padEnd(8)} longest ${r.longestWaitText}`);
  }
  console.log(`   ${c.verdict}  (${Date.now() - t0}ms)`);
});

run('6. Partial settings updates keep unrelated keys', () => {
  const sim = new Simulation({ ...DEFAULT_CONFIG, algorithm: 'SMART' });
  sim.applyConfig({ speed: 1.4, algorithm: undefined, morningRush: undefined, floors: undefined });
  const ok = sim.config.algorithm === 'SMART' && sim.config.speed === 1.4 && sim.config.floors === DEFAULT_CONFIG.floors;
  console.log(`   algorithm ${sim.config.algorithm}, speed ${sim.config.speed}, floors ${sim.config.floors}`);
  console.log(ok ? '   PASS' : '   FAILED - a config key was wiped by an undefined patch');
  if (!ok) process.exitCode = 1;
});

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nAll checks passed');
