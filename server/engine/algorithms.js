export const ALGORITHMS = ['NEAREST', 'FCFS', 'SSTF', 'SCAN', 'LOOK', 'SMART'];

export const ALGORITHM_LABELS = {
  NEAREST: 'Nearest lift, no lookahead',
  FCFS: 'First come, first served',
  SSTF: 'Shortest stop first',
  SCAN: 'Scan to the end of the shaft, then sweep back',
  LOOK: 'Look ahead, reverse at the last stop',
  SMART: 'Pickup-time dispatch with starvation guard',
};

// A stopped lift costs roughly this many floors of travel time (doors + boarding).
const STOP_PENALTY = 1.6;

function aheadOf(lift, floor) {
  if (lift.direction > 0) return floor > lift.pos + 1e-6;
  if (lift.direction < 0) return floor < lift.pos - 1e-6;
  return true;
}

function endOfRun(lift) {
  if (!lift.stops.length) return lift.pos;
  const floors = lift.stops.map((s) => s.floor);
  return lift.direction > 0 ? Math.max(lift.pos, ...floors) : Math.min(lift.pos, ...floors);
}

/**
 * How far (in floors of travel) the lift still has to go before it can open
 * its doors at `floor`. This is the honest number a dispatcher should compare.
 */
export function pickupDistance(lift, floor) {
  const direct = Math.abs(lift.pos - floor);
  if (lift.direction === 0 || lift.stops.length === 0) return direct;

  if (aheadOf(lift, floor)) {
    const between = lift.stops.filter((s) =>
      lift.direction > 0 ? s.floor > lift.pos && s.floor <= floor : s.floor < lift.pos && s.floor >= floor,
    ).length;
    return direct + between * STOP_PENALTY;
  }

  const end = endOfRun(lift);
  return Math.abs(end - lift.pos) + Math.abs(end - floor);
}

/** Cost of handing this hall call to this lift. Lowest wins; Infinity = never. */
export function callCost(lift, call, algorithm) {
  if (lift.halted || lift.recall) return Infinity;
  if (lift.passengers.length >= lift.capacity) return Infinity;

  const distance = Math.abs(lift.pos - call.floor);
  const stops = lift.stops.length;

  switch (algorithm) {
    case 'NEAREST':
      return distance + stops * 0.5;

    case 'FCFS':
      return distance + stops * 0.25;

    case 'SSTF':
      return distance + stops * 3;

    case 'SCAN': {
      // pretend the lift always sweeps to the top/bottom before serving anyone
      const end = lift.direction >= 0 ? lift.levels - 1 : 0;
      const sweep = lift.direction === 0 ? distance : Math.abs(end - lift.pos) + Math.abs(end - call.floor);
      return Math.max(distance, sweep * 0.6) + stops * 0.5;
    }

    case 'LOOK':
      return pickupDistance(lift, call.floor) + stops * 0.5;

    case 'SMART': {
      const eta = pickupDistance(lift, call.floor);
      const directionBonus = lift.direction !== 0 && lift.direction === call.dir ? -1 : 0;
      const idleBonus = lift.state === 'idle' && stops === 0 ? -0.75 : 0;
      const fullness = (lift.passengers.length / Math.max(1, lift.capacity)) * 3;
      const urgency = Math.min(call.age, 60) * 0.15; // starvation guard
      return eta + stops * 0.6 + fullness + directionBonus + idleBonus - urgency;
    }

    default:
      return distance;
  }
}

/** Add a floor to a lift's stop list, respecting the algorithm's stop ordering. */
export function insertStop(lift, floor, algorithm) {
  if (floor < 0 || floor >= lift.levels) return false;
  if (lift.recall && floor !== 0) return false; // a lift in emergency recall takes nobody else
  if (lift.stops.some((s) => s.floor === floor)) return false;
  const entry = { floor };

  if (algorithm === 'FCFS' || lift.direction === 0 || lift.stops.length === 0) {
    lift.stops.push(entry);
    return true;
  }

  if (aheadOf(lift, floor)) {
    const idx = lift.stops.findIndex((s) => (lift.direction > 0 ? s.floor > floor : s.floor < floor));
    if (idx === -1) lift.stops.push(entry);
    else lift.stops.splice(idx, 0, entry);
  } else {
    lift.stops.push(entry); // collected after the lift turns around
  }
  return true;
}
