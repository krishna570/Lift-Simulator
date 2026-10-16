import { icon } from '../icons.js';
import { h, badge, emptyTable } from '../ui.js';
import { api } from '../store.js';

export function createRequests(ctx) {
  const el = h(`<section>
    <div class="page-head">
      <div>
        <h2>Request Management</h2>
        <p>View and manage all passenger requests in real time.</p>
      </div>
      <div class="page-actions">
        <button class="btn ghost" id="req-add">${icon('plus')} Add manual request</button>
      </div>
    </div>

    <div class="card">
      <div class="row" style="margin-bottom:14px">
        <div class="field" style="flex:2;min-width:220px">
          <div style="position:relative">
            <input class="control" id="req-q" placeholder="Search by floor number or passenger…" />
          </div>
        </div>
        <div class="field" style="flex:1;min-width:160px">
          <select class="control" id="req-status">
            <option value="all">All Status</option>
            <option value="waiting">Waiting</option>
            <option value="in_progress">In Progress</option>
            <option value="served">Served</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>#</th><th>From → To</th><th>Status</th><th>Lift</th><th>Waiting Time</th><th>Request Time</th></tr></thead>
          <tbody id="req-rows"></tbody>
        </table>
      </div>
      <div class="pager" id="req-pager"></div>
    </div>
  </section>`);

  const rows = el.querySelector('#req-rows');
  const pager = el.querySelector('#req-pager');
  const qInput = el.querySelector('#req-q');
  const statusSel = el.querySelector('#req-status');
  let page = 1;
  let lastFetch = 0;
  let inFlight = false;

  async function load(force) {
    if (inFlight) return;
    inFlight = true;
    try {
      const data = await api.requests({ page, size: 10, status: statusSel.value, q: qInput.value });
      rows.innerHTML = data.rows.length
        ? data.rows
            .map(
              (r) => `<tr>
                <td class="num">${r.id}</td>
                <td class="trip">${r.fromLabel}<span class="arrow">→</span>${r.toLabel} <span class="muted" style="font-weight:500;font-size:11.5px">${r.dir > 0 ? 'up' : 'down'}</span></td>
                <td>${badge(r.status)}</td>
                <td>${r.assignedLift ? `Lift ${r.assignedLift}` : '<span class="muted">unassigned</span>'}</td>
                <td class="num">${r.waitedText}</td>
                <td class="num">${r.createdClock}</td>
              </tr>`,
            )
            .join('')
        : emptyTable(6, 'No requests match this filter.');

      const buttons = [];
      buttons.push(`<button data-page="prev" ${data.page <= 1 ? 'disabled' : ''}>‹</button>`);
      const from = Math.max(1, Math.min(data.page - 2, data.pages - 4));
      for (let p = from; p <= Math.min(data.pages, from + 4); p++) {
        buttons.push(`<button data-page="${p}" class="${p === data.page ? 'active' : ''}">${p}</button>`);
      }
      buttons.push(`<button data-page="next" ${data.page >= data.pages ? 'disabled' : ''}>›</button>`);
      pager.innerHTML = buttons.join('');
      pager.querySelectorAll('[data-page]').forEach((btn) => {
        btn.onclick = () => {
          const v = btn.dataset.page;
          page = v === 'prev' ? Math.max(1, page - 1) : v === 'next' ? page + 1 : Number(v);
          load(true);
        };
      });
      ctx.setSubtitle(`${data.total} requests tracked`);
      lastFetch = Date.now();
    } finally {
      inFlight = false;
    }
  }

  qInput.oninput = () => {
    page = 1;
    load(true);
  };
  statusSel.onchange = () => {
    page = 1;
    load(true);
  };
  el.querySelector('#req-add').onclick = async () => {
    const state = ctx.state();
    if (!state) return;
    const from = Math.floor(Math.random() * state.levels);
    let to = Math.floor(Math.random() * state.levels);
    if (to === from) to = (to + 1) % state.levels;
    await api.request(from, to);
    load(true);
  };

  return {
    el,
    update() {
      if (Date.now() - lastFetch > 900) load();
    },
  };
}
