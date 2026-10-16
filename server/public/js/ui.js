import { icon } from './icons.js';

export const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const STATUS_LABEL = { waiting: 'Waiting', in_progress: 'In Progress', served: 'Served', cancelled: 'Cancelled' };

export const badge = (status) => `<span class="badge ${status}">${STATUS_LABEL[status] || status}</span>`;

export function statCard({ color, ic, label, value, foot }) {
  return `<div class="stat">
    <div class="stat-icon ${color}">${icon(ic)}</div>
    <div>
      <div class="stat-label">${label}</div>
      <div class="stat-value" data-stat="${label}">${value}</div>
      <div class="stat-foot">${foot || ''}</div>
    </div>
  </div>`;
}

export function requestRows(requests, { withWaiting = false } = {}) {
  if (!requests.length) {
    return `<tr><td colspan="${withWaiting ? 6 : 5}"><div class="empty">${icon('list')}No requests yet. Press a floor call button or switch on auto mode.</div></td></tr>`;
  }
  return requests
    .slice(0, withWaiting ? 8 : 6)
    .map(
      (r) => `<tr>
        <td class="num">${r.id}</td>
        <td class="trip">${esc(r.fromLabel)}<span class="arrow">${r.dir > 0 ? '→' : '→'}</span>${esc(r.toLabel)}</td>
        <td>${badge(r.status)}</td>
        ${withWaiting ? `<td class="num">${esc(r.waitedText)}</td>` : ''}
        <td class="num">${esc(r.createdClock)}</td>
      </tr>`,
    )
    .join('');
}

export function emptyTable(cols, message) {
  return `<tr><td colspan="${cols}"><div class="empty">${icon('list')}${message}</div></td></tr>`;
}
