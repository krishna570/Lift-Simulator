import { Simulation, DEFAULT_CONFIG, formatDuration } from './simulation.js';
import { ALGORITHMS, ALGORITHM_LABELS } from './algorithms.js';

const STEP = 0.1;

/**
 * Run the same passenger stream through every dispatch algorithm and compare
 * waiting times. Deterministic: the seed makes the generator identical.
 */
export function compareAlgorithms({ minutes = 5, rate = 12, ...config } = {}) {
  const results = ALGORITHMS.map((algorithm) => {
    const sim = new Simulation({
      ...DEFAULT_CONFIG,
      ...config,
      algorithm,
      seed: 20261016,
      autoMode: true,
      autoRate: rate,
      simSpeed: 1,
    });
    const steps = Math.round((minutes * 60) / STEP);
    for (let i = 0; i < steps; i++) sim.step(STEP);
    const stats = sim.stats;
    // everyone still queueing counts as waiting, so a strategy cannot win by
    // quietly never serving the awkward calls
    const allWaits = sim.requests.map((r) => (r.pickedAt ?? sim.time) - r.createdAt);
    const avgWaitAll = allWaits.reduce((a, b) => a + b, 0) / Math.max(1, allWaits.length);
    return {
      algorithm,
      label: ALGORITHM_LABELS[algorithm],
      requests: stats.totalRequests,
      served: stats.served,
      unserved: stats.totalRequests - stats.served,
      avgWait: stats.avgWait,
      avgWaitText: formatDuration(stats.avgWait),
      avgWaitAll,
      avgWaitAllText: formatDuration(avgWaitAll),
      longestWait: stats.longestWait,
      longestWaitText: formatDuration(stats.longestWait),
      throughput: stats.served / minutes,
    };
  });

  const best = results.reduce((a, b) => (b.avgWaitAll < a.avgWaitAll ? b : a));
  const simple = results.find((r) => r.algorithm === 'NEAREST');
  const gain = simple ? simple.avgWaitAll - best.avgWaitAll : 0;
  return {
    minutes,
    rate,
    results,
    best: best.algorithm,
    verdict:
      best.algorithm !== 'NEAREST' && gain > 0.5
        ? `${best.algorithm} cut the average wait for every queued passenger from ${simple.avgWaitAll.toFixed(0)}s to ${best.avgWaitAll.toFixed(0)}s versus the simple nearest-lift rule.`
        : `At ${rate} passengers/min the simple nearest-lift rule is already within ${Math.abs(gain).toFixed(0)}s of the best strategy.`,
  };
}
