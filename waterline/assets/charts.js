// Hand-written SVG charts. Colours come from CSS custom properties (var(--s-*)), so a theme switch
// repaints without re-rendering.

import { decimate } from './calc.js';

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
  f.domain = [d0, d1];
  f.range = [r0, r1];
  return f;
}

export function niceStep(span, count) {
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

/** Year ticks (indices of the first trading day of a year) that fit the width. */
export function yearTicks(dates, a, b, width) {
  const y0 = +dates[a].slice(0, 4), y1 = +dates[b].slice(0, 4);
  const span = y1 - y0 + 1;
  const fit = Math.max(1, Math.floor(width / 62));
  const step = [1, 2, 3, 5, 10].find((s) => span / s <= fit) || 10;
  const out = [];
  let lastYear = null;
  for (let i = a; i <= b; i++) {
    const y = +dates[i].slice(0, 4);
    if (y !== lastYear) {
      if (i !== a || dates[i].slice(5) <= '01-10') {
        if ((y % step) === 0 || (step === 1)) out.push({ i, y });
      }
      lastYear = y;
    }
  }
  // Short ranges: month ticks instead.
  if (out.length < 2) {
    const m = [];
    let last = null;
    const months = (b - a) / 21;
    const ms = months <= 8 ? 1 : months <= 18 ? 3 : 6;
    for (let i = a; i <= b; i++) {
      const key = dates[i].slice(0, 7);
      if (key !== last) {
        const mo = +dates[i].slice(5, 7);
        if (i !== a && ((mo - 1) % ms) === 0) m.push({ i, y: null, ym: key });
        last = key;
      }
    }
    return m;
  }
  return out;
}

/** Log ticks for growth of 10,000: nice values inside [min, max]. */
export function logTicks(min, max, maxCount) {
  const cand = [];
  for (let e = Math.floor(Math.log10(min)) - 1; e <= Math.ceil(Math.log10(max)) + 1; e++) {
    for (const m of [1, 1.5, 2, 3, 4, 5, 6, 8]) cand.push(m * Math.pow(10, e));
  }
  let inside = cand.filter((v) => v >= min && v <= max);
  const keepers = [[1, 2, 5], [1, 2, 3, 5], [1, 1.5, 2, 3, 4, 5, 6, 8]];
  for (const set of keepers.slice().reverse()) {
    const c = inside.filter((v) => set.some((m) => Math.abs(v / Math.pow(10, Math.floor(Math.log10(v) + 1e-9)) - m) < 1e-6));
    if (c.length <= maxCount) { inside = c; break; }
  }
  if (inside.length > maxCount) inside = inside.filter((_, i) => i % Math.ceil(inside.length / maxCount) === 0);
  return inside;
}

function pathD(idx, xs, ys) {
  let d = '';
  for (let j = 0; j < idx.length; j++) {
    const k = idx[j];
    const y = ys(k);
    if (!Number.isFinite(y)) continue;
    d += (d ? 'L' : 'M') + xs(k).toFixed(1) + ',' + y.toFixed(1);
  }
  return d;
}

/**
 * A time chart over offsets 0..len-1 (len = b - a + 1).
 * opts: { width, height, margin, kind: 'growth' | 'dd', log, series: [{id, vals, color, dash, width, area, cls}],
 *         bands: [{s, e, label}], xTicks: [{k, label}], yFmt, waterLabel, depth, animate, title }
 */
export function timeChart(container, opts) {
  container.textContent = '';
  const W = opts.width || container.clientWidth || 600;
  const H = opts.height || container.clientHeight || 260;
  const m = Object.assign({ t: 10, r: 14, b: 26, l: 52 }, opts.margin || {});
  const len = opts.len;
  const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true', focusable: 'false' }, container);
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const x = scale(0, Math.max(1, len - 1), m.l, m.l + iw);
  let y, yTickVals;
  let lo = Infinity, hi = -Infinity;
  for (const s of opts.series) for (let k = 0; k < s.vals.length; k++) {
    const v = s.vals[k];
    if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
  }
  if (!Number.isFinite(lo)) { lo = opts.kind === 'dd' ? -0.1 : 0.9; hi = opts.kind === 'dd' ? 0 : 1.1; }
  if (opts.kind === 'dd') {
    // The depth scale reaches at least opts.minFloor (the S&P 500's worst fall), so hiding a deep series never
    // zooms the water in and exaggerates small falls. Bands stay at fixed 10% steps.
    lo = Math.min(lo, opts.minFloor ?? -0.05);
    const unit = -lo > 0.12 ? 0.1 : 0.05;
    lo = -Math.ceil((-lo * 1.03) / unit - 1e-9) * unit;
    y = scale(lo, 0, m.t + ih, m.t);
    const span = -lo;
    const tstep = span > 0.45 && ih < 170 ? 0.2 : span >= 0.2 ? 0.1 : span > 0.1 ? 0.05 : 0.02;
    yTickVals = [];
    for (let v = 0; v >= lo - 1e-9; v -= tstep) yTickVals.push(+v.toFixed(6));
  } else if (opts.log) {
    lo = Math.min(lo, opts.base ?? lo); hi = Math.max(hi, opts.base ?? hi);
    const pad = (Math.log(hi) - Math.log(lo)) * 0.06 || 0.05;
    const L0 = Math.log(lo) - pad, L1 = Math.log(hi) + pad;
    const ly = scale(L0, L1, m.t + ih, m.t);
    y = (v) => ly(Math.log(v));
    y.invert = (p) => Math.exp(ly.invert(p));
    yTickVals = logTicks(Math.exp(L0), Math.exp(L1), Math.max(3, Math.floor(ih / 42)));
  } else {
    lo = Math.min(lo, opts.base ?? lo); hi = Math.max(hi, opts.base ?? hi);
    const pad = (hi - lo) * 0.06 || 1;
    lo = Math.max(0, lo - pad); hi = hi + pad;
    y = scale(lo, hi, m.t + ih, m.t);
    yTickVals = ticks(lo, hi, Math.max(3, Math.floor(ih / 46)));
  }

  const gBack = el('g', {}, svg);
  // Depth bands under the waterline.
  if (opts.kind === 'dd' && opts.depth !== false) {
    // Nautical depth bands: one step deeper every 10%.
    for (let i = 0; i < 12; i++) {
      const top = -0.1 * i, bot = Math.max(lo, -0.1 * (i + 1));
      if (top <= lo + 1e-9) break;
      el('rect', { x: m.l, y: y(top), width: iw, height: Math.max(0, y(bot) - y(top)), class: `depth-${Math.min(4, i)}` }, gBack);
    }
  }
  // SPY fall bands: full height on the growth chart; on a drawdown chart only a thin strip along the waterline.
  for (const bnd of opts.bands || []) {
    const x0 = x(bnd.s), x1 = x(bnd.e);
    if (opts.kind === 'dd') el('rect', { x: x0, y: m.t - 5, width: Math.max(1, x1 - x0), height: 3, class: 'band-strip' }, gBack);
    else el('rect', { x: x0, y: m.t, width: Math.max(1, x1 - x0), height: ih, class: 'band' }, gBack);
  }
  // Grid + y labels.
  const gAxis = el('g', { class: 'axis' }, svg);
  for (const v of yTickVals) {
    const py = y(v);
    if (opts.kind === 'dd' && v === 0) continue;
    el('line', { x1: m.l, x2: m.l + iw, y1: py, y2: py, class: 'gridline' }, gAxis);
    el('text', { x: m.l - 8, y: py + 4, 'text-anchor': 'end', text: opts.yFmt(v) }, gAxis);
  }
  // X ticks.
  for (const t of opts.xTicks || []) {
    const px = x(t.k);
    if (px < m.l - 1 || px > m.l + iw + 1) continue;
    el('line', { x1: px, x2: px, y1: m.t + ih, y2: m.t + ih + 4, class: 'gridline' }, gAxis);
    el('text', { x: px, y: m.t + ih + 17, 'text-anchor': t.anchor || 'middle', text: t.label, class: t.zh ? 'zh' : null }, gAxis);
  }
  if (opts.kind === 'dd') {
    el('line', { x1: m.l, x2: m.l + iw, y1: y(0), y2: y(0), class: 'zeroline' }, svg);
    el('text', { x: m.l - 8, y: y(0) + 4, 'text-anchor': 'end', text: opts.yFmt(0) }, gAxis);
    if (opts.waterLabel) {
      if (opts.waterInside) el('text', { x: m.l + iw - 6, y: y(0) + 13, 'text-anchor': 'end', class: 'waterlabel', text: opts.waterLabel }, svg);
      else el('text', { x: m.l + 6, y: y(0) - 6, class: 'waterlabel', text: opts.waterLabel }, svg);
    }
  } else {
    el('line', { x1: m.l, x2: m.l + iw, y1: m.t + ih, y2: m.t + ih, class: 'gridline' }, gAxis);
    if (opts.base) {
      el('line', { x1: m.l, x2: m.l + iw, y1: y(opts.base), y2: y(opts.base), class: 'zeroline', opacity: .35 }, svg);
    }
  }

  // Series. Drawdowns keep the lower envelope of each 2-3 px bucket; growth keeps lows and highs.
  const gSeries = el('g', {}, svg);
  if (opts.animate) {
    // One clip rectangle sweeps left to right: every series advances by date in lockstep.
    const id = `reveal-${Math.random().toString(36).slice(2, 8)}`;
    const cp = el('clipPath', { id }, el('defs', {}, svg));
    el('rect', { x: m.l - 6, y: 0, width: iw + 12, height: H, class: 'reveal-rect' }, cp);
    gSeries.setAttribute('clip-path', `url(#${id})`);
  }
  const dd = opts.kind === 'dd';
  const buckets = dd ? Math.max(50, Math.round(iw / (iw < 500 ? 2 : 3))) : Math.max(50, Math.round(iw / 1.5));
  const paths = {};
  for (const s of opts.series) {
    const idx = decimate(s.vals, buckets, dd ? 'min' : 'minmax');
    const d = pathD(idx, x, (k) => y(s.vals[k]));
    if (s.area && dd) {
      const first = idx.find((k) => Number.isFinite(s.vals[k]));
      const lastK = idx[idx.length - 1];
      el('path', { d: `${d}L${x(lastK).toFixed(1)},${y(0).toFixed(1)}L${x(first).toFixed(1)},${y(0).toFixed(1)}Z`, class: `area${s.id === 'spy' ? ' area--spy' : ''}`, style: `fill:${s.color}` }, gSeries);
    }
    if (s.halo) el('path', { d, class: 'halo' }, gSeries);
    const p = el('path', {
      d, class: `series ${s.cls || ''} ${s.dash === 'dash' ? 'series--dash' : ''} ${s.dash === 'dot' ? 'series--dot' : ''}`,
      style: `stroke:${s.color};${s.width ? 'stroke-width:' + s.width : ''}`,
    }, gSeries);
    paths[s.id] = p;
  }

  // Cursor layer.
  const gCursor = el('g', { visibility: 'hidden' }, svg);
  const cross = el('line', { y1: m.t, y2: m.t + ih, class: 'crosshair' }, gCursor);
  const dots = opts.series.map((s) => el('circle', { r: 4, class: 'dot', style: `fill:${s.color}` }, gCursor));
  const hit = el('rect', { x: m.l, y: m.t, width: iw, height: ih, class: 'hit' }, svg);

  function setCursor(k) {
    if (k === null || k === undefined) { gCursor.setAttribute('visibility', 'hidden'); return; }
    gCursor.setAttribute('visibility', 'visible');
    const px = x(k);
    cross.setAttribute('x1', px); cross.setAttribute('x2', px);
    opts.series.forEach((s, j) => {
      const v = s.vals[k];
      if (Number.isFinite(v)) { dots[j].setAttribute('cx', px); dots[j].setAttribute('cy', y(v)); dots[j].setAttribute('visibility', 'visible'); }
      else dots[j].setAttribute('visibility', 'hidden');
    });
  }
  function kAt(clientX) {
    const r = svg.getBoundingClientRect();
    const px = clientX - r.left;
    return Math.max(0, Math.min(len - 1, Math.round(x.invert(px))));
  }
  return { svg, x, y, m, iw, ih, W, H, setCursor, kAt, hit, paths, gSeries, gBack };
}

/**
 * Right-edge labels for the last value of each series, pushed apart to a minimum vertical gap.
 * items: [{ y, text, color }] in chart pixels.
 */
export function endLabels(ch, items, { gap = 13, dx = 6 } = {}) {
  const sorted = items.slice().sort((a, b) => a.y - b.y);
  const top = ch.m.t + 4, bottom = ch.m.t + ch.ih;
  for (let i = 0; i < sorted.length; i++) sorted[i].ly = Math.max(sorted[i].y, i ? sorted[i - 1].ly + gap : top);
  for (let i = sorted.length - 1; i >= 0; i--) {
    const cap = i === sorted.length - 1 ? bottom : sorted[i + 1].ly - gap;
    if (sorted[i].ly > cap) sorted[i].ly = cap;
  }
  for (const it of sorted) {
    el('text', { x: ch.m.l + ch.iw + dx, y: it.ly + 4, class: 'endlabel', style: `fill:${it.color}`, text: it.text }, ch.svg);
  }
}

/** Wire pointer + keyboard interaction to a set of linked charts. onMove(k|null). */
export function linkCursor(charts, len, onMove) {
  let current = null;
  for (const c of charts) {
    const target = c.hit;
    const move = (ev) => { current = c.kAt(ev.clientX); onMove(current, ev); };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerdown', (ev) => { move(ev); });
    target.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') { current = null; onMove(null); } });
  }
  return {
    step(d) { current = current === null ? len - 1 : Math.max(0, Math.min(len - 1, current + d)); onMove(current, null); },
    clear() { current = null; onMove(null); },
    get k() { return current; },
  };
}

/** Position a tooltip box inside its offset parent next to an x position. */
export function placeTip(tip, host, px, py) {
  const hw = host.clientWidth;
  tip.hidden = false;
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  let left = px + 16;
  if (left + tw > hw - 4) left = px - tw - 16;
  if (left < 4) left = Math.max(4, Math.min(hw - tw - 4, px - tw / 2));
  let top = Math.max(0, py - th / 2);
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}
