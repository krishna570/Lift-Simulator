import { icon } from '../icons.js';
import { h } from '../ui.js';
import { api, toast } from '../store.js';

export function createEmergency(ctx) {
  const el = h(`<section>
    <div class="page-head">
      <div>
        <h2>Emergency Control</h2>
        <p>Use these controls in case of emergency.</p>
      </div>
    </div>

    <div class="grid grid-3">
      <div class="card" style="border-color:#f7c7c7">
        <div class="card-head">
          <h3 class="card-title" style="color:var(--red)">${icon('emergency')} Emergency Stop</h3>
        </div>
        <p class="muted" style="font-size:12.5px">Immediately stops all lifts and prevents further movement. Passengers stay safely inside the car until the stop is released.</p>
        <button class="btn danger block" id="em-stop">${icon('stop')} Stop All Lifts</button>
        <button class="btn ghost block section-gap" id="em-release">${icon('check')} Release Emergency Stop</button>
      </div>

      <div class="card">
        <div class="card-head">
          <h3 class="card-title" style="color:var(--blue)">${icon('user')} Send All to Ground Floor</h3>
        </div>
        <p class="muted" style="font-size:12.5px">Recalls every lift to the ground floor and opens the doors there. Lifts ignore all other calls until they arrive.</p>
        <button class="btn primary block" id="em-ground">${icon('down')} Send to Ground Floor</button>
        <div class="note section-gap" style="background:#fff">
          <div class="ic">${icon('lift')}</div>
          <div>
            <strong>Per-lift stop</strong>
            <p id="em-lifts">Waiting for status…</p>
          </div>
        </div>
        <div class="row" id="em-lift-buttons"></div>
      </div>

      <div class="card" style="border-color:#f3d9a8;background:#fffaef">
        <div class="card-head">
          <h3 class="card-title" style="color:var(--orange)">${icon('shield')} Emergency Guidelines</h3>
        </div>
        <ul style="margin:0;padding-left:18px;font-size:12.5px;color:var(--ink-2);line-height:1.9">
          <li>Use emergency stop only in critical situations.</li>
          <li>All lifts will stop immediately.</li>
          <li>Send to ground floor to evacuate passengers safely.</li>
          <li>System will remain in safe mode until reset.</li>
          <li>Fires and earthquakes: never use the lifts - use the stairs.</li>
        </ul>
        <div class="note warn section-gap" style="background:#fff">
          <div class="ic">${icon('clock')}</div>
          <div>
            <strong id="em-state">Status: normal service</strong>
            <p id="em-detail">No lifts are stopped.</p>
          </div>
        </div>
      </div>
    </div>
  </section>`);

  el.querySelector('#em-stop').onclick = async () => {
    await api.emergency('stop');
    toast('EMERGENCY STOP engaged', 'error');
  };
  el.querySelector('#em-release').onclick = async () => {
    await api.emergency('release');
    toast('Emergency released - lifts back in service');
  };
  el.querySelector('#em-ground').onclick = async () => {
    await api.emergency('ground');
    toast('All lifts recalled to the ground floor');
  };

  return {
    el,
    update(state) {
      const buttons = el.querySelector('#em-lift-buttons');
      if (buttons.childElementCount !== state.lifts.length) {
        buttons.innerHTML = state.lifts
          .map((l) => `<button class="btn ghost sm" data-lift="${l.id}" style="flex:1">${l.name}</button>`)
          .join('');
        buttons.querySelectorAll('[data-lift]').forEach((btn) => {
          btn.onclick = async () => {
            const res = await api.stopLift(Number(btn.dataset.lift));
            const lift = res.snapshot.lifts.find((l) => l.id === Number(btn.dataset.lift));
            toast(`${lift.name} ${lift.halted ? 'stopped' : 'resumed'}`);
          };
        });
      }
      buttons.querySelectorAll('[data-lift]').forEach((btn) => {
        const lift = state.lifts.find((l) => l.id === Number(btn.dataset.lift));
        btn.classList.toggle('danger', lift.halted);
        btn.textContent = `${lift.name} · ${lift.halted ? 'Stopped' : 'Tap to stop'}`;
      });

      el.querySelector('#em-lifts').textContent = state.lifts
        .map((l) => `${l.name}: floor ${state.floorLabels[l.floor]} (${l.status})`)
        .join(' · ');

      el.querySelector('#em-state').textContent = state.emergency
        ? 'Status: EMERGENCY STOP active'
        : state.lifts.some((l) => l.recall)
          ? 'Status: ground floor recall in progress'
          : 'Status: normal service';
      el.querySelector('#em-detail').textContent = state.emergency
        ? 'All lifts are halted. Release the stop to return to service.'
        : state.lifts.filter((l) => l.recall).length === state.lifts.length
          ? 'Every lift is heading to the ground floor and ignoring all calls.'
          : `${state.stats.waiting} passengers waiting, ${state.stats.riding} riding.`;
      el.querySelector('#em-stop').disabled = state.emergency;
      el.querySelector('#em-release').disabled = !state.emergency && !state.lifts.some((l) => l.recall);
    },
  };
}
