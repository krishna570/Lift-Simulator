/** Small dependency-free canvas charts (line + grouped bars). */

function setup(canvas, height) {
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || canvas.parentElement.clientWidth || 600;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}

function niceMax(v) {
  if (!Number.isFinite(v) || v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10].find((s) => v / pow <= s) || 10;
  return step * pow;
}

function axes(ctx, box, max, labels, fmt) {
  const { left, right, top, bottom } = box;
  ctx.strokeStyle = '#e8eef7';
  ctx.lineWidth = 1;
  ctx.font = '11px "Segoe UI", sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const y = bottom - ((bottom - top) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    ctx.fillText(fmt((max * i) / 4), left - 8, y);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const n = labels.length;
  const every = Math.ceil(n / 8);
  labels.forEach((label, i) => {
    if (i % every) return;
    const x = n === 1 ? (left + right) / 2 : left + ((right - left) * i) / (n - 1);
    ctx.fillText(String(label), x, bottom + 7);
  });
}

export function lineChart(canvas, { labels = [], series = [], height = 210, fmt = (v) => `${Math.round(v)}s` }) {
  const { ctx, width } = setup(canvas, height);
  const box = { left: 44, right: width - 14, top: 14, bottom: height - 30 };
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values.map(Number))));
  axes(ctx, box, max, labels, fmt);
  const n = labels.length;

  for (const s of series) {
    const pts = s.values.map((v, i) => [
      n <= 1 ? (box.left + box.right) / 2 : box.left + ((box.right - box.left) * i) / (n - 1),
      box.bottom - ((box.bottom - box.top) * Math.min(v, max)) / max,
    ]);
    if (s.fill) {
      const grad = ctx.createLinearGradient(0, box.top, 0, box.bottom);
      grad.addColorStop(0, `${s.color}33`);
      grad.addColorStop(1, `${s.color}00`);
      ctx.beginPath();
      ctx.moveTo(pts[0][0], box.bottom);
      pts.forEach(([x, y]) => ctx.lineTo(x, y));
      ctx.lineTo(pts[pts.length - 1][0], box.bottom);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
    }
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.fillStyle = s.color;
    pts.forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

export function barChart(canvas, { groups = [], series = [], height = 210, fmt = (v) => `${Math.round(v)}s` }) {
  const { ctx, width } = setup(canvas, height);
  const box = { left: 44, right: width - 14, top: 14, bottom: height - 30 };
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values.map(Number))));
  axes(ctx, box, max, groups, fmt);

  const slot = (box.right - box.left) / groups.length;
  const barW = Math.min(18, (slot - 12) / series.length);

  series.forEach((s, si) => {
    s.values.forEach((v, gi) => {
      const cx = box.left + slot * gi + slot / 2;
      const x = cx - (series.length * barW) / 2 + si * barW;
      const h = ((box.bottom - box.top) * Math.min(v, max)) / max;
      ctx.fillStyle = s.color;
      const y = box.bottom - h;
      const r = Math.min(4, barW / 2, h);
      ctx.beginPath();
      ctx.moveTo(x, box.bottom);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.lineTo(x + barW - r, y);
      ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
      ctx.lineTo(x + barW, box.bottom);
      ctx.closePath();
      ctx.fill();
    });
  });
}

export function legend(items) {
  return `<div class="legend">${items.map((i) => `<span><i style="background:${i.color}"></i>${i.name}</span>`).join('')}</div>`;
}
