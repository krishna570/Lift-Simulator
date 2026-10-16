import { icon } from '../icons.js';
import { h } from '../ui.js';
import { BuildingView } from '../building.js';
import { api, toast } from '../store.js';

export function createSimulation(ctx) {
  const el = h(`<section>
    <div class="page-head">
      <div>
        <h2>Elevator Simulation</h2>
        <p>Control the lifts, call them from floors and watch the movement in real time.</p>
      </div>
      <div class="page-actions">
        <div class="field" style="min-width:150px">
          <label>Building Floors</label>
          <select class="control" id="sim-floors"></select>
        </div>
        <div class="field">
          <label>Auto Mode</label>
          <div class="row">
            <label class="switch"><input type="checkbox" id="sim-auto" /><span></span></label>
            <span class="muted" id="sim-auto-text" style="font-size:12px">OFF</span>
          </div>
        </div>
        <div class="field">
          <label>Speed</label>
          <select class="control" id="sim-speed">
            <option value="1">1x (real time)</option>
            <option value="2">2x</option>
            <option value="4">4x</option>
            <option value="8">8x</option>
          </select>
        </div>
        <button class="btn primary" id="sim-run" style="align-self:flex-end">${icon('play')} Run</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="row">
        <strong style="font-size:13px">${icon('settings')} Dispatch algorithm</strong>
        <div class="chip-row" id="sim-algo"></div>
        <div class="spacer"></div>
        <label class="row" style="gap:8px;font-size:13px;font-weight:650">
          <label class="switch"><input type="checkbox" id="sim-rush" /><span></span></label>
          Morning rush
        </label>
      </div>
    </div>

    <div class="grid grid-sim">
      <div class="card">
        <div class="card-head">
          <h3 class="card-title">${icon('building')} Building</h3>
          <span class="muted" style="font-size:12px" id="sim-summary"></span>
        </div>
        <div id="sim-building"></div>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <h3 class="card-title">${icon('up')} Floor Call Buttons</h3>
            <p class="card-sub">Press up or down on any floor.</p>
          </div>
        </div>
        <div id="sim-calls"></div>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <h3 class="card-title">${icon('lift')} Lift Control Panel</h3>
            <p class="card-sub">One panel per lift - destination buttons live inside the car.</p>
          </div>
        </div>
        <div id="sim-panels"></div>
      </div>
    </div>

    <div class="card section-gap">
      <div class="card-head">
        <h3 class="card-title">${icon('bell')} Live Activity</h3>
        <button class="btn ghost sm" id="sim-clear">${icon('refresh')} New simulation</button>
      </div>
      <ul class="log-list" id="sim-log"></ul>
    </div>
  </section>`);

  const building = new BuildingView(el.querySelector('#sim-building'), { rowHeight: 34 });
  const callsBox = el.querySelector('#sim-calls');
  const panelsBox = el.querySelector('#sim-panels');
  const algoBox = el.querySelector('#sim-algo');
  const floorsSel = el.querySelector('#sim-floors');
  const autoBox = el.querySelector('#sim-auto');
  const rushBox = el.querySelector('#sim-rush');
  const speedSel = el.querySelector('#sim-speed');
  const logBox = el.querySelector('#sim-log');
  const summary = el.querySelector('#sim-summary');

  let built = '';
  let refs = { panels: new Map(), algos: new Map() };

  floorsSel.innerHTML = Array.from({ length: 21 }, (_, i) => i + 2)
    .map((n) => `<option value="${n}">${n}</option>`)
    .join('');

  el.querySelector('#sim-run').onclick = async () => {
    await api.auto(true, undefined);
    toast('Auto mode running');
  };
  el.querySelector('#sim-clear').onclick = async () => {
    await api.reset();
    toast('New simulation started');
  };
  floorsSel.onchange = async () => {
    await api.settings({ floors: Number(floorsSel.value) });
    toast(`Building rebuilt with ${floorsSel.value} floors`);
  };
  autoBox.onchange = () => api.auto(autoBox.checked);
  rushBox.onchange = () => api.settings({ morningRush: rushBox.checked });
  speedSel.onchange = () => api.settings({ simSpeed: Number(speedSel.value) });

  function buildCalls(state) {
    callsBox.innerHTML = `<table class="floor-grid">${state.floorLabels
      .map((label, f) => {
        const levels = state.levels;
        return `<tr>
          <td class="fl">${label}</td>
          <td style="width:50%">
            <button class="call-btn up" data-floor="${f}" data-dir="1" ${f >= levels - 1 ? 'disabled' : ''}>${icon('up')} Up</button>
          </td>
          <td style="width:50%">
            <button class="call-btn down" data-floor="${f}" data-dir="-1" ${f === 0 ? 'disabled' : ''}>${icon('down')} Down</button>
          </td>
        </tr>`;
      })
      .reverse()
      .join('')}</table>`;

    callsBox.querySelectorAll('.call-btn').forEach((btn) => {
      btn.onclick = async () => {
        const res = await api.hallCall(Number(btn.dataset.floor), Number(btn.dataset.dir));
        toast(`Call from floor ${state.floorLabels[Number(btn.dataset.floor)]} · ${res.request.fromLabel} → ${res.request.toLabel}`);
      };
    });
  }

  function buildPanels(state) {
    panelsBox.innerHTML = state.lifts
      .map(
        (lift) => `<div class="panel" data-panel="${lift.id}">
          <div class="panel-head">
            <div class="ic ${lift.id % 2 ? '' : 'blue'}">${icon('lift')}</div>
            <strong>${lift.name}</strong>
            <div class="spacer"></div>
            <span class="badge in_progress" data-p-status="${lift.id}">${lift.status}</span>
          </div>
          <div class="row" style="align-items:flex-end">
            <div class="field" style="flex:1">
              <label>Current Floor</label>
              <div class="kv"><b class="big" data-p-floor="${lift.id}">${state.floorLabels[lift.floor]}</b></div>
            </div>
            <div class="field" style="flex:1.6">
              <label>Load</label>
              <div class="progress"><i data-p-load="${lift.id}" style="width:0%"></i></div>
              <span class="hint" data-p-loadtext="${lift.id}">0 / ${lift.capacity}</span>
            </div>
          </div>
          <div class="field" style="margin-top:8px">
            <label>Destination Floor</label>
            <select class="control" data-p-sel="${lift.id}">
              <option value="">Select floor</option>
              ${state.floorLabels.map((l, f) => (f === lift.floor ? '' : `<option value="${f}">${l}</option>`)).join('')}
            </select>
          </div>
          <div class="row" style="margin-top:9px">
            <button class="btn success sm" data-p-up="${lift.id}" style="flex:1">${icon('up')} Up</button>
            <button class="btn primary sm" data-p-down="${lift.id}" style="flex:1">${icon('down')} Down</button>
            <button class="btn danger sm" data-p-stop="${lift.id}" style="flex:1">${icon('stop')} Stop</button>
          </div>
          <div class="floor-pad" data-pad="${lift.id}">
            ${state.floorLabels
              .map((l, f) => `<button data-pad-floor="${f}">${l}</button>`)
              .join('')}
          </div>
          <div class="kv" style="margin-top:9px"><span>Stops queued</span><b data-p-stops="${lift.id}">-</b></div>
        </div>`,
      )
      .join('');

    refs.panels = new Map();
    for (const lift of state.lifts) {
      const panel = panelsBox.querySelector(`[data-panel="${lift.id}"]`);
      const refsFor = {
        panel,
        status: panel.querySelector(`[data-p-status="${lift.id}"]`),
        floor: panel.querySelector(`[data-p-floor="${lift.id}"]`),
        load: panel.querySelector(`[data-p-load="${lift.id}"]`),
        loadText: panel.querySelector(`[data-p-loadtext="${lift.id}"]`),
        sel: panel.querySelector(`[data-p-sel="${lift.id}"]`),
        stops: panel.querySelector(`[data-p-stops="${lift.id}"]`),
        stop: panel.querySelector(`[data-p-stop="${lift.id}"]`),
        pad: panel.querySelector(`[data-pad="${lift.id}"]`),
      };
      refs.panels.set(lift.id, refsFor);

      refsFor.sel.onchange = async () => {
        if (refsFor.sel.value === '') return;
        await api.carCall(lift.id, Number(refsFor.sel.value));
        refsFor.sel.value = '';
      };
      refsFor.stop.onclick = async () => {
        const res = await api.stopLift(lift.id);
        const me = res.snapshot.lifts.find((l) => l.id === lift.id);
        toast(`${lift.name} ${me.halted ? 'stopped' : 'resumed'}`);
      };
      panel.querySelector(`[data-p-up="${lift.id}"]`).onclick = () => nudge(lift.id, 1);
      panel.querySelector(`[data-p-down="${lift.id}"]`).onclick = () => nudge(lift.id, -1);
      refsFor.pad.querySelectorAll('[data-pad-floor]').forEach((btn) => {
        btn.onclick = () => api.carCall(lift.id, Number(btn.dataset.padFloor));
      });
    }
  }

  async function nudge(liftId, dir) {
    const state = ctx.state();
    const lift = state.lifts.find((l) => l.id === liftId);
    if (!lift) return;
    const target = lift.floor + dir;
    if (target < 0 || target >= state.levels) return toast(`Floor ${target < 0 ? 'below' : 'above'} the building`, 'error');
    await api.carCall(liftId, target);
  }

  function buildAlgo(state) {
    algoBox.innerHTML = state.algorithms.map((a) => `<button class="chip" data-algo="${a}">${a}</button>`).join('');
    algoBox.querySelectorAll('[data-algo]').forEach((btn) => {
      btn.onclick = async () => {
        await api.settings({ algorithm: btn.dataset.algo });
        toast(`${btn.dataset.algo} dispatch enabled`);
      };
    });
  }

  return {
    el,
    update(state) {
      ctx.setSubtitle(`Lifts are ${state.emergency ? 'in emergency stop' : state.paused ? 'paused' : 'serving the building'}`);

      const key = `${state.levels}:${state.lifts.length}`;
      if (key !== built) {
        built = key;
        buildCalls(state);
        buildPanels(state);
        buildAlgo(state);
      }
      if (!floorsSel.dataset.touched) {
        floorsSel.value = String(state.config.floors);
        floorsSel.dataset.touched = '1';
      }
      speedSel.value = String(state.config.simSpeed);
      autoBox.checked = state.config.autoMode;
      rushBox.checked = state.config.morningRush;
      el.querySelector('#sim-auto-text').textContent = state.config.autoMode ? `${state.config.autoRate}/min` : 'OFF';

      algoBox.querySelectorAll('[data-algo]').forEach((b) => b.classList.toggle('active', b.dataset.algo === state.config.algorithm));

      // hall call lamps
      const lit = new Set(state.hallCalls.map((c) => `${c.floor}:${c.dir}`));
      callsBox.querySelectorAll('.call-btn').forEach((btn) => {
        btn.classList.toggle('lit', lit.has(`${btn.dataset.floor}:${btn.dataset.dir}`));
      });

      summary.textContent = `${state.stats.waiting} waiting · ${state.stats.riding} riding · ${state.stats.served} served`;

      for (const lift of state.lifts) {
        const r = refs.panels.get(lift.id);
        if (!r) continue;
        r.floor.textContent = state.floorLabels[lift.floor];
        r.status.textContent = lift.status;
        r.status.className = `badge ${lift.halted ? 'cancelled' : lift.state === 'moving' ? 'in_progress' : 'served'}`;
        r.load.style.width = `${Math.round((lift.load / Math.max(1, lift.capacity)) * 100)}%`;
        r.loadText.textContent = `${lift.load} / ${lift.capacity} inside${lift.passengers.length ? ` · going to ${lift.passengers.map((p) => p.label).join(', ')}` : ''}`;
        r.stops.textContent = lift.stops.map((f) => state.floorLabels[f]).join(' → ') || 'none';
        r.stop.innerHTML = lift.halted ? `${icon('play')} Resume` : `${icon('stop')} Stop`;
        r.pad.querySelectorAll('[data-pad-floor]').forEach((btn) => btn.classList.toggle('on', lift.carCalls.includes(Number(btn.dataset.padFloor))));
      }

      logBox.innerHTML = state.events
        .slice(0, 12)
        .map((e) => `<li class="${e.type}"><span class="dot"></span><time>${e.clock}</time><span>${e.text}</span></li>`)
        .join('');

      building.render(state);
    },
  };
}
