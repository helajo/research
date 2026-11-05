// Hand-written SVG charts. Colours come from CSS custom properties, so a theme switch repaints without re-rendering.

const NS = 'http://www.w3.org/2000/svg';

export function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v);
  }
  if (parent) parent.appendChild(e);
  return e;
}

export function scale(d0, d1, r0, r1) {
  const k = (r1 - r0) / ((d1 - d0) || 1);
  const f = (v) => r0 + (v - d0) * k;
  f.invert = (p) => d0 + (p - r0) / k;
  return f;
}

function niceStep(span, count) {
  const raw = span / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const r = raw / mag;
  const m = r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10;
  return m * mag;
}
export function ticks(min, max, count) {
  const step = niceStep(max - min, count);
  const out = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}
const LOG_CANDIDATES = [0.05, 0.1, 0.2, 0.3, 0.5, 1, 2, 3, 5, 10, 20, 30, 50];
function logTicks(lo, hi) {
  const all = LOG_CANDIDATES.filter((v) => v >= lo * 0.999 && v <= hi * 1.001);
  // keep at most ~7
  const keep = all.length <= 7 ? all : all.filter((v, i) => i % 2 === 0);
  return keep;
}

/** Year ticks for an array of ISO dates: {i, label} at the first point of each (stepped) year. */
export function yearTicks(dates, width) {
  const y0 = +dates[0].slice(0, 4), y1 = +dates[dates.length - 1].slice(0, 4);
  const span = y1 - y0 + 1;
  const fit = Math.max(1, Math.floor(width / 56));
  const step = [1, 2, 3, 5, 10].find((s) => span / s <= fit) || 10;
  const out = [];
  let last = null;
  for (let i = 0; i < dates.length; i++) {
    const y = +dates[i].slice(0, 4);
    if (y !== last) {
      if ((y % step) === 0 && (i > 0 || dates[i].slice(5) <= '01-15')) out.push({ i, label: String(y) });
      last = y;
    }
  }
  return out;
}

function dashClass(d) { return d === 'dash' ? ' series--dash' : d === 'dot' ? ' series--dot' : ''; }

/**
 * Line chart over an index axis (dates). o = {dates, series:[{id,label,color,dash,values}], log, yFmt, domain?, zeroTop?,
 * endLabels?, marginRight?}. Returns {setCursor(i|null), x, hit}.
 */
export function lineChart(host, o) {
  host.innerHTML = '';
  const W = host.clientWidth || 600, H = host.clientHeight || 280;
  const m = { l: o.marginLeft || 48, r: o.marginRight ?? 70, t: 10, b: 24 };
  const n = o.dates.length;
  const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, host);
  const x = scale(0, n - 1, m.l, W - m.r);
  let lo = Infinity, hi = -Infinity;
  for (const s of o.series) for (const v of s.values) { if (v == null) continue; if (v < lo) lo = v; if (v > hi) hi = v; }
  if (o.domain) { lo = Math.min(lo, o.domain[0]); hi = Math.max(hi, o.domain[1]); }
  if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
  const tf = o.log ? Math.log : (v) => v;
  let y;
  let tks;
  if (o.log) {
    tks = logTicks(lo, hi);
    const pad = (tf(hi) - tf(lo)) * 0.04;
    y = scale(tf(lo) - pad, tf(hi) + pad, H - m.b, m.t);
  } else {
    tks = ticks(lo, hi, Math.max(3, Math.floor((H - m.t - m.b) / 44)));
    const a = Math.min(lo, tks[0]), b = Math.max(hi, tks[tks.length - 1]);
    const pad = (b - a) * 0.04;
    y = scale(a - (o.zeroTop ? 0 : pad), b + (o.zeroTop ? 0 : pad), H - m.b, m.t);
  }
  const Y = (v) => y(tf(v));
  const g = el('g', { class: 'axis' }, svg);
  for (const t of tks) {
    const yy = Y(t);
    el('line', { class: t === (o.zeroTop ? 0 : null) ? 'zeroline' : 'gridline', x1: m.l, x2: W - m.r, y1: yy, y2: yy }, g);
    el('text', { x: m.l - 8, y: yy + 4, 'text-anchor': 'end', text: o.yFmt(t) }, g);
  }
  for (const t of yearTicks(o.dates, W - m.l - m.r)) el('text', { x: x(t.i), y: H - 6, 'text-anchor': 'middle', text: t.label }, g);
  const lines = el('g', {}, svg);
  const ends = [];
  for (const s of o.series) {
    let d = '';
    let pen = false;
    for (let i = 0; i < n; i++) {
      const v = s.values[i];
      if (v == null) { pen = false; continue; }
      d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + Y(v).toFixed(1);
      pen = true;
    }
    if (s.halo !== false) el('path', { class: 'halo', d }, lines);
    el('path', { class: 'series' + dashClass(s.dash), d, stroke: s.color }, lines);
    const lastV = s.values[n - 1];
    if (lastV != null) ends.push({ s, y: Y(lastV), v: lastV });
  }
  if (o.endLabels !== false && m.r > 30) {
    const gap = 15, top = m.t + 4, bottom = H - m.b - 2;
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < gap) ends[i].y = ends[i - 1].y + gap;
    const over = ends.length ? ends[ends.length - 1].y - bottom : 0;
    if (over > 0) for (const e of ends) e.y -= over;
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < gap) ends[i].y = ends[i - 1].y + gap;
    for (const e of ends) {
      if (e.y < top || e.y > bottom + gap) continue; // would still overlap the frame: the value is in the tooltip and the table
      el('text', { class: 'endlabel', x: W - m.r + 6, y: e.y + 4, fill: e.s.textColor || e.s.color, text: o.endFmt ? o.endFmt(e.v, e.s) : o.yFmt(e.v) }, svg);
    }
  }
  const cur = el('g', { class: 'cursor' }, svg);
  const hit = el('rect', { class: 'hit', x: m.l, y: m.t, width: Math.max(0, W - m.l - m.r), height: Math.max(0, H - m.t - m.b) }, svg);
  function setCursor(i) {
    cur.innerHTML = '';
    if (i == null) return;
    const xx = x(i);
    el('line', { class: 'crosshair', x1: xx, x2: xx, y1: m.t, y2: H - m.b }, cur);
    for (const s of o.series) {
      const v = s.values[i];
      if (v == null) continue;
      el('circle', { class: 'dot', cx: xx, cy: Y(v), r: 4, fill: s.color }, cur);
    }
  }
  return { setCursor, x, hit, host, n, m, W, H };
}

/** Link several line charts (same index axis) to one cursor and one tooltip. renderTip(i) returns html. */
export function linkCursors(charts, tipEl, renderTip, { dock = false } = {}) {
  let idx = null;
  const setAll = (i) => { idx = i; for (const c of charts) c.setCursor(i); };
  const show = (c, i, px, py) => {
    setAll(i);
    tipEl.innerHTML = renderTip(i);
    tipEl.hidden = false;
    if (dock) return;
    const wrap = tipEl.parentElement;
    const bw = wrap.clientWidth;
    const tw = tipEl.offsetWidth || 200;
    let left = px + 16;
    if (left + tw > bw - 4) left = px - tw - 16;
    if (left < 0) left = 4;
    tipEl.style.left = left + 'px';
    tipEl.style.top = Math.max(0, py - 20) + 'px';
  };
  for (const c of charts) {
    const onMove = (ev) => {
      const r = c.host.getBoundingClientRect();
      const px = ev.clientX - r.left;
      const i = Math.max(0, Math.min(c.n - 1, Math.round(c.x.invert(px))));
      const wrapR = tipEl.parentElement.getBoundingClientRect();
      show(c, i, ev.clientX - wrapR.left, ev.clientY - wrapR.top);
    };
    c.hit.addEventListener('pointermove', onMove);
    c.hit.addEventListener('pointerdown', onMove);
    c.hit.addEventListener('pointerleave', () => { if (!dock) { setAll(null); tipEl.hidden = true; } });
  }
  return { get index() { return idx; }, clear() { setAll(null); tipEl.hidden = true; } };
}

/** Horizontal bars: rows = [{label, value, color, strong}]. Values in the same unit; fmt formats them. */
export function barsH(host, { rows, fmt, min = 0 }) {
  host.innerHTML = '';
  const W = host.clientWidth || 500;
  const rowH = (host.clientWidth || 500) < 520 ? 44 : 30, H = rows.length * rowH + 6;
  host.style.height = H + 'px';
  const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, host);
  const narrow = W < 520;
  const labelW = narrow ? 4 : Math.min(220, Math.max(120, W * 0.36));
  let lo = Math.min(min, ...rows.map((r) => r.value)), hi = Math.max(0, ...rows.map((r) => r.value));
  if (hi === lo) hi = lo + 1;
  const x = scale(lo, hi, labelW, W - 56);
  const zx = x(0);
  el('line', { class: 'zeroline', x1: zx, x2: zx, y1: 2, y2: H - 4 }, svg);
  rows.forEach((r, k) => {
    const yy = k * rowH + 4;
    if (narrow) el('text', { class: 'bar-name' + (r.strong ? ' strong' : ''), x: zx + 4, y: yy + 11, text: r.label }, svg);
    else el('text', { class: 'bar-name' + (r.strong ? ' strong' : ''), x: labelW - 10, y: yy + 15, 'text-anchor': 'end', text: r.label }, svg);
    const x0 = Math.min(zx, x(r.value)), w = Math.abs(x(r.value) - zx);
    const by = narrow ? yy + 16 : yy + 4, bh = narrow ? rowH - 20 : rowH - 12;
    el('rect', { class: 'bar', x: x0, y: by, width: Math.max(1, w), height: bh, fill: r.color }, svg);
    el('text', { class: 'bar-label', x: r.value >= 0 ? x(r.value) + 6 : x0 - 6, y: by + bh / 2 + 4, 'text-anchor': r.value >= 0 ? 'start' : 'end', text: fmt(r.value) }, svg);
  });
}

/** Attach a hover tooltip to marks inside host: marks carry data-tip html.
 *  Fine pointers: follows the pointer, hides on leave. Coarse pointers (touch): the tip docks under the chart on a tap and
 *  stays until the next tap elsewhere (Chromium fires pointerleave right after a touch pointerup, which used to hide it). */
export const coarsePointer = () => window.matchMedia('(pointer: coarse)').matches;
function hoverTip(host, tipEl) {
  if (!tipEl) return;
  const dock = coarsePointer();
  tipEl.classList.toggle('tooltip--dock', dock);
  const show = (t, ev) => {
    tipEl.innerHTML = t.getAttribute('data-tip');
    tipEl.hidden = false;
    if (dock) return;
    const block = tipEl.parentElement;
    const r = block.getBoundingClientRect();
    const px = ev.clientX - r.left, py = ev.clientY - r.top;
    const tw = tipEl.offsetWidth || 180;
    let left = px + 14;
    if (left + tw > block.clientWidth - 4) left = px - tw - 14;
    tipEl.style.left = Math.max(0, left) + 'px';
    tipEl.style.top = Math.max(0, py - 24) + 'px';
  };
  const move = (ev) => {
    const t = ev.target.closest('[data-tip]');
    if (!t) { if (!dock) tipEl.hidden = true; return; }
    show(t, ev);
  };
  host.addEventListener('pointermove', move);
  host.addEventListener('pointerdown', move);
  host.addEventListener('pointerleave', (ev) => { if (ev.pointerType !== 'touch' && !dock) tipEl.hidden = true; });
  if (dock && !host.dataset.tipDoc) {
    host.dataset.tipDoc = '1';
    document.addEventListener('pointerdown', (ev) => { if (!host.contains(ev.target)) tipEl.hidden = true; });
  }
}

/**
 * Vertical grouped bars. groups=[{label, tip?}], series=[{id,label,color}], values[g][s] (null = no bar).
 * Negative values hang below the zero line.
 */
export function barsGrouped(host, { groups, series, values, fmt, tipEl, domain, offScale, valueLabels }) {
  host.innerHTML = '';
  const W = host.clientWidth || 600, H = host.clientHeight || 260;
  const m = { l: 44, r: 8, t: 14, b: 26 };
  const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, host);
  const flat = values.flat().filter((v) => v != null);
  let lo = Math.min(0, ...flat), hi = Math.max(0, ...flat);
  if (domain) { lo = domain[0]; hi = domain[1]; }
  if (hi === lo) hi = lo + 1;
  const tks = ticks(lo, hi, 5);
  if (!domain) { lo = Math.min(lo, tks[0]); hi = Math.max(hi, tks[tks.length - 1]); }
  const y = scale(lo, hi, H - m.b, m.t);
  const g = el('g', { class: 'axis' }, svg);
  for (const t of tks) {
    el('line', { class: t === 0 ? 'zeroline' : 'gridline', x1: m.l, x2: W - m.r, y1: y(t), y2: y(t) }, g);
    el('text', { x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end', text: fmt(t) }, g);
  }
  const gw = (W - m.l - m.r) / groups.length;
  const inner = gw * 0.72, bw = inner / series.length;
  groups.forEach((gr, gi) => {
    const x0 = m.l + gi * gw + (gw - inner) / 2;
    el('text', { x: m.l + gi * gw + gw / 2, y: H - 8, 'text-anchor': 'middle', text: gr.label }, g);
    series.forEach((s, si) => {
      const v = values[gi][si];
      if (v == null) return;
      const clipped = Math.max(lo, Math.min(hi, v));
      const top = Math.min(y(0), y(clipped)), h = Math.abs(y(clipped) - y(0));
      const tip = `<p class="tooltip__date">${gr.label}</p><table><tr><th>${s.label}</th><td>${fmt(v)}</td></tr></table>`;
      el('rect', { class: 'bar', x: x0 + si * bw + 1, y: top, width: Math.max(1, bw - 2), height: Math.max(1, h), fill: s.color, 'data-tip': tip }, svg);
      if (valueLabels && clipped === v && bw >= 22) el('text', { class: 'bar-value', x: x0 + si * bw + bw / 2, y: v >= 0 ? top - 4 : top + h + 11, 'text-anchor': 'middle', text: fmt(v) }, svg);
      if (clipped !== v) el('text', { class: 'bar-label', x: x0 + si * bw + bw / 2, y: v > hi ? m.t - 3 : H - m.b + 12, 'text-anchor': 'middle', text: fmt(v) + (offScale || ' ↑'), 'data-tip': tip }, svg);
    });
  });
  hoverTip(host, tipEl);
}

/**
 * Stacked bars with positive and negative parts and a total marker.
 * groups=[{label, parts:[{id,label,value,color}], total, totalLabel}]
 */
export function stackedBars(host, { groups, fmt, tipEl, totalName }) {
  host.innerHTML = '';
  const W = host.clientWidth || 600, H = host.clientHeight || 280;
  const m = { l: 44, r: 8, t: 14, b: 26 };
  const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, host);
  let lo = 0, hi = 0;
  for (const gr of groups) {
    let up = 0, dn = 0;
    for (const p of gr.parts) { if (p.value >= 0) up += p.value; else dn += p.value; }
    lo = Math.min(lo, dn, gr.total); hi = Math.max(hi, up, gr.total);
  }
  const tks = ticks(lo, hi, 5);
  // the tallest bar keeps a gridline above it (and the lowest one below): extend the domain by one tick step
  const step = tks.length > 1 ? tks[1] - tks[0] : 1;
  if (tks[tks.length - 1] <= hi) tks.push(+(tks[tks.length - 1] + step).toFixed(10));
  if (tks[0] >= lo) tks.unshift(+(tks[0] - step).toFixed(10));
  lo = tks[0]; hi = tks[tks.length - 1];
  const y = scale(lo, hi, H - m.b, m.t);
  const g = el('g', { class: 'axis' }, svg);
  for (const t of tks) {
    el('line', { class: t === 0 ? 'zeroline' : 'gridline', x1: m.l, x2: W - m.r, y1: y(t), y2: y(t) }, g);
    el('text', { x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end', text: fmt(t) }, g);
  }
  const gw = (W - m.l - m.r) / groups.length;
  const bw = Math.min(64, gw * 0.5);
  groups.forEach((gr, gi) => {
    const cx = m.l + gi * gw + gw / 2;
    el('text', { x: cx, y: H - 8, 'text-anchor': 'middle', text: gr.label }, g);
    let up = 0, dn = 0;
    const rows = gr.parts.map((p) => `<tr><th>${p.label}</th><td>${fmt(p.value)}</td></tr>`).join('') + `<tr><th>${totalName}</th><td>${fmt(gr.total)}</td></tr>`;
    const tip = `<p class="tooltip__date">${gr.label}</p><table>${rows}</table>`;
    for (const p of gr.parts) {
      let a, b;
      if (p.value >= 0) { a = up; up += p.value; b = up; } else { b = dn; dn += p.value; a = dn; }
      const top = Math.min(y(a), y(b)), h = Math.abs(y(b) - y(a));
      el('rect', { class: 'bar', x: cx - bw / 2, y: top + (p.value >= 0 && a > 0 ? 1 : 0), width: bw, height: Math.max(0, h - 1), fill: p.color, 'data-tip': tip }, svg);
      // each part's own value inside its segment when it is tall and wide enough
      if (h >= 15 && bw >= 34) el('text', { class: 'bar-in', x: cx, y: top + h / 2 + 4, 'text-anchor': 'middle', text: fmt(p.value) }, svg);
    }
    // total marker: a short ink line with its value, placed to the left when it would spill past the plot
    const ty = y(gr.total);
    el('line', { x1: cx - bw / 2 - 6, x2: cx + bw / 2 + 6, y1: ty, y2: ty, stroke: 'var(--ink)', 'stroke-width': 2 }, svg);
    const tl = el('text', { class: 'bar-label', x: cx + bw / 2 + 10, y: ty + 4, text: fmt(gr.total) }, svg);
    let tw = 0;
    try { tw = tl.getBBox().width; } catch (e) { tw = 0; }
    if (cx + bw / 2 + 10 + tw > W - m.r) { tl.setAttribute('x', cx - bw / 2 - 10); tl.setAttribute('text-anchor', 'end'); }
  });
  hoverTip(host, tipEl);
}

/**
 * Lines over a small numeric x axis with markers. o={xs, series:[{label,color,dash,values}], xFmt, yFmt, highlight (x value)}
 */
export function dotLine(host, o) {
  host.innerHTML = '';
  const W = host.clientWidth || 500, H = host.clientHeight || 220;
  // axis titles (optional): the y title above the axis, the x title under the tick labels
  const m = { l: 48, r: 16, t: o.yTitle ? 26 : 12, b: o.xTitle ? 44 : 28 };
  const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, host);
  if (o.yTitle) el('text', { class: 'axis-title', x: 4, y: 11, text: o.yTitle + ' ↑' }, svg);
  if (o.xTitle) el('text', { class: 'axis-title', x: m.l + (W - m.l - m.r) / 2, y: H - 4, 'text-anchor': 'middle', text: o.xTitle }, svg);
  const flat = o.series.flatMap((s) => s.values).filter((v) => v != null);
  let lo = Math.min(...flat), hi = Math.max(...flat);
  if (hi === lo) hi = lo + 1;
  const tks = ticks(lo, hi, 4);
  lo = Math.min(lo, tks[0]); hi = Math.max(hi, tks[tks.length - 1]);
  const x = scale(o.xs[0], o.xs[o.xs.length - 1], m.l, W - m.r);
  const y = scale(lo, hi, H - m.b, m.t);
  const g = el('g', { class: 'axis' }, svg);
  for (const t of tks) {
    el('line', { class: t === 0 ? 'zeroline' : 'gridline', x1: m.l, x2: W - m.r, y1: y(t), y2: y(t) }, g);
    el('text', { x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end', text: o.yFmt(t) }, g);
  }
  for (const xv of o.xs) el('text', { x: x(xv), y: H - m.b + 18, 'text-anchor': 'middle', text: o.xFmt(xv) }, g);
  if (o.highlight != null) el('line', { class: 'crosshair', x1: x(o.highlight), x2: x(o.highlight), y1: m.t, y2: H - m.b }, svg);
  for (const s of o.series) {
    const d = o.xs.map((xv, i) => (i ? 'L' : 'M') + x(xv).toFixed(1) + ' ' + y(s.values[i]).toFixed(1)).join('');
    el('path', { class: 'halo', d }, svg);
    el('path', { class: 'series' + dashClass(s.dash), d, stroke: s.color }, svg);
    o.xs.forEach((xv, i) => {
      const hl = xv === o.highlight;
      el('circle', { class: 'mark', cx: x(xv), cy: y(s.values[i]), r: hl ? 5.5 : 3.5, fill: s.color }, svg);
    });
  }
  // one hit target per x: the tooltip lists every series at that funding rate
  o.xs.forEach((xv, i) => {
    const rows = o.series.map((s) => `<tr><th>${s.label}</th><td>${o.yFmt(s.values[i])}</td></tr>`).join('');
    el('circle', { class: 'mark-hit', cx: x(xv), cy: y(o.series[0].values[i]), r: 14,
      'data-tip': `<p class="tooltip__date">${o.xFmt(xv)}</p><table>${rows}</table>` }, svg);
    for (let k = 1; k < o.series.length; k++) el('circle', { class: 'mark-hit', cx: x(xv), cy: y(o.series[k].values[i]), r: 14,
      'data-tip': `<p class="tooltip__date">${o.xFmt(xv)}</p><table>${rows}</table>` }, svg);
  });
  hoverTip(host, o.tipEl);
}
