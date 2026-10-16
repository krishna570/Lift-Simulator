import { icon } from '../icons.js';
import { h } from '../ui.js';
import { api, toast } from '../store.js';

export function createSettings(ctx) {
  const el = h(`<section>
    <div class="page-head">
      <div>
        <h2>Settings</h2>
        <p>Configure building and lift parameters.</p>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div>
          <h3 class="card-title">${icon('building')} Building Configuration</h3>
          <p class="card-sub">Changing the floors or lift count rebuilds the simulation.</p>
        </div>
      </div>
      <div class="grid grid-4">
        <div class="field">
          <label>Total Floors ${icon('list')}</label>
          <select class="control" id="set-floors"></select>
          <span class="hint">Above-ground floors, plus the ground floor.</span>
        </div>
        <div class="field">
          <label>Number of Lifts ${icon('lift')}</label>
          <select class="control" id="set-lifts">${[1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}">${n}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label>Lift Capacity (per lift)</label>
          <select class="control" id="set-capacity">${[2, 4, 6, 8, 10, 12, 16, 20].map((n) => `<option value="${n}">${n} people</option>`).join('')}</select>
        </div>
        <div class="field">
          <label>Lift Speed ${icon('bolt')}</label>
          <input class="slider" type="range" id="set-speed" min="0.3" max="3" step="0.1" />
          <span class="hint" id="set-speed-text">1.0 m/s</span>
        </div>
      </div>
    </div>

    <div class="card section-gap">
      <div class="card-head">
        <div>
          <h3 class="card-title">${icon('simulation')} Simulation Settings</h3>
          <p class="card-sub">Traffic, dispatch strategy and clock speed.</p>
        </div>
      </div>
      <div class="grid grid-4">
        <div class="field">
          <label>Auto Passenger Generation Rate ${icon('clock')}</label>
          <input class="slider" type="range" id="set-rate" min="0" max="30" step="1" />
          <span class="hint" id="set-rate-text">5 passengers/min</span>
        </div>
        <div class="field">
          <label>Dispatch Algorithm</label>
          <select class="control" id="set-algo"></select>
        </div>
        <div class="field">
          <label>Simulation Clock</label>
          <select class="control" id="set-simspeed">
            <option value="0.5">0.5x slow motion</option>
            <option value="1">1x real time</option>
            <option value="2">2x</option>
            <option value="4">4x</option>
            <option value="8">8x</option>
          </select>
        </div>
        <div class="field">
          <label>Passenger Pattern</label>
          <div class="row">
            <label class="switch"><input type="checkbox" id="set-rush" /><span></span></label>
            <span class="hint" id="set-rush-text">Normal office day</span>
          </div>
        </div>
      </div>
      <div class="row section-gap">
        <div class="spacer"></div>
        <button class="btn ghost" id="set-reset">${icon('refresh')} Reset simulation</button>
        <button class="btn primary" id="set-save">${icon('save')} Save Settings</button>
      </div>
    </div>

    <div class="card section-gap">
      <div class="card-head"><h3 class="card-title">${icon('shield')} Controller Reference</h3></div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Algorithm</th><th>How it decides</th><th>Watch out for</th></tr></thead>
          <tbody id="set-refs"></tbody>
        </table>
      </div>
    </div>
  </section>`);

  const floors = el.querySelector('#set-floors');
  const lifts = el.querySelector('#set-lifts');
  const capacity = el.querySelector('#set-capacity');
  const speed = el.querySelector('#set-speed');
  const rate = el.querySelector('#set-rate');
  const algo = el.querySelector('#set-algo');
  const simSpeed = el.querySelector('#set-simspeed');
  const rush = el.querySelector('#set-rush');
  let loaded = false;

  floors.innerHTML = Array.from({ length: 21 }, (_, i) => i + 2).map((n) => `<option value="${n}">${n}</option>`).join('');

  const REFERENCE = {
    NEAREST: ['Gives the call to the closest car.', 'Two lifts chasing the same floor, long trips ignored.'],
    FCFS: ['Serves the oldest call first, no reordering.', 'A lift crosses the whole building for one person.'],
    SSTF: ['Prefers the car with the fewest stops.', 'Busy lifts starve while an idle one does everything.'],
    SCAN: ['Sweeps to the top (or bottom) before reversing.', 'Top-floor calls wait for the sweep to finish.'],
    LOOK: ['Reverses at the last stop instead of the end.', 'Direction changes mid-run can skip waiting passengers.'],
    SMART: ['Estimates pickup time, load and call age.', 'Needs the starvation guard to keep old calls moving.'],
  };

  speed.oninput = () => (el.querySelector('#set-speed-text').textContent = `${Number(speed.value).toFixed(1)} m/s`);
  rate.oninput = () => (el.querySelector('#set-rate-text').textContent = `${rate.value} passengers/min`);
  rush.onchange = () => (el.querySelector('#set-rush-text').textContent = rush.checked ? 'Morning rush - most people start at the ground floor' : 'Normal office day');

  el.querySelector('#set-save').onclick = async () => {
    const res = await api.settings({
      floors: Number(floors.value),
      liftCount: Number(lifts.value),
      capacity: Number(capacity.value),
      speed: Number(speed.value),
      autoRate: Number(rate.value),
      algorithm: algo.value,
      simSpeed: Number(simSpeed.value),
      morningRush: rush.checked,
    });
    loaded = false;
    toast(res.rebuilt ? 'Building rebuilt with the new configuration' : 'Settings saved');
  };
  el.querySelector('#set-reset').onclick = async () => {
    await api.reset();
    loaded = false;
    toast('Simulation reset');
  };

  return {
    el,
    update(state) {
      if (!loaded) {
        loaded = true;
        algo.innerHTML = state.algorithms.map((a) => `<option value="${a}">${a}</option>`).join('');
      }
      const c = state.config;
      const focus = document.activeElement;
      const set = (node, value) => {
        if (node !== focus) node.value = String(value);
      };
      set(floors, c.floors);
      set(lifts, c.liftCount);
      set(capacity, c.capacity);
      set(speed, c.speed);
      set(rate, c.autoRate);
      set(algo, c.algorithm);
      set(simSpeed, c.simSpeed);
      if (rush !== focus) rush.checked = !!c.morningRush;
      el.querySelector('#set-speed-text').textContent = `${Number(c.speed).toFixed(1)} m/s`;
      el.querySelector('#set-rate-text').textContent = `${c.autoRate} passengers/min`;
      el.querySelector('#set-rush-text').textContent = c.morningRush ? 'Morning rush - most people start at the ground floor' : 'Normal office day';

      el.querySelector('#set-refs').innerHTML = state.algorithms
        .map(
          (a) => `<tr>
            <td><strong>${a}</strong></td>
            <td>${REFERENCE[a][0]}</td>
            <td class="muted">${REFERENCE[a][1]}</td>
          </tr>`,
        )
        .join('');
    },
  };
}
