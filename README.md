# Lift (Elevator) Controller Simulator

Problem 6 - a building with 8+ floors and 2 lifts, live side view, floor call buttons,
in-car destination panels, an automatic passenger generator, live statistics, two
selectable dispatch strategies with a waiting-time comparison, capacity limits,
morning rush, and an emergency stop / ground-floor recall.

Node.js + Express + Socket.IO backend, plain HTML/CSS/JS dashboard (no build step).

## Run it

```bash
npm install
npm start
```

Open <http://localhost:3000>. The simulation starts immediately in auto mode at
5 passengers/minute so there is always something moving on screen.

```bash
npm run dev        # restart the server when server files change
npm run selftest   # headless engine checks (no browser needed)
```

## Layout

```
server/
  index.js                 Express + Socket.IO, REST API, 20 Hz tick loop
  engine/
    simulation.js          world: lifts, passengers, requests, stats, controls
    algorithms.js          dispatch cost + stop ordering per strategy
    comparison.js          headless "run every algorithm on the same traffic"
    rng.js                 seeded random so comparisons are fair
  public/
    index.html             app shell (sidebar + topbar)
    css/styles.css         design system
    js/app.js              router, live header, view cache
    js/store.js            socket snapshots + REST commands + toasts
    js/building.js         side view of the shafts
    js/charts.js           canvas line + bar charts (no chart library)
    js/views/*.js          dashboard, simulation, statistics, requests, settings, emergency
scripts/selftest.js        engine regression checks
```

The simulation is completely separate from the drawing: `engine/` knows nothing about
DOM or canvas, and the frontend only renders snapshots it receives over the socket.

## Model

Each lift is a state machine - `idle → moving → doors_open → doors_close → idle` -
with a queue of target floors. Position is continuous (metres / speed), the displayed
floor is the nearest one, and a lift only opens its doors at a floor it is actually
stopping at.

* One call, one lift. Every request is assigned to exactly one car (`assignedLift`),
  so two lifts never answer the same call.
* No skipping. A waiting passenger boards only when their assigned lift arrives with
  room; if the lift turns away or overshoots, the call is handed back to the pool.
* No starvation. Any call older than 45 s is force-reassigned, and the SMART cost
  function subtracts the call's age so old requests win ties.
* Capacity is enforced on boarding; a full car leaves people behind and the
  dispatcher reassigns them to another lift.

## Dispatch algorithms

| Strategy | Decision rule |
| --- | --- |
| `NEAREST` | closest car, ignores direction - the simple baseline |
| `FCFS` | oldest request first, stops served in arrival order |
| `SSTF` | prefers the car with the fewest stops already queued |
| `SCAN` | sweeps to the end of the shaft before reversing |
| `LOOK` | reverses at the last stop instead of the top / bottom |
| `SMART` | estimated pickup time (distance + intermediate stops + load) minus call age |

`NEAREST` versus `SMART` is the "simple versus smarter" comparison the stretch goal
asks for; the Statistics page runs all six over the same seeded passenger stream.

## API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/state` | full snapshot (lifts, calls, stats, events) |
| `POST /api/call/hall` | press an up/down button on a floor `{floor, dir}` |
| `POST /api/call/car` | press a destination inside a lift `{liftId, floor}` |
| `POST /api/request` | explicit trip `{from, to}` |
| `POST /api/settings` | floors, lifts, capacity, speed, algorithm, rush, clock |
| `POST /api/auto` | auto mode on/off and generation rate |
| `POST /api/pause`, `POST /api/reset` | clock control |
| `POST /api/lift/:id/stop` | stop or resume one lift |
| `POST /api/emergency` | `stop`, `release` or `ground` |
| `GET /api/requests` | paginated, filterable request table |
| `GET /api/comparison` | run every algorithm on identical traffic |
| Socket.IO `snapshot` | pushed 10 times per second |

## Judge checklist

* **Press calls on many floors at once** - Dashboard > "Stress test: 12 calls", or use
  the floor buttons on the Simulation page. Every call reaches `Served`; the Requests
  page shows nothing stuck in `Waiting` once the queue drains.
* **Auto mode at a high rate for 2 minutes** - set the rate to 20-30/min and the clock
  to 4x, then read "Longest Waiting Time" on the Dashboard. It is computed over the
  live queue too, so a stuck passenger is immediately visible.
* **Emergency** - Emergency page: stop freezes every car mid-shaft, release resumes the
  original stop queue, "Send to Ground Floor" recalls every lift and makes them ignore
  all other calls until they arrive.
