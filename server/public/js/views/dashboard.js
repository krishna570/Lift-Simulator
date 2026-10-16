import { icon } from '../icons.js';
import { h, statCard, requestRows } from '../ui.js';
import { BuildingView } from '../building.js';
import { api, toast } from '../store.js';

export function createDashboard(ctx) {
  const el = h(`<section>
    <div class="page-head">
      <div>
        <h2>1. Dashboard</h2>
        <p>Welcome back! Here's what's happening in your building.</p>
      </div>
      <div class="page-actions">
        <button class="btn ghost" data-act="stress">${icon('bolt')} Stress test: 12 calls</button>
        <button class="btn ghost" data-act="reset">${icon('refresh')} Reset</button>
      </div>
    </div>

    <div class="grid grid-4" id="dash-stats"></div>

    <div class="grid split-2-1 section-gap">
      <div class="card">
        <div class="card-head">
          <div>
            <h3 class="card-title">${icon('building')} Live Building View</h3>
            <p class="card-sub">Side view of the shafts - cars move in real time.</p>
          </div>
          <span class="badge in_progress" id="dash-algo">SMART</span>
        </div>
        <div class="lift-summary" id="dash-lifts"></div>
        <div class="building" id="dash-building" style="margin-top:14px"></div>
      </div>

      <div>
        <div class="card">
          <div class="card-head">
            <h3 class="card-title">${icon('list')} Recent Requests</h3>
            <a class="nowrap" href="#/requests" style="color:var(--blue);font-size:12px;font-weight:650;text-decoration:none">View All →</a>
          </div>
          <div class="table-wrap">
            <table class="data">
              <thead><tr><th>#</th><th>From → To</th><th>Status</th><th>Time</th></tr></thead>
              <tbody id="dash-rows"></tbody>
            </table>
          </div>
        </div>

        <div class="note section-gap">
          <div class="ic">${icon('shield')}</div>
          <div>
            <strong>What the judges will test</strong>
            <p>Press calls on many floors at once and check that all are served. Run auto mode at a high rate for 2 minutes and watch the longest waiting time.</p>
          </div>
        </div>

        <div class="row section-gap">
          <div class="spacer"></div>
          <button class="btn primary" data-act="goto">${icon('simulation')} Go to Simulation ${icon('arrowRight')}</button>
        </div>
      </div>
    </div>
  </section>`);

  const building = new BuildingView(el.querySelector('#dash-building'), { rowHeight: 30 });
  const statsBox = el.querySelector('#dash-stats');
  const liftsBox = el.querySelector('#dash-lifts');
  const rowsBox = el.querySelector('#dash-rows');
  let statsKey = '';
  let last = null;

  el.querySelector('[data-act="goto"]').onclick = () => (location.hash = '#/simulation');
  el.querySelector('[data-act="reset"]').onclick = async () => {
    await api.reset();
    toast('Simulation reset');
  };
  el.querySelector('[data-act="stress"]').onclick = async () => {
    if (!last) return;
    const levels = last.levels;
    let n = 0;
    for (let f = 0; f < levels && n < 12; f++) {
      await api.hallCall(f, f === 0 ? 1 : -1);
      n += 1;
    }
    toast(`${n} floor calls queued`);
  };

  return {
    el,
    update(state) {
      last = state;
      const s = state.stats;
      const key = `${s.served}|${s.avgWaitText}|${s.longestWaitText}|${s.totalRequests}`;
      if (key !== statsKey) {
        statsKey = key;
        statsBox.innerHTML = [
          statCard({ color: 'green', ic: 'people', label: 'People Served', value: s.served, foot: `${s.riding} riding now` }),
          statCard({ color: 'blue', ic: 'clock', label: 'Average Waiting Time', value: s.avgWaitText, foot: `${s.waiting} in the queue` }),
          statCard({ color: 'purple', ic: 'hourglass', label: 'Longest Waiting Time', value: s.longestWaitText, foot: 'worst case so far' }),
          statCard({ color: 'orange', ic: 'list', label: 'Total Requests', value: s.totalRequests, foot: `${s.cancelled} cancelled` }),
        ].join('');
        el.querySelector('#dash-algo').textContent = `${state.config.algorithm} dispatch`;
      }

      liftsBox.innerHTML = state.lifts
        .map(
          (l) => `<div class="lift-chip ${l.direction === 0 ? 'idle' : l.direction < 0 ? 'down' : ''}">
            <div class="lc-icon">${icon(l.direction < 0 ? 'down' : l.direction > 0 ? 'up' : 'lift')}</div>
            <div>
              <strong>${l.name}</strong>
              <small>Floor ${state.floorLabels[l.floor]} · ${l.status}</small>
            </div>
          </div>`,
        )
        .join('');

      rowsBox.innerHTML = requestRows(state.requests);
      building.render(state);
    },
  };
}
