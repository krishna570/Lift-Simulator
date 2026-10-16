import { icon } from '../icons.js';
import { h, statCard } from '../ui.js';
import { lineChart, barChart, legend } from '../charts.js';
import { api, store, toast } from '../store.js';

export function createStatistics(ctx) {
  const el = h(`<section>
    <div class="page-head">
      <div>
        <h2>Statistics &amp; Analytics</h2>
        <p>Analyse performance, waiting times and compare dispatch algorithms.</p>
      </div>
      <div class="page-actions">
        <div class="field"><label>Traffic</label>
          <select class="control" id="cmp-rate">
            <option value="6">6 / min</option>
            <option value="12" selected>12 / min</option>
            <option value="20">20 / min</option>
            <option value="30">30 / min</option>
          </select>
        </div>
        <div class="field"><label>Window</label>
          <select class="control" id="cmp-min">
            <option value="3">3 min</option>
            <option value="5" selected>5 min</option>
            <option value="10">10 min</option>
          </select>
        </div>
        <button class="btn primary" id="cmp-run" style="align-self:flex-end">${icon('statistics')} Compare algorithms</button>
      </div>
    </div>

    <div class="grid grid-4" id="stat-cards"></div>

    <div class="grid grid-2 section-gap">
      <div class="card">
        <div class="card-head"><h3 class="card-title">${icon('statistics')} Waiting Time Trend</h3></div>
        <div class="chart-box"><canvas class="chart" id="trend-chart"></canvas></div>
        <div id="trend-legend"></div>
      </div>
      <div class="card">
        <div class="card-head"><h3 class="card-title">${icon('bulb')} Algorithm Comparison</h3></div>
        <div class="chart-box"><canvas class="chart" id="cmp-chart"></canvas></div>
        <div id="cmp-legend"></div>
      </div>
    </div>

    <div class="grid split-2-1 section-gap">
      <div class="card">
        <div class="card-head"><h3 class="card-title">${icon('list')} Performance Summary</h3></div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Algorithm</th><th>Avg. Waiting Time</th><th>Longest Waiting</th><th>People Served</th><th>Still Queued</th></tr></thead>
            <tbody id="cmp-rows"><tr><td colspan="5"><div class="empty">${icon('bulb')}Press "Compare algorithms" to run every strategy on the same passenger stream.</div></td></tr></tbody>
          </table>
        </div>
      </div>
      <div class="card insight">
        <div class="card-head"><h3 class="card-title">${icon('shield')} Insight</h3></div>
        <p id="cmp-verdict" style="font-size:13px;color:var(--ink-2);margin:0">Run the comparison to see which controller wins for this traffic level.</p>
        <div class="note section-gap" style="background:#fff">
          <div class="ic">${icon('people')}</div>
          <div>
            <strong id="best-name">Best strategy</strong>
            <p id="best-detail">Waiting for data…</p>
          </div>
        </div>
      </div>
    </div>
  </section>`);

  const cards = el.querySelector('#stat-cards');
  const trendCanvas = el.querySelector('#trend-chart');
  const cmpCanvas = el.querySelector('#cmp-chart');
  let key = '';
  let busy = false;

  async function runComparison() {
    if (busy) return;
    busy = true;
    const btn = el.querySelector('#cmp-run');
    btn.disabled = true;
    btn.innerHTML = `${icon('refresh')} Running…`;
    try {
      store.comparison = await api.comparison({ minutes: el.querySelector('#cmp-min').value, rate: el.querySelector('#cmp-rate').value });
      key = '';
      toast(`Compared 6 strategies over ${store.comparison.minutes} minutes`);
      drawComparison(store.comparison);
    } finally {
      btn.disabled = false;
      btn.innerHTML = `${icon('statistics')} Compare algorithms`;
      busy = false;
    }
  }

  el.querySelector('#cmp-run').onclick = runComparison;
  el.querySelector('#cmp-rate').onchange = runComparison;
  el.querySelector('#cmp-min').onchange = runComparison;

  function drawTrend(state) {
    const trend = state.stats.trend;
    const labels = trend.map((t) => `${t.minute}m`);
    lineChart(trendCanvas, {
      labels,
      height: 220,
      fmt: (v) => `${Math.round(v)}s`,
      series: [
        { name: 'Longest', color: '#7c3aed', values: trend.map((t) => t.longest), fill: true },
        { name: 'Average', color: '#1668dc', values: trend.map((t) => t.avg) },
      ],
    });
    el.querySelector('#trend-legend').innerHTML = legend([
      { name: 'Longest wait', color: '#7c3aed' },
      { name: 'Average wait', color: '#1668dc' },
    ]);
  }

  function drawComparison(cmp) {
    if (!cmp) return;
    const groups = cmp.results.map((r) => r.algorithm);
    barChart(cmpCanvas, {
      groups,
      height: 220,
      fmt: (v) => `${Math.round(v)}s`,
      series: [
        { name: 'Average wait', color: '#1668dc', values: cmp.results.map((r) => r.avgWaitAll) },
        { name: 'Longest wait', color: '#7c3aed', values: cmp.results.map((r) => r.longestWait) },
      ],
    });
    el.querySelector('#cmp-legend').innerHTML = legend([
      { name: 'Average waiting time', color: '#1668dc' },
      { name: 'Longest waiting time', color: '#7c3aed' },
    ]);
    el.querySelector('#cmp-rows').innerHTML = cmp.results
      .map(
        (r) => `<tr class="${r.algorithm === cmp.best ? 'best' : ''}">
          <td><strong>${r.algorithm}</strong><div class="muted" style="font-size:11.5px">${r.label}</div></td>
          <td>${r.avgWaitAllText}</td>
          <td>${r.longestWaitText}</td>
          <td>${r.served}</td>
          <td>${r.unserved}</td>
        </tr>`,
      )
      .join('');
    const best = cmp.results.find((r) => r.algorithm === cmp.best);
    el.querySelector('#cmp-verdict').textContent = cmp.verdict;
    el.querySelector('#best-name').textContent = `${best.algorithm} wins this run`;
    el.querySelector('#best-detail').textContent = `${best.avgWaitAllText} average wait across everyone who queued, ${best.served}/${best.requests} passengers delivered inside ${cmp.minutes} minutes at ${cmp.rate} passengers/min.`;
  }

  return {
    el,
    update(state) {
      const s = state.stats;
      const k = `${s.served}|${s.avgWait}|${s.longestWait}|${s.totalRequests}|${s.waiting}`;
      if (k !== key) {
        key = k;
        cards.innerHTML = [
          statCard({ color: 'green', ic: 'people', label: 'People Served', value: s.served, foot: `${state.config.autoRate}/min traffic` }),
          statCard({ color: 'blue', ic: 'clock', label: 'Average Waiting Time', value: s.avgWaitText, foot: 'from call to pickup' }),
          statCard({ color: 'purple', ic: 'hourglass', label: 'Longest Waiting Time', value: s.longestWaitText, foot: 'includes the live queue' }),
          statCard({ color: 'orange', ic: 'list', label: 'Total Requests', value: s.totalRequests, foot: `${s.waiting} still waiting` }),
        ].join('');
      }
      drawTrend(state);
      if (store.comparison) drawComparison(store.comparison);
      else runComparison();
    },
  };
}
