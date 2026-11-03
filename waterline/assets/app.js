// Waterline: the page. Plain ES modules, no build step.
import {
  STR, FALL_NAMES, CATEGORY_ZH, WHERE_LONG, FUND_ZH, MODELS_ZH, HOLDINGS_ZH, PLACE_ZH,
  CHECKS_ZH, CHECKS_EN, CAVEATS_ZH, STEPS, DONTS, LIMITS, GLOSSARY, METHOD,
} from './i18n.js';
import * as C from './calc.js';
import { el, timeChart, linkCursor, placeTip, yearTicks, scale, ticks, endLabels } from './charts.js';

/* ------------------------------------------------------------------ state */
const S = {
  lang: document.documentElement.getAttribute('data-lang') === 'zh' ? 'zh' : 'en',
  data: null, ctx: null, end: 0,
  ex: { sel: new Set(['spy', 'conservative', 'core', 'growth']), preset: '2008', a: 0, b: 0, ccy: 'USD', scale: 'log' },
  fa: { ccy: 'USD', k: 6 },
  mo: { tab: 'core' },
  bu: { w: { stocks: 30, cash: 17.5, treasuries: 17.5, gold: 17.5, trend: 17.5 }, version: 'ibkr', win: '2020', ccy: 'USD' },
  fu: { near: [], set: 'curated', q: '', cat: 'all', where: new Set(['lse', 'sgx', 'us_etf', 'us_mf', 'research']), win: '2015', ccy: 'USD', view: 'chart', sel: 'CSPX.L', sort: { col: 'ulcer', dir: 1 }, focus: -1 },
};
const ROLES = ['stocks', 'cash', 'treasuries', 'gold', 'trend'];
const VERSION_BLOCKS = {
  research: { stocks: 'SPY', cash: 'CASH', treasuries: 'IEF', gold: 'GLD', trend: 'TREND' },
  ibkr: { stocks: 'CSPX.L', cash: 'IB01.L', treasuries: 'CBU0.L', gold: 'IGLN.L', trend: 'DBMF' },
};
const SERIES = [
  { id: 'spy', color: 'var(--s-spy)', cls: 'series--spy' },
  { id: 'conservative', color: 'var(--s-conservative)' },
  { id: 'core', color: 'var(--s-core)', width: 2.4 },
  { id: 'growth', color: 'var(--s-growth)' },
  { id: 'twin', color: 'var(--s-twin)', dash: 'dash' },
  { id: 'core_ibkr', color: 'var(--s-core_ibkr)', dash: 'dot' },
];
const SERIES_COLOR = { spy: 'var(--s-spy)', SPY: 'var(--s-spy)', conservative: 'var(--s-conservative)', core: 'var(--s-core)', growth: 'var(--s-growth)', twin: 'var(--s-twin)', core_twin: 'var(--s-twin)', core_ibkr: 'var(--s-core_ibkr)' };
/** Darker steps of the series hues for small text (WCAG AA); lines keep SERIES_COLOR. */
const SERIES_TEXT = { spy: 'var(--s-spy-text)', SPY: 'var(--s-spy-text)', conservative: 'var(--s-conservative-text)', core: 'var(--s-core-text)', growth: 'var(--s-growth-text)', twin: 'var(--s-twin-text)', core_twin: 'var(--s-twin-text)', core_ibkr: 'var(--s-core_ibkr-text)' };
const MINUS = '−';
/** Frozen headline figures for the first paint, before showcase.json arrives (JS overwrites them on load). */
const HERO_STATIC = {
  core: { mdd: -0.1550, f10: 1, cagr: 0.0700 }, spy: { mdd: -0.5229, f10: 8, cagr: 0.1122 },
  test: { core: -0.0876, spy: -0.3372 }, start: '2008-01-02', end: '2026-10-27', t0: '2020-01-02', t1: '2026-10-27', low: '2009-03-09',
};
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = () => window.matchMedia('(pointer: coarse)').matches;

/* ------------------------------------------------------------------ i18n + format */
function t(key, vars) {
  let s = STR[S.lang][key];
  if (s === undefined) s = STR.en[key];
  if (s === undefined) return key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : ''));
  return s;
}
const zh = () => S.lang === 'zh';
function pct(x, d = 1, sign = false) {
  if (x === null || x === undefined || !Number.isFinite(x)) return t('dash');
  const v = x * 100;
  const f = Math.pow(10, d);
  const s = (Math.round(Math.abs(v) * f + 1e-6) / f).toFixed(d);
  const isZero = +s === 0;
  return (v < 0 && !isZero ? MINUS : (sign && v > 0 && !isZero ? '+' : '')) + s + '%';
}
function signed(v, d = 1) {
  const f = Math.pow(10, d);
  const s = (Math.round(Math.abs(v) * f + 1e-6) / f).toFixed(d);
  return (v < 0 && +s !== 0 ? MINUS : (v > 0 && +s !== 0 ? '+' : '')) + s;
}
function ptsTxt(x, d = 1) { return x === null || !Number.isFinite(x) ? t('dash') : t('pts', { v: signed(x * 100, d) }); }
function pctAbs(x, d = 1) { return x === null || !Number.isFinite(x) ? t('dash') : pct(Math.abs(x), d); }
function pain(x) { return x === null || !Number.isFinite(x) ? t('dash') : (x * 100).toFixed(1); }
function int(n) { return Math.round(n).toLocaleString('en-US'); }
function money(v, ccy = 'USD', compact = false) {
  if (zh()) {
    const unit = ccy === 'SGD' ? '新元' : '美元';
    // Compact Chinese money uses 万 throughout (0.5万, 1万, 2.5万, 30万) so an axis never mixes formats.
    if (compact) return `${(v / 10000).toFixed(v >= 100000 ? 0 : v >= 10000 && v % 10000 === 0 ? 0 : 1).replace(/\.0$/, '')}万${unit}`;
    return `${int(v)}${unit}`;
  }
  const p = ccy === 'SGD' ? 'S$' : 'US$';
  if (compact) {
    if (Math.abs(v) >= 1e6) return `${p}${(v / 1e6).toFixed(1).replace(/\.0$/, '')}m`;
    if (Math.abs(v) >= 1e3) return `${p}${(v / 1e3).toFixed(v >= 1e5 ? 0 : 1).replace(/\.0$/, '')}k`;
  }
  return `${p}${int(v)}`;
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function dLong(iso) { const [y, m, d] = iso.split('-').map(Number); return zh() ? `${y}年${m}月${d}日` : `${d} ${MON[m - 1]} ${y}`; }
function dMonth(iso) { const [y, m] = iso.split('-').map(Number); return zh() ? `${y}年${m}月` : `${MON[m - 1]} ${y}`; }
/** Approximate amounts, rounded to US$1,000 (no false precision): 'US$343,000' / '34.3 万美元'. */
function moneyApprox(v) {
  const r = Math.round(v / 1000) * 1000;
  return zh() ? `${(r / 10000).toFixed(1).replace(/\.0$/, '')} 万美元` : `US$${int(r)}`;
}
function ccyName(c) { return zh() ? (c === 'SGD' ? '新元' : '美元') : (c === 'SGD' ? 'SGD' : 'USD'); }
function sname(id) { return t(`name_${id}`); }
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function swatch(color, dash) { return `<span class="swatch${dash === 'dash' ? ' swatch--dash' : dash === 'dot' ? ' swatch--dot' : ''}" style="color:${color}" aria-hidden="true"></span>`; }
function fallName(lowIso) { const n = FALL_NAMES[lowIso]; return n ? n[S.lang] : dMonth(lowIso); }
function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }
function ccyOptions() { return [{ value: 'USD', label: ccyName('USD') }, { value: 'SGD', label: ccyName('SGD') }]; }

/* Term definitions that open on tap, click or keyboard (title attributes are invisible on touch screens). */
const INFO = { ulcer: ['info_ulcer_t', 'info_ulcer'], edge: ['info_edge_t', 'info_edge'], f10: ['info_f10_t', 'info_f10'] };
function infoBtn(key) {
  const [tk] = INFO[key];
  return `<button type="button" class="info" data-info="${key}" aria-expanded="false" aria-label="${esc(t('info_btn', { term: t(tk) }))}">i</button>`;
}
let popEl = null, popOwner = null;
function closePopover() {
  if (!popEl) return;
  popEl.remove(); popEl = null;
  if (popOwner) { popOwner.setAttribute('aria-expanded', 'false'); }
  popOwner = null;
}
function openPopover(btn) {
  const same = popOwner === btn;
  closePopover();
  if (same) return;
  const [tk, dk] = INFO[btn.dataset.info];
  popEl = document.createElement('div');
  popEl.className = 'popover'; popEl.id = 'popover'; popEl.setAttribute('role', 'note');
  popEl.innerHTML = `<b>${esc(t(tk))}</b>${esc(t(dk))} <a href="#glossary-h">${esc(t('info_more'))}</a>`;
  document.body.appendChild(popEl);
  btn.setAttribute('aria-expanded', 'true'); btn.setAttribute('aria-controls', 'popover');
  popOwner = btn;
  const r = btn.getBoundingClientRect();
  const w = popEl.offsetWidth;
  const left = Math.max(16, Math.min(window.innerWidth - w - 16, r.left + window.scrollX - w / 2 + r.width / 2));
  popEl.style.left = `${left}px`;
  popEl.style.top = `${r.bottom + window.scrollY + 8}px`;
  popEl.querySelector('a').addEventListener('click', closePopover);
}
document.addEventListener('click', (ev) => {
  const b = ev.target.closest && ev.target.closest('button.info');
  if (b) { ev.preventDefault(); ev.stopPropagation(); openPopover(b); return; }
  if (popEl && !popEl.contains(ev.target)) closePopover();
}, true);
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && popEl) { const o = popOwner; closePopover(); o?.focus(); } });

/* ------------------------------------------------------------------ generic widgets */
function segmented(host, options, current, onPick, { radio = true } = {}) {
  host.textContent = '';
  const btns = options.map((o) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = o.label;
    b.dataset.value = o.value;
    if (radio) b.setAttribute('role', 'radio');
    const on = o.value === current;
    b.setAttribute(radio ? 'aria-checked' : 'aria-pressed', on ? 'true' : 'false');
    if (radio) b.tabIndex = on ? 0 : -1;
    if (o.disabled) { b.setAttribute('aria-disabled', 'true'); if (o.title) b.title = o.title; }
    b.addEventListener('click', () => { if (!o.disabled || o.allowDisabled) onPick(o.value); });
    host.appendChild(b);
    return b;
  });
  if (radio) {
    host.onkeydown = (ev) => {
      const i = btns.indexOf(document.activeElement);
      if (i < 0) return;
      let j = null;
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') j = (i + 1) % btns.length;
      if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') j = (i - 1 + btns.length) % btns.length;
      if (j === null) return;
      ev.preventDefault();
      const o = options[j];
      if (!o.disabled) { onPick(o.value); requestAnimationFrame(() => host.querySelector(`[data-value="${CSS.escape(String(o.value))}"]`)?.focus()); }
    };
  }
}
function whenIdle(fn) { (window.requestIdleCallback || ((f) => setTimeout(f, 60)))(fn); }

/* ------------------------------------------------------------------ data helpers */
function checkRow(id) { return S.data.checks.find((c) => c.id === id); }
const liveCache = new Map();
/** Full-precision metrics for a reference row, recomputed from the daily blocks (avoids double rounding). */
function liveRow(id) {
  if (liveCache.has(id)) return liveCache.get(id);
  const row = checkRow(id);
  if (!row) return null;
  const a = winIdx(row.window);
  const r = C.mixReturns(S.ctx, row.blocks, row.currency);
  const m = C.metrics(S.ctx, r, a, S.end, row.currency);
  const out = { ...row, m };
  liveCache.set(id, out);
  return out;
}
function seriesWeights(id) {
  switch (id) {
    case 'spy': return { SPY: 1 };
    case 'twin': return { SPY: 0.3, CASH: 0.7 };
    case 'core_ibkr': return checkRow('core|ibkr|2020|USD').blocks;
    default: return checkRow(`${id}|research|2008|USD`).blocks;
  }
}
function winIdx(w) { return S.ctx.index.get(S.data.windows[w].start); }
function episodes(ccy) { return S.data.falls[ccy === 'SGD' ? 'SGD' : 'USD'].episodes; }

/* ================================================================== HERO */
function renderHero() {
  const spy = liveRow('spy|spy|2008|USD').m, core = liveRow('core|research|2008|USD').m;
  const host = document.getElementById('hero-chart');
  host.classList.remove('is-loading');
  const a = winIdx('2008'), b = S.end, ctx = S.ctx;
  const rs = C.mixReturns(ctx, { SPY: 1 }, 'USD');
  const rc = C.mixReturns(ctx, seriesWeights('core'), 'USD');
  const ds = C.curves(rs, a, b).dd, dc = C.curves(rc, a, b).dd;
  const W = host.clientWidth, H = host.clientHeight, narrow = W < 560;
  const firstRender = !host.dataset.drawn && !reducedMotion();
  const ch = timeChart(host, {
    width: W, height: H, len: b - a + 1, kind: 'dd', animate: firstRender,
    margin: { t: 18, r: narrow ? 8 : 20, b: 26, l: narrow ? 40 : 48 },
    series: [
      { id: 'spy', vals: ds, color: 'var(--s-spy)', area: true, width: 1.4 },
      { id: 'core', vals: dc, color: 'var(--s-core)', width: 2.4, halo: true },
    ],
    xTicks: yearTicks(ctx.dates, a, b, W - 60).map((tk) => ({ k: tk.i - a, label: String(tk.y) })),
    yFmt: (v) => pct(v, 0), waterLabel: t('waterline'),
  });
  host.dataset.drawn = '1';
  const lowAt = (dd) => { let k = 0; for (let i = 1; i < dd.length; i++) if (dd[i] < dd[k]) k = i; return k; };
  // Each label appears when the sweep passes its trough (delay = start + duration x position).
  const group = (k) => el('g', firstRender ? { class: 'fade-in', style: `--d:${(0.25 + 2.2 * (ch.x(k) - ch.m.l) / ch.iw + 0.1).toFixed(2)}s` } : {}, ch.svg);
  // The two depths are the typographic climax: S&P 500 in display type in the deep water, Core beside its own trough.
  const kS = lowAt(ds), kC = lowAt(dc);
  {
    const g = group(kS), px = ch.x(kS), py = ch.y(ds[kS]);
    el('circle', { cx: px, cy: py, r: 4.5, style: 'fill:var(--s-spy)', class: 'dot' }, g);
    el('line', { x1: px + 6, y1: py, x2: px + 22, y2: py, class: 'annot-line' }, g);
    el('text', { x: px + 27, y: py - 14, class: 'annot-name', text: `${t('spy_short')} · ${dMonth(ctx.dates[a + kS])}` }, g);
    el('text', { x: px + 26, y: py + 12, class: 'annot-big', style: 'fill:var(--s-spy-text)', text: pct(spy.mdd) }, g);
  }
  {
    const g = group(kC), px = ch.x(kC), py = ch.y(dc[kC]);
    el('circle', { cx: px, cy: py, r: 4.5, style: 'fill:var(--s-core)', class: 'dot' }, g);
    // Below the trough: the line climbs back on both sides, the space underneath is open (SPY's pocket).
    el('line', { x1: px, y1: py + 6, x2: px, y2: py + 14, class: 'annot-line' }, g);
    el('text', { x: px - 3, y: py + 34, class: 'annot-mid', style: 'fill:var(--s-core-text)', text: pct(core.mdd) }, g);
    el('text', { x: px - 2, y: py + 50, class: 'annot-name', text: `${t('core_short')} · ${dMonth(ctx.dates[a + kC])}` }, g);
  }
  // The other deep S&P 500 falls (20%+), named under their troughs in the open water: the storm in numbers.
  // Values are read off the plotted line, so the label always matches the curve it sits under.
  // Only falls that started from a fresh high, so the plotted depth equals the fall's own depth (section 01).
  const deep = episodes('USD').filter((e) => !e.inner && ctx.index.has(e.peak) && ctx.index.get(e.peak) - a > kS)
    .map((e) => ({ e, k: ctx.index.get(e.low) - a })).filter((o) => ds[o.k] <= -0.2 && Math.abs(ds[o.k] - o.e.depth) < 0.0005)
    .filter((o) => !narrow || o.e.low === '2020-03-23');
  for (const { e, k } of deep) {
    const name = t(e.low === '2020-03-23' ? 'hero_covid' : e.low.startsWith('2022') ? 'hero_2022' : '') || fallName(e.low);
    const g = group(k), px = ch.x(k), py = ch.y(ds[k]);
    el('circle', { cx: px, cy: py, r: 3, style: 'fill:var(--s-spy)', class: 'dot' }, g);
    el('text', { x: px, y: py + 22, 'text-anchor': 'middle', class: 'annot-mid', style: 'fill:var(--s-spy-text)', text: pct(ds[k]) }, g);
    el('text', { x: px, y: py + 38, 'text-anchor': 'middle', class: 'annot-name annot-name--soft', text: narrow ? name : `${name} · ${dMonth(e.low)}` }, g);
  }
  // Where the one out-of-sample test begins: everything to the left is the period the mix was designed on.
  {
    const kT = ctx.index.get(HERO_STATIC.t0) - a;
    if (kT > 0 && kT < b - a) {
      const px = Math.round(ch.x(kT)) + 0.5;
      const g = el('g', { class: 'oos' }, ch.svg);
      el('line', { x1: px, x2: px, y1: ch.m.t - 12, y2: ch.m.t + ch.ih, class: 'oos__line' }, g);
      el('text', { x: px + 6, y: ch.m.t - 5, class: 'waterlabel oos__label', text: t(narrow ? 'hero_oos_short' : 'hero_oos') }, g);
    }
  }
  host.setAttribute('aria-label', t('hero_chart_label', { spy_mdd_abs: pctAbs(spy.mdd), core_mdd_abs: pctAbs(core.mdd), spy_low: dMonth(ctx.dates[a + kS]) }));

  // Hover readout on the hero too (light): crosshair + dots.
  const tip = document.createElement('div');
  tip.className = 'tooltip'; tip.hidden = true; host.appendChild(tip);
  linkCursor([ch], b - a + 1, (k) => {
    ch.setCursor(k);
    if (k === null) { tip.hidden = true; return; }
    tip.innerHTML = `<p class="tooltip__date">${dLong(ctx.dates[a + k])}</p><table><tbody>
      <tr><th>${swatch('var(--s-spy)')} ${esc(t('spy_short'))}</th><td>${pct(ds[k])}</td></tr>
      <tr><th>${swatch('var(--s-core)')} ${esc(t('core_short'))}</th><td>${pct(dc[k])}</td></tr></tbody></table>`;
    placeTip(tip, host, ch.x(k), Math.max(30, ch.y(Math.min(ds[k], dc[k])) - 40));
  });
}

function heroFigures() {
  if (!S.data) return { core: HERO_STATIC.core, spy: HERO_STATIC.spy };
  return { core: liveRow('core|research|2008|USD').m, spy: liveRow('spy|spy|2008|USD').m };
}
function renderHeroNumbers() {
  const { spy, core } = heroFigures();
  const items = [
    [t('hero_n1'), pct(core.mdd), pct(spy.mdd)],
    [t('hero_n2'), String(core.f10), String(spy.f10)],
    [t('hero_n3'), pct(core.cagr), pct(spy.cagr)],
  ];
  document.getElementById('hero-numbers').innerHTML = items.map(([label, c, sv]) => `
    <div class="sounding"><dt>${esc(label)}</dt><dd>
      <span class="big" aria-label="${esc(t('core_short'))} ${esc(c)}">${esc(c)}</span>
      <span class="who">${swatch('var(--s-core)')}${esc(t('core_short'))}</span>
      <span class="vs">${t('vs_line', { v: esc(sv), sw: swatch('var(--s-spy)'), name: esc(t('spy_short')) })}</span>
    </dd></div>`).join('');
}

/* ================================================================== EXPLORER */
let exCharts = null, exCursor = null, exData = null;
function seriesAvailable(id, a) { return C.mixStart(S.ctx, seriesWeights(id)) <= a; }

function exNote(msg) { document.getElementById('ex-note').textContent = msg; }
function renderExControls() {
  const host = document.getElementById('ex-series');
  host.textContent = '';
  for (const s of SERIES) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip';
    b.style.setProperty('--chip-c', s.color);
    const avail = seriesAvailable(s.id, S.ex.a);
    const on = S.ex.sel.has(s.id) && avail;
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    const from = dMonth(S.ctx.dates[C.mixStart(S.ctx, seriesWeights(s.id))]);
    if (!avail) { b.classList.add('chip--later'); b.title = t('ibkr_off', { date: dLong(S.ctx.dates[C.mixStart(S.ctx, seriesWeights(s.id))]) }); }
    b.innerHTML = `${swatch(s.color, s.dash)}<span>${esc(s.id === 'twin' ? t('name_twin_long') : sname(s.id))}</span>${!avail ? `<span class="chip__hint">${esc(t('from_date', { d: from }))}</span>` : ''}`;
    b.addEventListener('click', () => {
      if (!seriesAvailable(s.id, S.ex.a)) {
        S.ex.sel.add(s.id); setExWindow('2020');
        exNote(t('ibkr_from'));
        return;
      }
      const visible = [...S.ex.sel].filter((id) => seriesAvailable(id, S.ex.a));
      if (S.ex.sel.has(s.id)) {
        if (visible.length <= 1) { exNote(t('keep_one')); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
        S.ex.sel.delete(s.id);
      } else S.ex.sel.add(s.id);
      if (S.ex.preset !== 'custom' && S.ex.preset !== '2020') exNote('');
      renderExControls(); renderExplorer();
      host.querySelectorAll('.chip')[SERIES.indexOf(s)]?.focus();
    });
    host.appendChild(b);
  }
  segmented(document.getElementById('ex-window'), [
    { value: '2008', label: t('win_2008') }, { value: '2015', label: t('win_2015') }, { value: '2020', label: t('win_2020') },
    ...(S.ex.preset === 'custom' ? [{ value: 'custom', label: t('win_custom') }] : []),
  ], S.ex.preset, (v) => { if (v !== 'custom') setExWindow(v); });
  segmented(document.getElementById('ex-ccy'), ccyOptions(), S.ex.ccy, (v) => { S.ex.ccy = v; renderExControls(); renderExplorer(); });
  segmented(document.getElementById('ex-scale'), [{ value: 'log', label: t('scale_log') }, { value: 'lin', label: t('scale_lin') }], S.ex.scale, (v) => { S.ex.scale = v; renderExControls(); renderExplorer(); });
}
function setExWindow(w) {
  S.ex.preset = w; S.ex.a = winIdx(w); S.ex.b = S.end;
  if (w !== '2020') exNote('');
  renderExControls(); renderExplorer();
}

function computeEx() {
  const { a, b, ccy } = S.ex, ctx = S.ctx;
  const rows = [];
  for (const s of SERIES) {
    if (!S.ex.sel.has(s.id) || !seriesAvailable(s.id, a)) continue;
    const r = C.mixReturns(ctx, seriesWeights(s.id), ccy);
    const cv = C.curves(r, a, b);
    const m = C.metrics(ctx, r, a, b, ccy);
    const growth = new Float64Array(cv.growth.length);
    for (let k = 0; k < growth.length; k++) growth[k] = cv.growth[k] * 10000;
    rows.push({ ...s, growth, dd: cv.dd, m });
  }
  // SPY: always measured (table reference row, and the depth scale of the drawdown chart).
  let spyRow = rows.find((r) => r.id === 'spy');
  const rSpy = C.mixReturns(ctx, { SPY: 1 }, ccy);
  const spyDD = C.curves(rSpy, a, b).dd;
  let spyMin = 0; for (let k = 0; k < spyDD.length; k++) if (spyDD[k] < spyMin) spyMin = spyDD[k];
  if (!spyRow) spyRow = { id: 'spy', color: 'var(--s-spy)', m: C.metrics(ctx, rSpy, a, b, ccy), hidden: true };
  return { rows, spyRow, spyMin };
}

let exSummaryTimer = 0;
function renderExplorer() {
  const ctx = S.ctx, { a, b, ccy } = S.ex;
  const len = b - a + 1;
  exData = computeEx();
  const { rows } = exData;
  const bands = episodes(ccy).map((e) => ({ s: ctx.index.get(e.peak) - a, e: ctx.index.get(e.low) - a }))
    .filter((x) => x.e >= 0 && x.s <= len - 1).map((x) => ({ s: Math.max(0, x.s), e: Math.min(len - 1, x.e) }));
  const gHost = document.getElementById('ex-growth'), dHost = document.getElementById('ex-dd');
  const W = gHost.clientWidth;
  const narrow = W < 560;
  const xt = yearTicks(ctx.dates, a, b, W - 70 - (narrow ? 0 : 112)).map((tk) => ({ k: tk.i - a, label: tk.y ? String(tk.y) : dMonth(tk.ym + '-01'), zh: !tk.y && zh() }));
  const margin = { t: 10, r: narrow ? 8 : 138, b: 26, l: narrow ? (zh() ? 62 : 48) : (zh() ? 70 : 62) };
  const order = rows.slice().sort((p, q) => (p.id === 'core' ? 1 : 0) - (q.id === 'core' ? 1 : 0));
  const gc = timeChart(gHost, {
    len, kind: 'growth', log: S.ex.scale === 'log', base: 10000, margin, bands,
    series: order.map((r) => ({ id: r.id, vals: r.growth, color: r.color, dash: r.dash, width: r.width, cls: r.cls })),
    xTicks: xt, yFmt: (v) => money(v, ccy, true),
  });
  if (!narrow) {
    endLabels(gc, order.map((r) => ({ y: gc.y(r.growth[len - 1]), color: SERIES_TEXT[r.id], text: `${r.id === 'spy' ? 'SPY' : r.id === 'core_ibkr' ? `${t('core_short')} IBKR` : sname(r.id)} ${money(r.growth[len - 1], ccy, true)}` })));
  }
  const dc = timeChart(dHost, {
    len, kind: 'dd', margin, bands, minFloor: exData.spyMin,
    series: order.map((r) => ({ id: r.id, vals: r.dd, color: r.color, dash: r.dash, width: r.width, cls: r.cls, area: r.id === 'spy', halo: r.id === 'core' })),
    xTicks: xt, yFmt: (v) => pct(v, 0),
  });
  exCharts = [gc, dc];
  document.getElementById('ex-growth-t').textContent = t('growth_title', { money: money(10000, ccy, true), scale: t(S.ex.scale === 'log' ? 'scale_log_l' : 'scale_lin_l') });
  document.getElementById('ex-dd-t').textContent = t('dd_title');
  const start = ctx.dates[a], end = ctx.dates[b];
  gHost.setAttribute('aria-label', t('chart_growth_label', { scale: t(S.ex.scale === 'log' ? 'scale_log_l' : 'scale_lin_l'), start: dLong(start), end: dLong(end) }));
  dHost.setAttribute('aria-label', t('chart_dd_label', { start: dLong(start), end: dLong(end) }));
  // Screen-reader summary: announced once the controls settle, not on every drag step.
  const summary = t('summary_ex', {
    start: dLong(start), end: dLong(end), ccy: ccyName(ccy),
    list: rows.map((r) => t('summary_item', { name: sname(r.id), cagr: pct(r.m.cagr), mdd: pct(r.m.mdd) })).join(zh() ? '；' : '; '),
  });
  clearTimeout(exSummaryTimer);
  exSummaryTimer = setTimeout(() => { document.getElementById('ex-summary').textContent = summary; }, 600);
  if (S.ex.preset === 'custom') {
    exNote(t('custom_note', { start: dLong(start), end: dLong(end), years: (len / 252).toFixed(1) }));
  }

  const tip = document.getElementById('ex-tip');
  const charts = document.getElementById('ex-charts');
  const dock = exDock();
  // Reserve the readout's full height so the charts never jump under a dragging finger.
  dock.style.minHeight = dock.dataset.on ? `${rows.length * 25 + 80}px` : '';
  const readout = (k) => {
    const head = `<thead><tr><th></th><th>${esc(t('tip_value'))}</th><th>${esc(t('tip_dd'))}</th></tr></thead>`;
    const body = rows.map((r) => `<tr><th>${swatch(r.color, r.dash)} ${esc(sname(r.id === 'twin' ? 'twin' : r.id))}</th><td>${money(r.growth[k], ccy)}</td><td>${pct(r.dd[k])}</td></tr>`).join('');
    return `<p class="tooltip__date">${dLong(ctx.dates[a + k])}</p><table>${head}<tbody>${body}</tbody></table>`;
  };
  // At rest the docked readout shows the last day, so the strip is never an empty gap above the charts.
  const dockRest = () => { dock.innerHTML = `<p class="note tip-dock__hint">${esc(t('tip_hint'))}</p><div class="tooltip tooltip--dock">${readout(len - 1)}</div>`; };
  if (dock.dataset.on) dockRest();
  exCursor = linkCursor(exCharts, len, (k, ev) => {
    exCharts.forEach((c) => c.setCursor(k));
    if (k === null) { tip.hidden = true; if (dock.dataset.on) dockRest(); return; }
    const html = readout(k);
    if (dock.dataset.on) { tip.hidden = true; dock.innerHTML = `<p class="note tip-dock__hint">${esc(t('tip_hint'))}</p><div class="tooltip tooltip--dock">${html}</div>`; return; }
    tip.innerHTML = html;
    const hostRect = charts.getBoundingClientRect();
    const cRect = gc.svg.getBoundingClientRect();
    const px = cRect.left - hostRect.left + gc.x(k);
    let py = 40;
    if (ev && ev.clientY) py = Math.min(ev.clientY - hostRect.top, charts.clientHeight - 120);
    placeTip(tip, charts, px, py);
  });
  renderExTable();
  if (renderBrushSkip) { if (brushPaint) brushPaint(); } else renderBrush();
}
/** On touch screens the readout docks in a strip above the charts, so the finger never hides the lines. */
function exDock() {
  let dock = document.getElementById('ex-dock');
  if (!dock) {
    dock = document.createElement('div');
    dock.id = 'ex-dock'; dock.className = 'tip-dock'; dock.setAttribute('aria-hidden', 'true');
    const charts = document.getElementById('ex-charts');
    charts.parentElement.insertBefore(dock, charts);
  }
  // Re-written on every render so a language switch updates the hint too.
  if (coarse()) { dock.dataset.on = '1'; dock.innerHTML = `<p class="note" style="margin:0">${esc(t('tip_hint'))}</p>`; }
  else { delete dock.dataset.on; dock.textContent = ''; }
  return dock;
}

function renderExTable() {
  const { rows, spyRow } = exData;
  const { a, b, ccy } = S.ex;
  const table = document.getElementById('ex-table');
  document.getElementById('ex-table-cap').textContent = t('table_cap', { start: dLong(S.ctx.dates[a]), end: dLong(S.ctx.dates[b]), ccy: ccyName(ccy) });
  table.tHead.innerHTML = `<tr>
    <th scope="col">${esc(t('th_portfolio'))}</th><th scope="col">${esc(t('th_cagr'))}</th><th scope="col">${esc(t('th_mdd'))}</th>
    <th scope="col">${esc(t('th_f10'))} ${infoBtn('f10')}</th><th scope="col">${esc(t('th_ulcer'))} ${infoBtn('ulcer')}</th>
    <th scope="col">${esc(t('th_edge'))} ${infoBtn('edge')}</th>
    <th scope="col">${esc(t('th_wm'))}</th><th scope="col">${esc(t('th_luw'))}</th></tr>`;
  const list = rows.some((r) => r.id === 'spy') ? rows : [spyRow, ...rows];
  const maxDepth = Math.max(...list.map((r) => -r.m.mdd), 0.01);
  table.tBodies[0].innerHTML = list.map((r) => {
    const m = r.m;
    const edge = r.id === 'spy' ? '0.0' : (m.edge === null ? `<span class="neg-soft">${esc(t('edge_null'))}</span>` : signed(m.edge * 100));
    const edgeCls = m.edge > 0.0005 && r.id !== 'spy' ? 'pos' : '';
    return `<tr class="${r.id === 'spy' ? 'ref' : ''}">
      <th scope="row"><span class="name">${swatch(r.color, r.dash)}${esc(r.id === 'twin' && window.innerWidth >= 720 ? t('name_twin_long') : sname(r.id))}${r.hidden ? `<span class="ref-tag">${esc(t('ref_tag'))}</span>` : ''}</span></th>
      <td>${pct(m.cagr)}</td>
      <td><span class="cell-bar" style="color:${r.color}"><span style="color:var(--ink)">${pct(m.mdd)}</span><i style="width:${Math.round(40 * (-m.mdd) / maxDepth)}px"></i></span></td>
      <td>${m.f10}</td><td>${pain(m.ulcer)}</td><td class="${edgeCls}">${edge}</td><td>${pct(m.wm)}</td>
      <td>${esc(t('months', { n: m.luw.toFixed(0) }))}</td></tr>`;
  }).join('');
  document.getElementById('ex-under').innerHTML = t('ex_under');
  updateSwipeHints();
}

/* Brush: pick any period over the full history. */
function renderBrush() {
  const host = document.getElementById('ex-brush');
  host.textContent = '';
  const ctx = S.ctx, n = ctx.n;
  const W = host.clientWidth, H = host.clientHeight;
  const m = { l: 8, r: 8, t: 4, b: 16 };
  const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, host);
  const x = scale(0, n - 1, m.l, W - m.r);
  const spy = C.blockReturns(ctx, 'SPY', S.ex.ccy);
  const dd = C.curves(spy, 0, n - 1).dd;
  const y = scale(-0.6, 0, H - m.b, m.t);
  const idx = C.decimate(dd, Math.round(W / 2));
  let d = `M${x(0)},${y(0)}`;
  for (const k of idx) d += `L${x(k).toFixed(1)},${y(dd[k]).toFixed(1)}`;
  d += `L${x(n - 1)},${y(0)}Z`;
  el('path', { d, class: 'silhouette' }, svg);
  el('line', { x1: m.l, x2: W - m.r, y1: y(0), y2: y(0), class: 'zeroline', opacity: 0.4 }, svg);
  const g = el('g', { class: 'axis' }, svg);
  for (const tk of yearTicks(ctx.dates, 0, n - 1, W - 20)) { if (x(tk.i) < 16 || x(tk.i) > W - 16) continue; el('text', { x: x(tk.i), y: H - 3, 'text-anchor': 'middle', text: String(tk.y) }, g); }
  const shadeL = el('rect', { y: m.t, height: H - m.b - m.t, class: 'shade' }, svg);
  const shadeR = el('rect', { y: m.t, height: H - m.b - m.t, class: 'shade' }, svg);
  const sel = el('rect', { y: m.t, height: H - m.b - m.t, class: 'sel', role: 'presentation' }, svg);
  const mkHandle = (which) => {
    const h = el('g', { class: 'handle', tabindex: 0, role: 'slider', 'aria-label': t(which === 'a' ? 'brush_start' : 'brush_end') }, svg);
    el('rect', { x: -7, y: m.t + 6, width: 14, height: H - m.b - m.t - 12, rx: 3, class: 'grip' }, h);
    el('line', { x1: -2, x2: -2, y1: m.t + 14, y2: H - m.b - 14 }, h);
    el('line', { x1: 2, x2: 2, y1: m.t + 14, y2: H - m.b - 14 }, h);
    el('rect', { x: -22, y: 0, width: 44, height: H, class: 'hitarea' }, h);
    return h;
  };
  const hA = mkHandle('a'), hB = mkHandle('b');
  const MIN = 63;
  function paint() {
    const xa = x(S.ex.a), xb = x(S.ex.b);
    shadeL.setAttribute('x', m.l); shadeL.setAttribute('width', Math.max(0, xa - m.l));
    shadeR.setAttribute('x', xb); shadeR.setAttribute('width', Math.max(0, W - m.r - xb));
    sel.setAttribute('x', xa); sel.setAttribute('width', Math.max(1, xb - xa));
    hA.setAttribute('transform', `translate(${xa},0)`); hB.setAttribute('transform', `translate(${xb},0)`);
    for (const [h, i, lo, hi] of [[hA, S.ex.a, 0, S.ex.b - MIN], [hB, S.ex.b, S.ex.a + MIN, n - 1]]) {
      h.setAttribute('aria-valuemin', lo); h.setAttribute('aria-valuemax', hi); h.setAttribute('aria-valuenow', i);
      h.setAttribute('aria-valuetext', dLong(ctx.dates[i]));
    }
  }
  paint();
  let raf = 0;
  const commit = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const match = ['2008', '2015', '2020'].find((w) => winIdx(w) === S.ex.a && S.ex.b === S.end);
      S.ex.preset = match || 'custom';
      if (match) document.getElementById('ex-note').textContent = '';
      renderExControls();
      renderExplorerKeepBrush();
    });
  };
  const setA = (i) => { S.ex.a = Math.max(0, Math.min(S.ex.b - MIN, Math.round(i))); paint(); commit(); };
  const setB = (i) => { S.ex.b = Math.min(n - 1, Math.max(S.ex.a + MIN, Math.round(i))); paint(); commit(); };
  const drag = (target, onMove) => {
    target.addEventListener('pointerdown', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      target.setPointerCapture(ev.pointerId);
      const r = svg.getBoundingClientRect();
      const start = { px: ev.clientX - r.left, a: S.ex.a, b: S.ex.b };
      const mv = (e) => onMove(e.clientX - r.left, start);
      const up = () => { target.removeEventListener('pointermove', mv); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up); };
      target.addEventListener('pointermove', mv); target.addEventListener('pointerup', up); target.addEventListener('pointercancel', up);
    });
  };
  drag(hA, (px) => setA(x.invert(px)));
  drag(hB, (px) => setB(x.invert(px)));
  drag(sel, (px, st) => {
    const span = st.b - st.a;
    let na = Math.round(st.a + (x.invert(px) - x.invert(st.px)));
    na = Math.max(0, Math.min(n - 1 - span, na));
    S.ex.a = na; S.ex.b = na + span; paint(); commit();
  });
  const keys = (h, setter, getter) => h.addEventListener('keydown', (ev) => {
    const step = { ArrowLeft: -21, ArrowDown: -21, ArrowRight: 21, ArrowUp: 21, PageDown: -252, PageUp: 252 }[ev.key];
    if (ev.key === 'Home') { ev.preventDefault(); setter(0); return; }
    if (ev.key === 'End') { ev.preventDefault(); setter(n - 1); return; }
    if (step) { ev.preventDefault(); setter(getter() + step); }
  });
  keys(hA, setA, () => S.ex.a);
  keys(hB, setB, () => S.ex.b);
  brushPaint = paint;
}
let brushPaint = null;
let renderBrushSkip = false;
function renderExplorerKeepBrush() {
  // Re-render charts and table without rebuilding the brush (so a drag in progress continues).
  renderBrushSkip = true;
  try { renderExplorer(); } finally { renderBrushSkip = false; }
}

function exKeyboard(ev) {
  if (!exCursor) return;
  const step = { ArrowLeft: -1, ArrowRight: 1, PageDown: -21, PageUp: 21 }[ev.key];
  if (step) { ev.preventDefault(); exCursor.step(ev.shiftKey ? step * 21 : step); }
  if (ev.key === 'Escape') exCursor.clear();
}

/* ================================================================== FALLS */
const FALL_ROWS_P = ['SPY', 'conservative', 'core', 'growth', 'core_twin', 'core_ibkr'];
const FALL_ROWS_A = ['CASH', 'IEF', 'GLD', 'TREND', 'DBMF'];
function fallSet() { return S.fa.ccy === 'SGD' ? S.data.falls.SGD : S.data.falls.USD; }
function fallLabel(id) {
  if (id === 'SPY') return t('name_spy');
  if (id === 'core_twin') return t('name_core_twin');
  return sname(id);
}
function fallColor(id) { return SERIES_COLOR[id] || 'var(--ink-2)'; }
function fallDash(id) { return id === 'core_twin' ? 'dash' : id === 'core_ibkr' ? 'dot' : null; }

function renderFalls() {
  const set = fallSet(), eps = set.episodes, n = eps.length;
  if (S.fa.k >= n) S.fa.k = n - 1;
  segmented(document.getElementById('fa-ccy'), ccyOptions(), S.fa.ccy, (v) => {
    const cur = eps[S.fa.k].low;
    S.fa.ccy = v;
    const ne = fallSet().episodes;
    // keep the same event if the other currency has it
    let best = 0, bd = Infinity;
    ne.forEach((e, i) => { const dd = Math.abs(Date.parse(e.low) - Date.parse(cur)); if (dd < bd) { bd = dd; best = i; } });
    S.fa.k = best; renderFalls();
  });
  document.getElementById('fa-pos').textContent = t('fall_pos', { k: S.fa.k + 1, n });
  renderFallStrip();
  renderFallDetail();
  renderFallMatrix();
}
function selectFall(k, focusStrip = false) {
  const n = fallSet().episodes.length; S.fa.k = (k + n) % n; renderFalls();
  if (focusStrip) requestAnimationFrame(() => document.querySelectorAll('#fa-strip .marker')[S.fa.k]?.focus());
}

function renderFallStrip() {
  const host = document.getElementById('fa-strip');
  host.textContent = '';
  const ctx = S.ctx, eps = fallSet().episodes;
  const a = C.idxOnOrAfter(ctx, '2007-01-01'), b = S.end;
  const r = C.blockReturns(ctx, 'SPY', S.fa.ccy);
  // Drawdown measured over the whole history so the 2007 peak is right.
  const full = C.curves(r, 0, b).dd;
  const dd = full.slice(a);
  const W = host.clientWidth, H = host.clientHeight;
  const ch = timeChart(host, {
    width: W, height: H, len: b - a + 1, kind: 'dd', depth: true,
    margin: { t: 22, r: 10, b: 22, l: 40 },
    series: [{ id: 'spy', vals: dd, color: 'var(--s-spy)', area: true, width: 1.4 }],
    xTicks: yearTicks(ctx.dates, a, b, W - 60).map((tk) => ({ k: tk.i - a, label: String(tk.y) })), yFmt: (v) => pct(v, 0),
  });
  host.setAttribute('role', 'group');
  host.setAttribute('aria-label', t('fall_strip_label'));
  const e = eps[S.fa.k];
  const s0 = ctx.index.get(e.peak) - a, s1 = ctx.index.get(e.low) - a;
  el('rect', { x: ch.x(s0), y: ch.m.t, width: Math.max(2, ch.x(s1) - ch.x(s0)), height: ch.ih, class: 'selband' }, ch.gBack);
  const g = el('g', {}, ch.svg);
  // One tab stop for all the markers (roving tabindex): Left/Right/Home/End move and select.
  eps.forEach((ep, i) => {
    const k = ctx.index.get(ep.low) - a;
    const cur = i === S.fa.k;
    const mk = el('g', { class: 'marker', tabindex: cur ? 0 : -1, role: 'button', 'aria-label': `${t('fall_k', { k: i + 1, name: fallName(ep.low) })}, ${pct(ep.depth)}`, 'aria-current': cur ? 'true' : null }, g);
    const px = ch.x(k);
    const py = Math.min(ch.y(ep.depth) + 14, ch.m.t + ch.ih + 4);
    el('circle', { cx: px, cy: py, r: 22, class: 'hitarea' }, mk);
    el('circle', { cx: px, cy: py, r: 9 }, mk);
    el('text', { x: px, y: py + 3.5, 'text-anchor': 'middle', text: String(i + 1) }, mk);
    mk.addEventListener('click', () => selectFall(i));
    mk.addEventListener('keydown', (ev) => {
      const n = eps.length;
      const to = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: n - 1 }[ev.key];
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); selectFall(i, true); return; }
      if (to === undefined) return;
      ev.preventDefault();
      selectFall(Math.max(0, Math.min(n - 1, to)), true);
    });
  });
  ch.hit.remove();
}

/** Portfolio bars: every portfolio in its own series colour. When all lost, zero sits at the right edge and the
 *  value is printed right next to the bar end; with mixed signs the bars diverge from a centred zero. */
function portfolioBars(ids, vals) {
  const known = vals.filter((v) => v !== null && v !== undefined);
  const allDown = known.length && known.every((v) => v <= 0);
  const maxAbs = Math.max(0.01, ...known.map(Math.abs));
  return `<div class="bars-body${allDown ? ' bars--fit' : ''}">${ids.map((id, j) => {
    const v = vals[j];
    const sw = swatch(fallColor(id), fallDash(id));
    const label = `<span class="label">${sw}${esc(fallLabel(id))}</span>`;
    const color = fallColor(id);
    if (v === null || v === undefined) {
      return `<div class="bar-row">${label}<span class="track"><span class="zero" style="left:${allDown ? 100 : 50}%"></span>${allDown ? `<span class="val-in nodata" style="right:6px;color:var(--muted)">${esc(t('fall_nodata'))}</span>` : ''}</span>${allDown ? '' : `<span class="val nodata">${esc(t('fall_nodata'))}</span>`}</div>`;
    }
    if (allDown) {
      const w = Math.max(0.6, (Math.abs(v) / maxAbs) * 80);
      return `<div class="bar-row">${label}<span class="track"><span class="fill" style="right:0;width:${w}%;background:${color}"></span><span class="zero" style="left:100%"></span><span class="val-in" style="right:calc(${w}% + 6px)">${pct(v, 1, true)}</span></span></div>`;
    }
    const w = Math.min(50, (Math.abs(v) / maxAbs) * 50);
    const left = v < 0 ? 50 - w : 50;
    return `<div class="bar-row">${label}<span class="track"><span class="fill" style="left:${left}%;width:${Math.max(w, 0.6)}%;background:${color}"></span><span class="zero" style="left:50%"></span></span><span class="val">${pct(v, 1, true)}</span></div>`;
  }).join('')}</div>`;
}
/** Shock absorbers: signs are mixed, so a centred zero with loss / gain colours. */
function barRows(ids, vals, maxAbs) {
  return ids.map((id, j) => {
    const v = vals[j];
    const label = esc(fallLabel(id));
    if (v === null || v === undefined) {
      return `<div class="bar-row"><span class="label">${label}</span><span class="track"><span class="zero" style="left:50%"></span></span><span class="val nodata">${esc(t('fall_nodata'))}</span></div>`;
    }
    const w = Math.min(50, (Math.abs(v) / maxAbs) * 50);
    const left = v < 0 ? 50 - w : 50;
    return `<div class="bar-row"><span class="label">${label}</span><span class="track"><span class="fill ${v < 0 ? 'neg' : 'pos'}" style="left:${left}%;width:${Math.max(w, 0.6)}%"></span><span class="zero" style="left:50%"></span></span><span class="val">${pct(v, 1, true)}</span></div>`;
  }).join('');
}

function renderFallDetail() {
  const set = fallSet(), e = set.episodes[S.fa.k], k = S.fa.k, ctx = S.ctx;
  const pv = FALL_ROWS_P.map((id) => set.returns[id]?.[k] ?? null);
  const av = FALL_ROWS_A.map((id) => set.returns[id]?.[k] ?? null);
  const maxAbsA = Math.max(0.05, ...av.filter((v) => v !== null).map(Math.abs));
  const days = ctx.index.get(e.low) - ctx.index.get(e.peak);
  const fx = e.usd_vs_sgd;
  const host = document.getElementById('fa-detail');
  host.innerHTML = `
    <div class="fall-title">
      <h3>${esc(fallName(e.low))}</h3>
      <span class="meta">${dLong(e.peak)} → ${dLong(e.low)} · ${esc(t('fall_days', { d: days }))}</span>
      ${e.inner ? `<span class="inner">${esc(t('fall_inner'))}</span>` : ''}
      <span class="meta">${esc(t('usd_vs_sgd', { v: pct(fx, 1, true) }))}</span>
    </div>
    <div class="bars"><h4>${esc(t('fall_ports_h'))}</h4>${portfolioBars(FALL_ROWS_P, pv)}</div>
    <div class="bars"><h4>${esc(t('fall_abs_h'))}</h4>${barRows(FALL_ROWS_A, av, maxAbsA)}</div>
    <div class="fall-path"><h4 class="chart-title">${esc(t('fall_path_h'))}</h4><div class="chart" id="fa-path" role="img"></div></div>`;
  // Path chart: cumulative return from the peak to the low.
  const pathHost = document.getElementById('fa-path');
  const p0 = ctx.index.get(e.peak), p1 = ctx.index.get(e.low);
  const ids = [['spy', 'SPY'], ['core', 'core'], ['core_ibkr', 'core_ibkr']];
  const series = [];
  for (const [sid] of ids) {
    const w = seriesWeights(sid);
    if (C.mixStart(ctx, w) > p0) continue;
    const r = C.mixReturns(ctx, w, S.fa.ccy);
    const vals = new Float64Array(p1 - p0 + 1);
    let g = 1; vals[0] = 1;
    for (let i = p0 + 1; i <= p1; i++) { g *= 1 + r[i]; vals[i - p0] = g; }
    series.push({ id: sid, vals, color: SERIES_COLOR[sid], dash: sid === 'core_ibkr' ? 'dot' : null, width: sid === 'core' ? 2.4 : 1.8 });
  }
  const W = pathHost.clientWidth;
  const len = p1 - p0 + 1;
  // Ticks: always the first and the last day, plus one month in the middle when there is room.
  const xt = [{ k: 0, label: dMonth(ctx.dates[p0]), zh: zh(), anchor: 'start' }];
  if (len > 30 && W > 420) {
    const mid = Math.round(len / 2);
    xt.push({ k: mid, label: dMonth(ctx.dates[p0 + mid].slice(0, 7) + '-01'), zh: zh() });
  }
  xt.push({ k: len - 1, label: dMonth(ctx.dates[p1]), zh: zh(), anchor: 'end' });
  const ch = timeChart(pathHost, {
    width: W, height: 200, len, kind: 'growth', log: false, base: 1, margin: { t: 10, r: 84, b: 26, l: 48 },
    series, xTicks: xt, yFmt: (v) => pct(v - 1, 0),
  });
  endLabels(ch, series.map((s) => ({ y: ch.y(s.vals[len - 1]), color: SERIES_TEXT[s.id], text: `${s.id === 'spy' ? 'SPY' : s.id === 'core' ? t('core_short') : 'IBKR'} ${pct(s.vals[len - 1] - 1, 1, true)}` })));
  pathHost.setAttribute('aria-label', series.map((s) => `${sname(s.id)} ${pct(s.vals[len - 1] - 1, 1, true)}`).join(zh() ? '，' : ', '));
  const tip = document.createElement('div'); tip.className = 'tooltip'; tip.hidden = true; pathHost.appendChild(tip);
  linkCursor([ch], len, (kk) => {
    ch.setCursor(kk);
    if (kk === null) { tip.hidden = true; return; }
    tip.innerHTML = `<p class="tooltip__date">${dLong(ctx.dates[p0 + kk])}</p><table><tbody>${series.map((s) => `<tr><th>${swatch(s.color, s.dash)} ${esc(sname(s.id))}</th><td>${pct(s.vals[kk] - 1, 1, true)}</td></tr>`).join('')}</tbody></table>`;
    placeTip(tip, pathHost, ch.x(kk), 20);
  });
}

function heatStyle(v) {
  if (v === null || v === undefined) return { cls: 'na', style: '' };
  const intensity = Math.min(1, Math.abs(v) / 0.3);
  // Capped at 60% so every cell keeps ink text at AA contrast in both themes (white text failed on mid tones).
  const pctMix = Math.round(8 + intensity * 52);
  const color = v < 0 ? 'var(--loss)' : 'var(--gain)';
  return { cls: '', style: `background:color-mix(in oklab, ${color} ${pctMix}%, var(--neutral))` };
}
function renderFallMatrix() {
  const set = fallSet(), eps = set.episodes;
  const table = document.getElementById('fa-matrix');
  document.getElementById('fa-matrix-cap').textContent = t('matrix_cap', { ccy: ccyName(S.fa.ccy) });
  // Column buttons are for pointer users; keyboard users have the stepper and the strip (one tab stop each).
  table.tHead.innerHTML = `<tr><th scope="col"><span class="sr-only">${esc(t('th_portfolio'))}</span></th>${eps.map((e, i) => `
    <th scope="col" aria-current="${i === S.fa.k ? 'true' : 'false'}"><button type="button" tabindex="-1" data-k="${i}" aria-label="${esc(t('fall_k', { k: i + 1, name: fallName(e.low) }))}">${i + 1}<br>${esc(e.low.slice(0, 4))}</button></th>`).join('')}</tr>`;
  const row = (id) => `<tr><th scope="row"><span class="name">${SERIES_COLOR[id] ? swatch(fallColor(id), fallDash(id)) : ''}${esc(fallLabel(id))}</span></th>${eps.map((e, i) => {
    const v = set.returns[id]?.[i] ?? null; const h = heatStyle(v);
    return `<td class="${h.cls}${i === S.fa.k ? ' cur' : ''}" style="${h.style}">${v === null ? '–' : signed(v * 100)}</td>`;
  }).join('')}</tr>`;
  table.tBodies[0].innerHTML = `<tr class="group"><th colspan="${eps.length + 1}" scope="rowgroup">${esc(t('matrix_group_p'))}</th></tr>${FALL_ROWS_P.map(row).join('')}
    <tr class="group"><th colspan="${eps.length + 1}" scope="rowgroup">${esc(t('matrix_group_a'))}</th></tr>${FALL_ROWS_A.map(row).join('')}`;
  table.tHead.querySelectorAll('button').forEach((bt) => bt.addEventListener('click', () => selectFall(+bt.dataset.k)));
  // Takeaway, computed.
  const lost = (id) => eps.filter((_, i) => (set.returns[id][i] ?? 0) < 0).length;
  const allLost = eps.filter((_, i) => ['IEF', 'GLD', 'TREND'].every((id) => (set.returns[id][i] ?? 0) < 0));
  const some = eps.length - allLost.length;
  document.getElementById('fa-takeaway').textContent = t(S.fa.ccy === 'SGD' ? 'takeaway_sgd' : 'takeaway', {
    n: eps.length, ief: lost('IEF'), gld: lost('GLD'), trend: lost('TREND'), cash: lost('CASH'), some,
    all: allLost.length ? allLost.map((e) => fallName(e.low)).join(zh() ? '、' : ', ') : t('dash'),
  });
  document.getElementById('fa-scale').innerHTML = `<span>${esc(t('scale_loss'))} −30%</span><span class="ramp"></span><span>+30% ${esc(t('scale_gain'))}</span>`;
  updateSwipeHints();
}

/* ================================================================== MODELS */
function modelById(id) { return S.data.models.models.find((m) => m.id === id); }
function renderModels() {
  const tabs = document.getElementById('mo-tabs');
  const models = S.data.models.models;
  tabs.innerHTML = models.map((m) => `<button type="button" role="tab" class="tab" id="tab-${m.id}" aria-controls="mo-panel" aria-selected="${m.id === S.mo.tab}" tabindex="${m.id === S.mo.tab ? 0 : -1}">
    ${esc(t(`model_${m.id}`))}<small><span class="long">${Object.values(m.weights_by_role).map((w) => +(w * 100).toFixed(1)).join(' / ')}</span><span class="short">${esc(t('stocks_pct', { v: pct(m.weights_by_role.stocks, 0) }))}</span></small></button>`).join('');
  tabs.querySelectorAll('[role=tab]').forEach((b, i) => {
    b.addEventListener('click', () => { S.mo.tab = models[i].id; renderModels(); });
    b.addEventListener('keydown', (ev) => {
      let j = null;
      if (ev.key === 'ArrowRight') j = (i + 1) % models.length;
      if (ev.key === 'ArrowLeft') j = (i - 1 + models.length) % models.length;
      if (ev.key === 'Home') j = 0;
      if (ev.key === 'End') j = models.length - 1;
      if (j === null) return;
      ev.preventDefault(); S.mo.tab = models[j].id; renderModels();
      document.getElementById(`tab-${models[j].id}`).focus();
    });
  });
  const m = modelById(S.mo.tab);
  const panel = document.getElementById('mo-panel');
  panel.setAttribute('aria-labelledby', `tab-${m.id}`);
  const H = S.data.models.holdings;
  // Donut
  const R = 100, r0 = 64, cx = 120, cy = 120;
  let ang = -Math.PI / 2;
  const segs = H.map((h) => {
    const w = m.weights[h.ticker];
    const a0 = ang, a1 = ang + w * Math.PI * 2; ang = a1;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (rr, a) => `${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`;
    const mid = (a0 + a1) / 2;
    const lx = cx + (R + 0) * Math.cos(mid), ly = cy + (R + 0) * Math.sin(mid);
    void lx; void ly;
    return `<path class="donut-seg" d="M${p(R, a0)}A${R},${R} 0 ${large} 1 ${p(R, a1)}L${p(r0, a1)}A${r0},${r0} 0 ${large} 0 ${p(r0, a0)}Z" style="fill:var(--r-${h.role})"><title>${esc(h.ticker)} ${pct(w, 1)}</title></path>`;
  }).join('');
  const donut = `<svg viewBox="0 0 240 240" role="img" aria-label="${esc(H.map((h) => `${h.ticker} ${pct(m.weights[h.ticker], 1)}`).join(', '))}">${segs}
    <text x="120" y="122" text-anchor="middle" class="donut-center">${pct(m.weights_by_role.stocks, 0)}</text>
    <text x="120" y="144" text-anchor="middle" class="donut-sub">${esc(t('stock_share'))}</text></svg>`;
  const rows = H.map((h) => {
    const zhH = HOLDINGS_ZH[h.ticker];
    const role = zh() ? zhH.role : h.role_en;
    const alt = zh() ? zhH.alt : h.alternatives_en;
    const ex = zh() ? (PLACE_ZH[h.exchange] || h.exchange) : h.exchange, dom = zh() ? (PLACE_ZH[h.domicile] || h.domicile) : h.domicile;
    return `<tr><th scope="row"><span class="ticker"><span class="roledot" style="background:var(--r-${h.role})"></span>${esc(h.ticker)}${h.us_situs ? '<span class="us-flag">US</span>' : ''}</span><span class="fullname">${esc(h.name)}</span></th>
      <td class="ex"><span>${esc(ex)}</span><span class="dom">${esc(dom)}</span></td><td class="job">${esc(role)}<span class="alt">${esc(t('alt_label'))} ${esc(alt)}</span></td>
      <td class="w" data-label="${esc(t('th_weight'))}">${pct(m.weights[h.ticker], 1)}</td><td class="ter" data-label="${esc(t('th_ter'))}">${h.ter_pct_approx.toFixed(2)}%</td></tr>`;
  }).join('');
  // Results from the reference checks.
  const resRows = [['research', '2008'], ['ucits_rule', '2015'], ['ibkr', '2020'], ['twin', '2020']].map(([v, w]) => {
    const u = liveRow(`${m.id}|${v}|${w}|USD`), s = liveRow(`${m.id}|${v}|${w}|SGD`);
    if (!u) return '';
    const label = v === 'twin' ? t('ver_twin') : t(`ver_${v}`);
    return `<tr><th scope="row">${esc(label)}</th><td>${esc(t(`win_${w}`))}</td><td>${pct(u.m.cagr)}</td><td>${pct(u.m.mdd)}</td><td>${u.m.f10}</td><td>${pain(u.m.ulcer)}</td><td>${u.m.edge === null ? t('dash') : signed(u.m.edge * 100)}</td><td>${pct(s.m.cagr)} · ${pct(s.m.mdd)}</td></tr>`;
  }).join('');
  const spy20 = liveRow('spy|spy|2020|USD').m;
  panel.innerHTML = `
    <div class="model__donut">${donut}<ul class="donut-legend">${H.map((h) => `<li><span class="roledot" style="background:var(--r-${h.role})"></span><span>${esc(t(`role_${h.role}`))}</span><b>${pct(m.weights[h.ticker], 1)}</b></li>`).join('')}</ul></div>
    <div>
      <p class="model__status ${m.status === 'pre-registered' ? 'pre' : 'post'}">${esc(t(m.status === 'pre-registered' ? 'status_pre' : 'status_post'))}</p>
      <p class="model__note">${esc(zh() ? MODELS_ZH[m.id] : plainFlag(m.note_en.replace(/^The repo's C30:/, 'Core, called C30 in the research:').replace(' test on ', ' test from ')))}</p>
      <div class="table-wrap" tabindex="0" role="region" aria-label="${esc(t(`model_${m.id}`))}">
        <table class="score holdings"><thead><tr><th scope="col">${esc(t('th_holding'))}</th><th scope="col" style="text-align:left">${esc(t('th_exchange'))}</th><th scope="col" style="text-align:left">${esc(t('th_job'))}</th><th scope="col">${esc(t('th_weight'))}</th><th scope="col">${esc(t('th_ter'))}</th></tr></thead><tbody>${rows}</tbody></table>
      </div>
      <p class="fineprint">${esc(t('ter_note'))}</p>
      <dl class="model__facts">
        <div><dt>${esc(t('model_ter'))}</dt><dd>${m.weighted_ter_pct_approx.toFixed(2)}%</dd></div>
        <div><dt>${esc(t('model_us'))}</dt><dd>${pct(m.us_listed_weight, 1)}</dd></div>
      </dl>
    </div>
    <div class="model__results">
      <h3 class="sub">${esc(t('model_results'))}</h3>
      <div class="table-wrap" tabindex="0" role="region" aria-label="${esc(t('model_results'))}">
        <table class="score score--compact"><thead><tr><th scope="col">${esc(t('th_version'))}</th><th scope="col">${esc(t('th_window'))}</th><th scope="col">${esc(t('th_cagr'))}</th><th scope="col">${esc(t('th_mdd'))}</th><th scope="col">${esc(t('th_f10'))}</th><th scope="col">${esc(t('th_ulcer'))} ${infoBtn('ulcer')}</th><th scope="col">${esc(t('th_edge'))} ${infoBtn('edge')}</th><th scope="col">${esc(t('res_sgd_h'))}</th></tr></thead>
        <tbody>${resRows}<tr class="ref"><th scope="row">${esc(t('name_spy'))}</th><td>${esc(t('win_2020'))}</td><td>${pct(spy20.cagr)}</td><td>${pct(spy20.mdd)}</td><td>${spy20.f10}</td><td>${pain(spy20.ulcer)}</td><td>0.0</td><td>${pct(liveRow('spy|spy|2020|SGD').m.cagr)} · ${pct(liveRow('spy|spy|2020|SGD').m.mdd)}</td></tr></tbody></table>
      </div>
      <p><button type="button" class="btn" id="mo-show">${esc(t('show_in_chart'))} →</button></p>
    </div>`;
  document.getElementById('mo-show').addEventListener('click', () => {
    S.ex.sel = new Set(['spy', m.id]);
    if (m.id === 'core') { S.ex.sel.add('core_ibkr'); S.ex.sel.add('twin'); setExWindow('2020'); } else setExWindow('2008');
    // State first, then one scroll to the explorer's heading, then focus without a second scroll.
    requestAnimationFrame(() => {
      document.getElementById('drops-h').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
      document.getElementById('ex-series').querySelector('button')?.focus({ preventScroll: true });
    });
  });

  document.getElementById('mo-steps').innerHTML = STEPS[S.lang].map((s) => `<li>${esc(s)}</li>`).join('');
  document.getElementById('mo-wht').innerHTML = [[t('wht_ie'), 0.15], [t('wht_us'), 0.30]].map(([l, v]) =>
    `<div class="wht-row"><span>${esc(l)}</span><span class="track" role="img" aria-label="${esc(t('wht_lost', { v: pct(v, 0) }))}"><i style="width:${v * 100 / 0.3 * 0.9}%"></i></span><b>${pct(v, 0)}</b></div>`).join('');
  const fr = S.data.models.frictions;
  document.getElementById('mo-costs').textContent = t('cost_p', {
    list: H.map((h) => `${h.ticker} ${h.ter_pct_approx.toFixed(2)}%`).join(zh() ? '，' : ', '),
    model: t(`model_${m.id}`), ter: `${m.weighted_ter_pct_approx.toFixed(2)}%`,
    p10: `${fr.five_orders_pct_of_10k.toFixed(2)}%`, p50: `${fr.five_orders_pct_of_50k.toFixed(2)}%`,
  });
}

/* ================================================================== BUILDER */
const PRESETS = {
  conservative: { stocks: 20, cash: 35, treasuries: 15, gold: 15, trend: 15 },
  core: { stocks: 30, cash: 17.5, treasuries: 17.5, gold: 17.5, trend: 17.5 },
  growth: { stocks: 40, cash: 15, treasuries: 15, gold: 15, trend: 15 },
  twin: { stocks: 30, cash: 70, treasuries: 0, gold: 0, trend: 0 },
};
function sameW(a, b) { return ROLES.every((r) => Math.abs(a[r] - b[r]) < 0.26); }
const ABSORBERS = ROLES.slice(1);
function setStocks(v) {
  const w = S.bu.w, rest = 100 - v;
  const cur = ABSORBERS.reduce((s, r) => s + w[r], 0);
  // Remember the absorber split, so taking stocks to 100% and back restores it.
  if (cur > 0.001) S.bu.ratio = Object.fromEntries(ABSORBERS.map((r) => [r, w[r] / cur]));
  const ratio = S.bu.ratio || Object.fromEntries(ABSORBERS.map((r) => [r, 0.25]));
  w.stocks = v;
  ABSORBERS.forEach((r) => { w[r] = rest * ratio[r]; });
}
function setAbsorber(role, v) {
  const w = S.bu.w, cap = 100 - w.stocks;
  v = Math.max(0, Math.min(cap, v));
  const others = ABSORBERS.filter((r) => r !== role);
  const left = cap - v;
  const cur = others.reduce((s, r) => s + w[r], 0);
  w[role] = v;
  others.forEach((r) => { w[r] = cur > 0 ? w[r] * left / cur : left / others.length; });
  const tot = ABSORBERS.reduce((s, r) => s + w[r], 0);
  if (tot > 0.001) S.bu.ratio = Object.fromEntries(ABSORBERS.map((r) => [r, w[r] / tot]));
}
/** Displayed weights on a 0.5-point grid that always add to exactly 100 (largest-remainder rounding). */
function shownWeights(w) {
  const step = 0.5, units = Math.round(100 / step);
  const raw = ROLES.map((r) => w[r] / step);
  const fl = raw.map(Math.floor);
  let left = units - fl.reduce((s, v) => s + v, 0);
  const order = raw.map((v, i) => [v - fl[i], i]).sort((p, q) => q[0] - p[0]);
  for (const [, i] of order) { if (left <= 0) break; fl[i]++; left--; }
  return Object.fromEntries(ROLES.map((r, i) => [r, fl[i] * step]));
}
function fmtW(v) { return `${Number.isInteger(v) ? v : v.toFixed(1)}%`; }

function renderBuilderControls() {
  segmented(document.getElementById('bu-presets'), [
    { value: 'conservative', label: t('model_conservative') }, { value: 'core', label: t('model_core') },
    { value: 'growth', label: t('model_growth') }, { value: 'twin', label: t('preset_twin') },
  ], Object.keys(PRESETS).find((k) => sameW(PRESETS[k], S.bu.w)) || null, (v) => { S.bu.w = { ...PRESETS[v] }; renderBuilderControls(); renderBuilder(); }, { radio: false });
  const host = document.getElementById('bu-weights');
  if (!host.childElementCount) {
    host.innerHTML = ROLES.map((r) => `<div class="weight weight--${r}">
      <label for="bu-${r}"><span class="roledot" style="background:var(--r-${r})"></span><span data-wl="${r}"></span></label>
      <span class="weight__track"><input type="range" id="bu-${r}" min="0" max="100" step="0.5" style="--fill-c:var(--r-${r})">${r === 'stocks' ? '' : `<span class="weight__cap" id="bu-${r}-cap"></span>`}</span>
      <output for="bu-${r}" id="bu-${r}-o"></output></div>`).join('');
    ROLES.forEach((r) => {
      document.getElementById(`bu-${r}`).addEventListener('input', (ev) => {
        const v = +ev.target.value;
        if (r === 'stocks') setStocks(v); else setAbsorber(r, v);
        syncWeights(); scheduleBuilder();
      });
    });
  }
  host.querySelectorAll('[data-wl]').forEach((n) => { n.textContent = t(`w_${n.dataset.wl}_${S.bu.version}`); }); // names the real holding
  syncWeights();
  const ibkr = S.bu.version === 'ibkr';
  segmented(document.getElementById('bu-version'), [{ value: 'research', label: t('ver_short_research') }, { value: 'ibkr', label: t('ver_short_ibkr') }], S.bu.version, (v) => {
    S.bu.version = v;
    if (v === 'ibkr' && S.bu.win !== '2020') { S.bu.win = '2020'; document.getElementById('bu-status').dataset.note = t('ibkr_window'); }
    renderBuilderControls(); renderBuilder();
  });
  segmented(document.getElementById('bu-window'), ['2008', '2015', '2020'].map((w) => ({ value: w, label: t(`win_${w}`), disabled: ibkr && w !== '2020' })), S.bu.win, (v) => { S.bu.win = v; renderBuilderControls(); renderBuilder(); });
  segmented(document.getElementById('bu-ccy'), ccyOptions(), S.bu.ccy, (v) => { S.bu.ccy = v; renderBuilderControls(); renderBuilder(); });
}
function syncWeights() {
  const w = S.bu.w, shown = shownWeights(w);
  ROLES.forEach((r) => {
    const inp = document.getElementById(`bu-${r}`);
    inp.value = w[r];
    inp.style.setProperty('--p', `${w[r]}%`);
    const o = document.getElementById(`bu-${r}-o`);
    o.textContent = fmtW(shown[r]);
    inp.setAttribute('aria-valuetext', fmtW(shown[r]));
    // Hatch the part of an absorber's track it cannot reach while stocks take their share.
    const cap = document.getElementById(`bu-${r}-cap`);
    if (cap) { cap.style.width = `${w.stocks}%`; cap.title = t('w_cap', { v: fmtW(shown.stocks) }); }
  });
  document.getElementById('bu-stack').innerHTML = ROLES.map((r) => `<i style="flex-basis:${w[r]}%;background:var(--r-${r})" title="${esc(t(`w_${r}`))} ${fmtW(shown[r])}"></i>`).join('');
  document.getElementById('bu-total').textContent = t('w_total', { v: fmtW(ROLES.reduce((s, r) => s + shown[r], 0)) });
  const preset = Object.keys(PRESETS).find((k) => sameW(PRESETS[k], w)) || null;
  document.querySelectorAll('#bu-presets button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.value === preset ? 'true' : 'false'));
}
let buRaf = 0;
function scheduleBuilder() { cancelAnimationFrame(buRaf); buRaf = requestAnimationFrame(renderBuilder); }

function renderBuilder() {
  const ctx = S.ctx, { w, version, win, ccy } = S.bu;
  const blocks = VERSION_BLOCKS[version];
  const weights = {};
  ROLES.forEach((r) => { if (w[r] > 0.001) weights[blocks[r]] = w[r] / 100; });
  const sum = Object.values(weights).reduce((s, v) => s + v, 0);
  Object.keys(weights).forEach((k) => { weights[k] /= sum; });
  const a = winIdx(win), b = S.end;
  const r = C.mixReturns(ctx, weights, ccy);
  const mm = C.metrics(ctx, r, a, b, ccy);
  const rs = C.mixReturns(ctx, { SPY: 1 }, ccy);
  const ms = C.metrics(ctx, rs, a, b, ccy);
  const status = document.getElementById('bu-status');
  const preset = Object.keys(PRESETS).find((k) => sameW(PRESETS[k], w));
  status.className = 'builder__status' + (preset === 'core' ? ' core' : '');
  const note = status.dataset.note ? ` ${status.dataset.note}` : '';
  status.dataset.note = '';
  const msg = preset === 'core' ? t(version === 'ibkr' ? 'is_core_ibkr' : 'is_core')
    : preset === 'conservative' || preset === 'growth' ? t('is_model', { name: t(`model_${preset}`) })
      : preset === 'twin' ? t('is_twin') : t('is_custom');
  status.textContent = msg + note;
  const tile = (label, v, sub, info = '') => `<div class="tile"><dt>${esc(label)}${info ? ` ${info}` : ''}</dt><dd><span class="v">${v}</span><span class="s">${sub}</span></dd></div>`;
  document.getElementById('bu-tiles').innerHTML = [
    tile(t('tile_cagr'), pct(mm.cagr), esc(t('tile_spy', { v: pct(ms.cagr) }))),
    tile(t('tile_mdd'), pct(mm.mdd), esc(t('tile_spy', { v: pct(ms.mdd) }))),
    tile(t('tile_f10'), String(mm.f10), esc(t('tile_spy', { v: ms.f10 })), infoBtn('f10')),
    tile(t('tile_ulcer'), pain(mm.ulcer), esc(t('tile_spy', { v: pain(ms.ulcer) })), infoBtn('ulcer')),
    tile(t('tile_edge'), mm.edge === null ? t('dash') : signed(mm.edge * 100), esc(mm.edge === null ? t('edge_null') : t('tile_edge_sub')), infoBtn('edge')),
  ].join('');
  // Mini underwater chart. A preset is drawn in its own series colour; your own mix in ink (no role uses it).
  const look = preset === 'core' ? { c: version === 'ibkr' ? 'var(--s-core_ibkr)' : 'var(--s-core)', dash: version === 'ibkr' ? 'dot' : null, name: sname(version === 'ibkr' ? 'core_ibkr' : 'core') }
    : preset === 'conservative' || preset === 'growth' ? { c: `var(--s-${preset})`, dash: null, name: sname(preset) }
      : preset === 'twin' ? { c: 'var(--s-twin)', dash: 'dash', name: sname('twin') }
        : { c: 'var(--s-mix)', dash: null, name: t('your_mix') };
  const host = document.getElementById('bu-chart');
  const cm = C.curves(r, a, b), cs = C.curves(rs, a, b);
  const dm = cm.dd, ds = cs.dd;
  const W = host.clientWidth;
  // Growth of 10,000 (log scale): your mix against the S&P 500 over the same period and currency.
  const gm = Float64Array.from(cm.growth, (v) => v * 10000), gs = Float64Array.from(cs.growth, (v) => v * 10000);
  const gHost = document.getElementById('bu-growth');
  timeChart(gHost, {
    width: W, height: 200, len: b - a + 1, kind: 'growth', log: true, base: 10000, margin: { t: 8, r: 10, b: 24, l: zh() ? 56 : 48 },
    series: [{ id: 'spy', vals: gs, color: 'var(--s-spy)', width: 1.4 }, { id: 'mix', vals: gm, color: look.c, dash: look.dash, width: 2.2, halo: true }],
    xTicks: yearTicks(ctx.dates, a, b, W - 60).map((tk) => ({ k: tk.i - a, label: String(tk.y) })), yFmt: (v) => money(v, ccy, true),
  }).hit.remove();
  const endM = gm[gm.length - 1], endS = gs[gs.length - 1];
  document.getElementById('bu-growth-t').textContent = t('growth_title', { money: money(10000, ccy, true), scale: t('scale_log_l') });
  document.getElementById('bu-dd-t').textContent = t('dd_title');
  gHost.setAttribute('aria-label', t('mini_growth_label', { money: money(10000, ccy, true), start: dLong(ctx.dates[a]), end: dLong(ctx.dates[b]), mix: money(endM, ccy), spy: money(endS, ccy) }));
  timeChart(host, {
    width: W, height: 200, len: b - a + 1, kind: 'dd', margin: { t: 8, r: 10, b: 24, l: 44 },
    series: [{ id: 'spy', vals: ds, color: 'var(--s-spy)', area: true, width: 1.4 }, { id: 'mix', vals: dm, color: look.c, dash: look.dash, width: 2.2, halo: true }],
    xTicks: yearTicks(ctx.dates, a, b, W - 60).map((tk) => ({ k: tk.i - a, label: String(tk.y) })), yFmt: (v) => pct(v, 0),
  }).hit.remove();
  host.setAttribute('aria-label', t('mini_label', { start: dLong(ctx.dates[a]), end: dLong(ctx.dates[b]), mdd: pct(mm.mdd), spy: pct(ms.mdd) }));
  document.getElementById('bu-legend').innerHTML = `<li>${swatch(look.c, look.dash)}${esc(look.name)} <b>${esc(money(endM, ccy, true))}</b></li><li>${swatch('var(--s-spy)')}${esc(t('name_spy'))} <b>${esc(money(endS, ccy, true))}</b></li>`;
  const sameEl = document.getElementById('bu-same');
  if (ccy === 'USD' && mm.edge !== null) {
    const share = C.spyShareFor(ctx, mm, a, b);
    sameEl.textContent = share === null ? '' : t('same_share', { s: pct(share, 0), c: pct(1 - share, 0), y: pct(mm.cagr - mm.edge) });
  } else sameEl.textContent = ccy === 'SGD' ? t('same_share_sgd') : '';
}

/* ================================================================== FUNDS */
function fundDesc(f) { return zh() ? (FUND_ZH[f.ticker] || f.desc) : f.desc; }
function catName(c) { return zh() ? (CATEGORY_ZH[c] || c) : c; }
function fundMatches(f) {
  const q = S.fu.q.trim().toLowerCase();
  if (S.fu.set === 'curated' && f.wide) return false;
  if (!S.fu.where.has(f.where)) return false;
  if (S.fu.cat !== 'all' && f.category !== S.fu.cat) return false;
  if (q && !(`${f.ticker} ${f.name} ${f.desc} ${FUND_ZH[f.ticker] || ''}`.toLowerCase().includes(q))) return false;
  return true;
}
function fundCard(f) { return f.cards[S.fu.ccy]?.[S.fu.win] || null; }

function renderFundControls() {
  const nCur = S.data.funds.filter((f) => !f.wide).length, nAll = S.data.funds.length;
  segmented(document.getElementById('fu-set'), [{ value: 'curated', label: t('set_curated', { n: int(nCur) }) }, { value: 'all', label: t('set_all', { n: int(nAll) }) }], S.fu.set, (v) => { S.fu.set = v; if (v === 'curated' && S.fu.cat !== 'all' && !S.data.funds.some((f) => !f.wide && f.category === S.fu.cat)) S.fu.cat = 'all'; renderFundControls(); renderFunds(); });
  const wu = S.data.meta.wide_universe;
  const note = document.getElementById('fu-wide-note');
  if (wu && wu.shown) {
    const left = Object.values(wu.left_out || {}).reduce((a, b) => a + b, 0);
    note.textContent = t(wu.shown_by && wu.shown_by.us_etf ? 'wide_note_us' : 'wide_note', { listed: int(wu.listed), shown: int(wu.shown), dup: int(wu.already_curated), young: int(wu.too_new), left: int(left) });
    note.hidden = false;
  } else note.hidden = true;
  const cats = [...new Set(S.data.funds.filter((f) => S.fu.set === 'all' || !f.wide).map((f) => f.category))].sort((p, q) => catName(p).localeCompare(catName(q), zh() ? 'zh' : 'en'));
  const sel = document.getElementById('fu-cat');
  sel.innerHTML = `<option value="all">${esc(t('cat_all'))}</option>` + cats.map((c) => `<option value="${esc(c)}"${c === S.fu.cat ? ' selected' : ''}>${esc(catName(c))}</option>`).join('');
  document.getElementById('fu-search').placeholder = t('search_ph');
  segmented(document.getElementById('fu-window'), ['2008', '2015', '2020'].map((w) => ({ value: w, label: t(`win_${w}`) })), S.fu.win, (v) => { S.fu.win = v; renderFundControls(); renderFunds(); });
  segmented(document.getElementById('fu-ccy'), ccyOptions(), S.fu.ccy, (v) => { S.fu.ccy = v; renderFundControls(); renderFunds(); });
  segmented(document.getElementById('fu-view'), [{ value: 'chart', label: t('view_chart') }, { value: 'table', label: t('view_table') }], S.fu.view, (v) => { S.fu.view = v; renderFundControls(); renderFunds(); });
  const wh = document.getElementById('fu-where');
  const chipC = { lse: 'var(--m-lse)', sgx: 'var(--m-sgx)', us_etf: 'var(--m-us)', us_mf: 'var(--m-us)', research: 'var(--ink-2)' };
  wh.innerHTML = ['lse', 'sgx', 'us_etf', 'us_mf', 'research'].map((w) => `<button type="button" class="chip" style="--chip-c:${chipC[w]}" data-w="${w}" aria-pressed="${S.fu.where.has(w)}" title="${esc(WHERE_LONG[S.lang][w])}">${markerSvg(w)}<span>${esc(t(`where_${w}`))}</span></button>`).join('');
  wh.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    const w = b.dataset.w;
    if (S.fu.where.has(w)) {
      if (S.fu.where.size <= 1) { document.getElementById('fu-count').textContent = t('keep_one_where'); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
      S.fu.where.delete(w);
    } else S.fu.where.add(w);
    renderFundControls(); renderFunds();
    document.querySelector(`#fu-where [data-w="${w}"]`)?.focus();
  }));
}
function markerSvg(where) {
  const shapes = {
    lse: '<path d="M7 1.5 12.5 7 7 12.5 1.5 7Z" style="fill:var(--m-lse)"/>',
    sgx: '<rect x="2.5" y="2.5" width="9" height="9" style="fill:var(--m-sgx)"/>',
    us_etf: '<circle cx="7" cy="7" r="4.5" style="fill:none;stroke:var(--m-us);stroke-width:1.5"/>',
    us_mf: '<circle cx="7" cy="7" r="4.5" style="fill:none;stroke:var(--m-us);stroke-width:1.5;stroke-dasharray:2 2"/>',
    research: '<path d="M7 2 12 11.5H2Z" style="fill:var(--ink-2)"/>',
  };
  return `<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">${shapes[where]}</svg>`;
}

function renderFunds() {
  const all = S.data.funds;
  const withData = all.filter((f) => fundCard(f));
  const shown = withData.filter(fundMatches);
  const noData = all.filter((f) => !fundCard(f) && fundMatches(f)).length;
  document.getElementById('fu-count').textContent = (noData ? t('fu_count', { n: shown.length, m: noData }) : t('fu_count_all', { n: shown.length })) + (S.fu.win === '2015' ? ` ${t('fu_win_note')}` : '');
  const tableView = S.fu.view === 'table';
  document.getElementById('fu-scatter').hidden = tableView;
  document.getElementById('fu-table-wrap').hidden = !tableView;
  if (tableView) document.getElementById('fu-off').hidden = true;
  if (tableView) renderFundTable(shown); else renderScatter(withData);
  renderFundCardPanel();
}

let scatterPts = [];
function renderScatter(withData) {
  const host = document.getElementById('fu-scatter');
  host.textContent = '';
  const W = host.clientWidth, H = host.clientHeight, narrow = W < 560;
  const m = { t: 16, r: narrow ? 10 : 24, b: 40, l: narrow ? 44 : 56 };
  const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' }, host);
  const ccy = S.fu.ccy, win = S.fu.win;
  const cards = withData.map((f) => fundCard(f));
  const XMAX = 22;
  const ys = cards.map((c) => c.cagr);
  const YMIN = -0.06, YMAX = Math.max(...ys) + 0.015;
  const x = scale(0, XMAX, m.l, W - m.r), y = scale(YMIN, YMAX, H - m.b, m.t);
  const g = el('g', { class: 'axis' }, svg);
  for (const v of ticks(0, XMAX, narrow ? 4 : 6)) {
    el('line', { x1: x(v), x2: x(v), y1: m.t, y2: H - m.b, class: 'gridline' }, g);
    el('text', { x: x(v), y: H - m.b + 16, 'text-anchor': 'middle', text: v.toFixed(0) }, g);
  }
  for (const v of ticks(YMIN, YMAX, narrow ? 5 : 7)) {
    el('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: v === 0 ? 'zeroline' : 'gridline', opacity: v === 0 ? 0.5 : null }, g);
    el('text', { x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end', text: pct(v, 0) }, g);
  }
  el('text', { x: W - m.r, y: H - 6, 'text-anchor': 'end', class: 'axis-title', text: t('axis_pain') }, svg);
  el('text', { x: m.l, y: m.t - 4, class: 'axis-title', text: `↑ ${t('axis_ret')}` }, svg);
  // Same-pain line.
  const line = S.data.same_pain_line[ccy === 'USD' ? 'USD' : 'SGD_cash_proxy'][win];
  const lp = line.ulcer.map((u, i) => [u * 100, line.cagr[i]]).sort((p, q) => p[0] - q[0]);
  let d = '';
  lp.forEach(([u, c]) => { d += `${d ? 'L' : 'M'}${x(Math.min(u, XMAX)).toFixed(1)},${y(c).toFixed(1)}`; });
  const lastPt = lp[lp.length - 1];
  el('path', { d: `${d}L${x(lastPt[0])},${m.t}L${x(0)},${m.t}Z`, class: 'yard-area' }, svg);
  el('path', { d, class: 'yard' }, svg);
  // Curve label at its upper end (the 100% SPY end), where nothing else is drawn.
  if (!narrow) el('text', { x: x(Math.min(lastPt[0], XMAX)) - 10, y: y(lastPt[1]) - 10, 'text-anchor': 'end', class: 'yard-label', text: t(ccy === 'USD' ? 'line_label' : 'line_label_sgd') }, svg);
  el('text', { x: x(1), y: m.t + 14, class: 'yard-label', text: `↖ ${t('above_line')}`, opacity: 0.85 }, svg);
  // Points. Funds beyond the axes are not pinned to the edge: they are counted in a tally and stay in the table.
  const gp = el('g', {}, svg);
  scatterPts = [];
  let offCount = 0;
  const order = withData.map((f, i) => ({ f, c: cards[i] })).sort((p, q) => (p.f.where === 'lse' || p.f.where === 'sgx' ? 1 : 0) - (q.f.where === 'lse' || q.f.where === 'sgx' ? 1 : 0)).sort((p, q) => (p.f.ticker === 'SPY') - (q.f.ticker === 'SPY'));
  for (const { f, c } of order) {
    if (S.fu.set === 'curated' && f.wide) continue; // not part of this view: not drawn, so never a dot you cannot click
    const match = fundMatches(f);
    if (c.ulcer * 100 > XMAX || c.cagr < YMIN) { if (match) offCount++; continue; }
    const px = x(c.ulcer * 100), py = y(c.cagr);
    const cls = `pt pt--${f.where}${match ? '' : ' pt--dim'}${f.ticker === 'SPY' ? ' pt--spy' : ''}${S.fu.sel === f.ticker ? ' pt--sel' : ''}`;
    let node;
    const rr = f.where === 'lse' ? 6.5 : 5;
    if (f.where === 'lse') node = el('path', { d: `M${px},${py - rr}L${px + rr},${py}L${px},${py + rr}L${px - rr},${py}Z`, class: cls }, gp);
    else if (f.where === 'sgx') node = el('rect', { x: px - 4.5, y: py - 4.5, width: 9, height: 9, class: cls }, gp);
    else if (f.where === 'research') node = el('path', { d: `M${px},${py - 5.5}L${px + 5},${py + 4}L${px - 5},${py + 4}Z`, class: cls }, gp);
    else node = el('circle', { cx: px, cy: py, r: f.ticker === 'SPY' ? 6 : 4.5, class: cls }, gp);
    scatterPts.push({ f, c, px, py, match, node });
  }
  if (offCount) el('text', { x: W - m.r, y: m.t + 14, 'text-anchor': 'end', class: 'off-tally', text: t('off_tally', { n: offCount, x: XMAX }) }, svg);
  const offP = document.getElementById('fu-off'), offB = document.getElementById('fu-off-btn');
  offP.hidden = !offCount;
  if (offCount) {
    offB.textContent = t('off_btn', { n: offCount, x: XMAX });
    offB.onclick = () => { S.fu.view = 'table'; S.fu.sort = { col: 'ulcer', dir: -1 }; renderFundControls(); renderFunds(); document.getElementById('fu-table-wrap').focus(); };
  }
  // Model portfolios for reference: right-side labels in a fixed vertical stack, no leaders (none on phones).
  const gm = el('g', {}, svg);
  const mpts = ['growth', 'core', 'conservative'].map((id) => {
    const row = checkRow(`${id}|research|${win}|${ccy}`);
    return row ? { id, px: x(row.m.ulcer * 100), py: y(row.m.cagr) } : null;
  }).filter(Boolean).sort((p, q) => p.py - q.py);
  let lastY = -Infinity;
  const lx = Math.max(...mpts.map((p) => p.px)) + 12;
  for (const p of mpts) {
    el('circle', { cx: p.px, cy: p.py, r: 6.5, class: 'pt-model', style: `fill:${SERIES_COLOR[p.id]}` }, gm);
    if (narrow) continue;
    const ly = Math.max(p.py + 4, lastY + 14);
    lastY = ly;
    el('text', { x: lx, y: ly, class: 'pt-model-label', style: `fill:${SERIES_TEXT[p.id]}`, text: t(`model_${p.id}`) }, gm);
  }
  // Labels: SPY, selection, small search results.
  // Guide lines from SPY to both axes, so the S&P 500 is easy to find among similar funds.
  const sp = scatterPts.find((p) => p.f.ticker === 'SPY');
  if (sp) {
    const gl = el('g', { class: 'spy-guide' }, svg);
    el('line', { x1: m.l, x2: sp.px, y1: sp.py, y2: sp.py }, gl);
    el('line', { x1: sp.px, x2: sp.px, y1: sp.py, y2: H - m.b }, gl);
    svg.appendChild(sp.node); // keep the SPY dot above the guides and every other dot
  }
  const toLabel = scatterPts.filter((p) => p.f.ticker === 'SPY' || p.f.ticker === S.fu.sel || (S.fu.q && p.match && scatterPts.filter((z) => z.match).length <= 10));
  const spyPt = scatterPts.find((p) => p.f.ticker === 'SPY');
  for (const p of toLabel) {
    const nearSpy = spyPt && p !== spyPt && Math.hypot(p.px - spyPt.px, p.py - spyPt.py) < 16;
    const dy = p === spyPt ? -5 : nearSpy ? 15 : 4;
    el('text', { x: p.px + 9, y: p.py + dy, class: 'pt-label', text: p.f.ticker }, svg);
  }
  // Focus ring for keyboard navigation.
  const ring = el('circle', { r: 11, fill: 'none', stroke: 'var(--focus)', 'stroke-width': 2, visibility: 'hidden' }, svg);
  host.setAttribute('aria-label', t('scatter_label', { n: scatterPts.filter((p) => p.match).length, win: t(`win_${win}`), ccy: ccyName(ccy) }) + (offCount ? ` ${t('off_tally', { n: offCount, x: XMAX })}` : ''));
  const legend = document.getElementById('fu-legend');
  // The markers are explained by the "Where it trades" chips above; the legend keeps the line and the models.
  legend.innerHTML = `<li><svg viewBox="0 0 14 14" aria-hidden="true"><path d="M1 10 13 4" style="stroke:var(--ink);stroke-width:1.4;stroke-dasharray:3 2"/></svg>${esc(t(ccy === 'USD' ? 'line_label' : 'line_label_sgd'))}</li>` +
    `<li><svg viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5" style="fill:var(--s-spy)"/></svg>${esc(t('name_spy'))}</li>` + ['conservative', 'core', 'growth'].map((id) => `<li><svg viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5" style="fill:${SERIES_COLOR[id]}"/></svg>${esc(t(`model_${id}`))}</li>`).join('');

  // Interaction.
  const tip = document.getElementById('fu-tip');
  const nearest = (cx, cy) => {
    let best = null, bd = 28 * 28;
    for (const p of scatterPts) { if (!p.match) continue; const dd = (p.px - cx) ** 2 + (p.py - cy) ** 2; if (dd < bd) { bd = dd; best = p; } }
    if (best) return best;
    bd = 9 * 9; // a faded dot (outside the filters) can still be picked when the pointer is right on it
    for (const p of scatterPts) { const dd = (p.px - cx) ** 2 + (p.py - cy) ** 2; if (dd < bd) { bd = dd; best = p; } }
    return best;
  };
  const stack = (p) => scatterPts.filter((q) => q !== p && q.match === p.match && (q.px - p.px) ** 2 + (q.py - p.py) ** 2 <= 7 * 7)
    .map((q) => q.f.ticker);
  const showTip = (p) => {
    if (!p) { tip.hidden = true; return; }
    tip.innerHTML = `<p class="tooltip__date">${esc(p.f.ticker)} · ${esc(t(`where_${p.f.where}`))}</p><p style="margin:0 0 6px;color:var(--ink-2)">${esc(fundDesc(p.f))}</p>
      <table><tbody><tr><th>${esc(t('th_cagr'))}</th><td>${pct(p.c.cagr)}</td></tr><tr><th>${esc(t('th_ulcer'))}</th><td>${pain(p.c.ulcer)}</td></tr>
      <tr><th>${esc(t('th_mdd'))}</th><td>${pct(p.c.mdd)}</td></tr>${ccy === 'USD' ? `<tr><th>${esc(t('th_edge'))}</th><td>${p.c.edge === null ? esc(t('edge_null')) : signed(p.c.edge * 100)}</td></tr>` : ''}</tbody></table>`;
    placeTip(tip, host.parentElement, p.px, p.py);
  };
  svg.addEventListener('pointermove', (ev) => {
    const r = svg.getBoundingClientRect();
    const p = nearest(ev.clientX - r.left, ev.clientY - r.top);
    svg.style.cursor = p ? 'pointer' : 'default';
    showTip(p);
    if (p) { const n = stack(p).length; if (n) tip.insertAdjacentHTML('beforeend', `<p class="tooltip__more">${esc(t('stack_tip', { n }))}</p>`); }
  });
  svg.addEventListener('pointerleave', () => { tip.hidden = true; });
  svg.addEventListener('click', (ev) => {
    const r = svg.getBoundingClientRect();
    const p = nearest(ev.clientX - r.left, ev.clientY - r.top);
    if (p) { S.fu.near = stack(p); selectFund(p.f.ticker, true); }
  });
  const nav = scatterPts.filter((p) => p.match).sort((p, q) => p.px - q.px || p.py - q.py);
  host.onkeydown = (ev) => {
    if (!nav.length) return;
    let i = S.fu.focus;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') i = Math.min(nav.length - 1, i + 1);
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') i = Math.max(0, i - 1);
    else if (ev.key === 'Home') i = 0;
    else if (ev.key === 'End') i = nav.length - 1;
    else if ((ev.key === 'Enter' || ev.key === ' ') && i >= 0) { ev.preventDefault(); selectFund(nav[i].f.ticker); return; }
    else if (ev.key === 'Escape') { tip.hidden = true; ring.setAttribute('visibility', 'hidden'); return; }
    else return;
    ev.preventDefault();
    S.fu.focus = i;
    const p = nav[i];
    ring.setAttribute('cx', p.px); ring.setAttribute('cy', p.py); ring.setAttribute('visibility', 'visible');
    showTip(p);
  };
  host.onblur = () => { ring.setAttribute('visibility', 'hidden'); tip.hidden = true; };
}

function renderFundTable(shown) {
  const ccy = S.fu.ccy;
  const cols = [
    ['ticker', t('th_ticker'), (f) => f.ticker],
    ['name', t('th_name'), (f) => fundDesc(f)],
    ['where', t('th_where'), (f) => t(`where_${f.where}`)],
    ['category', t('th_category'), (f) => catName(f.category)],
    ['cagr', t('th_cagr'), (f) => fundCard(f).cagr],
    ['mdd', t('th_mdd'), (f) => fundCard(f).mdd],
    ['f10', t('th_f10'), (f) => fundCard(f).f10],
    ['ulcer', t('th_ulcer'), (f) => fundCard(f).ulcer],
  ];
  if (ccy === 'USD') cols.push(['edge', t('th_edge'), (f) => fundCard(f).edge]);
  const { col, dir } = S.fu.sort;
  const getter = (cols.find((c) => c[0] === col) || cols[7])[2];
  const sorted = shown.slice().sort((p, q) => {
    const a = getter(p), b = getter(q);
    if (a === null || a === undefined) return 1;
    if (b === null || b === undefined) return -1;
    return (typeof a === 'string' ? a.localeCompare(b) : a - b) * dir;
  });
  const table = document.getElementById('fu-table');
  document.getElementById('fu-table-cap').textContent = `${t('funds_h')} · ${t(`win_${S.fu.win}`)} · ${ccyName(ccy)}${ccy === 'USD' ? '' : ` · ${t('edge_usd_only')}`}`;
  table.tHead.innerHTML = `<tr>${cols.map(([k, label]) => `<th scope="col" aria-sort="${k === col ? (dir > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" class="sortbtn" data-col="${k}" aria-label="${esc(t('sort_by', { col: label }))}">${esc(label)}</button></th>`).join('')}</tr>`;
  table.tBodies[0].innerHTML = sorted.map((f) => {
    const c = fundCard(f);
    return `<tr tabindex="0" data-t="${esc(f.ticker)}" aria-selected="${S.fu.sel === f.ticker}"><th scope="row">${markerSvg(f.where)} ${esc(f.ticker)}</th><td>${esc(fundDesc(f))}</td><td>${esc(t(`where_${f.where}`))}</td><td>${esc(catName(f.category))}</td>
      <td>${pct(c.cagr)}</td><td>${pct(c.mdd)}</td><td>${c.f10}</td><td>${pain(c.ulcer)}</td>${ccy === 'USD' ? `<td class="${c.edge > 0 ? 'pos' : ''}">${c.edge === null ? `<span class="neg-soft">${esc(t('edge_null'))}</span>` : signed(c.edge * 100)}</td>` : ''}</tr>`;
  }).join('');
  table.tHead.querySelectorAll('.sortbtn').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.col;
    S.fu.sort = { col: k, dir: S.fu.sort.col === k ? -S.fu.sort.dir : (['cagr', 'edge'].includes(k) ? -1 : 1) };
    renderFunds();
    document.querySelector(`#fu-table .sortbtn[data-col="${k}"]`)?.focus();
  }));
  table.tBodies[0].querySelectorAll('tr').forEach((tr) => {
    tr.addEventListener('click', () => selectFund(tr.dataset.t));
    tr.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); selectFund(tr.dataset.t); } });
  });
}
function selectFund(tk, keepNear = false) {
  if (!keepNear) S.fu.near = [];
  S.fu.sel = tk;
  if (S.fu.view === 'chart') renderScatter(S.data.funds.filter((f) => fundCard(f)));
  else document.querySelectorAll('#fu-table tbody tr').forEach((tr) => tr.setAttribute('aria-selected', tr.dataset.t === tk ? 'true' : 'false'));
  renderFundCardPanel();
  if (window.matchMedia('(max-width: 1000px)').matches) document.getElementById('fu-card').scrollIntoView({ block: 'nearest' });
}
/** Data notes in plain words; the common patterns are translated, the rest stay in English. */
const TEAM_EN = { singapore_implementation: 'Singapore team', defensive_equity: 'equity team', bonds_cash_gold: 'bonds team',
  alternatives_mixes: 'alternatives team', strategist: 'strategist' };
/** English data notes without repo file names or ISO dates. */
function plainFlag(s) {
  return s
    .replace(/alternatives_mixes\/fixes\.csv/g, 'alternatives team')
    .replace(/key_numbers\.csv/g, 'the team’s key numbers')
    .replace(/SGD=X/g, 'the USD/SGD rate')
    .replace(/\b(singapore_implementation|defensive_equity|bonds_cash_gold|alternatives_mixes|strategist)\b/g, (k) => TEAM_EN[k])
    .replace(/(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})/g, (_, a, b) => `${dLong(a)} to ${dLong(b)}`)
    .replace(/\d{4}-\d{2}-\d{2}/g, (iso) => dLong(iso))
    .replace(/the repo’s|the repo's/g, 'this project’s');
}
function flagText(f) {
  if (!f.flag) return '';
  if (!zh()) return plainFlag(f.flag);
  const d = (iso) => dLong(iso);
  let m = f.flag.match(/^History starts (\d{4}-\d{2}-\d{2}) only\.$/);
  if (m) return `数据从${d(m[1])}才开始。`;
  m = f.flag.match(/^Used from (\d{4}-\d{2}-\d{2}) only \(thin trading/);
  if (m) return `仅使用${d(m[1])}以后的数据（此前交易清淡）。`;
  if (f.ticker === 'IB01.L') return '最初几天的价格有误，因此收益从2019年3月4日开始计算。';
  m = f.flag.match(/^(\d+) one-day price spikes that reversed were removed automatically\.$/);
  if (m) return `已自动剔除 ${m[1]} 个次日即回落的单日价格异常。`;
  m = f.flag.match(/^Returns before (\d{4}-\d{2}-\d{2}) dropped: thin trading/);
  if (m) return `${d(m[1])}之前交易清淡，这部分收益未计入。`;
  if (f.where === 'research') return f.ticker === 'CASH' ? '并非基金：3个月期美国短期国债收益率，按日计息（研究资产块）。' : '并非基金：本项目的12个月趋势规则（研究资产块，含 5 个基点成本，无基金费用）。';
  return plainFlag(f.flag);
}
function renderFundCardPanel() {
  const host = document.getElementById('fu-card');
  const f = S.data.funds.find((x) => x.ticker === S.fu.sel);
  if (!f) { host.innerHTML = `<p class="empty">${esc(t('card_empty'))}</p>`; return; }
  const ccy = S.fu.ccy;
  const wins = ['2008', '2015', '2020'];
  let needFoot = false;
  const cell = (w, k, fmt) => { const c = f.cards[ccy]?.[w]; return c ? fmt(c[k]) : t('dash'); };
  const rows = [
    [t('th_cagr'), 'cagr', (v) => pct(v)], [t('th_mdd'), 'mdd', (v) => pct(v)], [t('th_f10'), 'f10', (v) => String(v)],
    [t('th_ulcer'), 'ulcer', pain], [t('th_wm'), 'wm', (v) => pct(v)],
  ];
  if (ccy === 'USD') rows.push([t('th_edge'), 'edge', (v) => { if (v === null) { needFoot = true; return '—*'; } return signed(v * 100); }]);
  const eps = S.data.falls[ccy === 'SGD' ? 'SGD' : 'USD'].episodes;
  const fv = f.falls[ccy] || [];
  const spyF = S.data.funds.find((x) => x.ticker === 'SPY').falls[ccy];
  const maxAbs = Math.max(0.05, ...fv.filter((v) => v !== null).map(Math.abs), ...spyF.map(Math.abs));
  const fallRows = eps.map((e, i) => {
    const v = fv[i];
    const sv = spyF[i];
    const spyW = Math.min(50, Math.abs(sv) / maxAbs * 50);
    const spyBar = `<span class="spyline" style="left:${50 - spyW}%;width:${spyW}%"></span>`;
    if (v === null || v === undefined) return `<div class="bar-row"><span class="label">${esc(dMonth(e.low))}</span><span class="track">${spyBar}<span class="zero" style="left:50%"></span></span><span class="val nodata">${esc(t('fall_nodata'))}</span></div>`;
    const w = Math.min(50, Math.abs(v) / maxAbs * 50);
    return `<div class="bar-row" title="${esc(fallName(e.low))}: ${pct(v, 1, true)} (SPY ${pct(sv, 1, true)})"><span class="label">${esc(dMonth(e.low))}</span><span class="track">${spyBar}<span class="fill ${v < 0 ? 'neg' : 'pos'}" style="left:${v < 0 ? 50 - w : 50}%;width:${Math.max(w, 0.6)}%"></span><span class="zero" style="left:50%"></span></span><span class="val">${pct(v, 1, true)}</span></div>`;
  }).join('');
  const autoNote = f.auto_category ? `<p class="flag">${esc(t('card_auto'))}</p>` : '';
  const zeroNote = f.first_day_zero?.length ? `<p class="flag">${esc(t('card_zero', { w: f.first_day_zero.map((w) => t(`win_${w}`)).join(zh() ? '、' : ', ') }))}</p>` : '';
  const desc = fundDesc(f);
  const showName = f.name && f.name !== f.desc && f.name !== desc;
  const tbody = rows.map(([label, k, fmt]) => `<tr><th scope="row">${esc(label)}</th>${wins.map((w) => `<td>${cell(w, k, fmt)}</td>`).join('')}</tr>`).join('');
  host.innerHTML = `
    <p class="hint">${esc(t('card_hint'))}</p>
    <button type="button" class="btn btn--link close" id="fu-close">${esc(t('card_close'))}</button>
    <h3>${markerSvg(f.where)} ${esc(f.ticker)}</h3>
    <p class="fname">${esc(desc)}${showName ? `<br><span style="color:var(--muted)">${esc(f.name)}</span>` : ''}</p>
    <div class="tags"><span class="tag tag--${f.where}">${esc(WHERE_LONG[S.lang][f.where])}</span><span class="tag">${esc(catName(f.category))}</span></div>
    ${f.flag ? `<p class="flag">${esc(flagText(f))}</p>` : ''}${autoNote}${zeroNote}
    <p class="flag">${esc(t('card_first', { d: dLong(f.first) }))}</p>
    ${S.fu.near.length ? `<div class="near"><p class="near__h">${esc(t('near_h', { n: S.fu.near.length }))}</p><div class="near__list">${S.fu.near.map((tk) => `<button type="button" class="chip near__btn" data-t="${esc(tk)}">${esc(tk)}</button>`).join('')}</div></div>` : ''}
    <h4>${esc(t('card_windows', { ccy: ccyName(ccy) }))}</h4>
    <table class="score score--compact"><thead><tr><th scope="col">${esc(t('since'))}</th>${wins.map((w) => `<th scope="col">${w}</th>`).join('')}</tr></thead>
    <tbody>${tbody}</tbody></table>
    ${needFoot ? `<p class="foot">${esc(t('card_edge_foot'))}</p>` : ''}
    <h4>${esc(t('card_falls', { ccy: ccyName(ccy) }))}</h4>
    <div class="bars">${fallRows}</div>
    <ul class="legend"><li><span class="swatch" style="height:8px;width:14px;border:1px solid var(--s-spy)"></span>${esc(t('name_spy'))}</li></ul>`;
  document.getElementById('fu-close').addEventListener('click', () => { S.fu.sel = null; S.fu.near = []; renderFunds(); document.getElementById('fu-scatter').focus(); });
  host.querySelectorAll('.near__btn').forEach((b) => b.addEventListener('click', () => {
    const prev = S.fu.sel; S.fu.near = [prev, ...S.fu.near.filter((tk) => tk !== b.dataset.t)]; selectFund(b.dataset.t, true);
  }));
}

/* ================================================================== TEST */
function renderTest() {
  const host = document.getElementById('tl');
  host.textContent = '';
  const W = host.clientWidth, narrow = W < 640, H = narrow ? 280 : 214;
  host.style.height = `${H}px`;
  const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' }, host);
  const rcT = S.data.research.c30_test;
  const tA = dLong(rcT.test[0]), tB = dLong(rcT.test[1]);
  host.setAttribute('aria-label', t('tl_label', { a: tA, b: tB }));
  const yr = (iso) => { const [y, m, d] = iso.split('-').map(Number); return y + (m - 1) / 12 + (d - 1) / 365; };
  const x = scale(2005, 2027.2, 16, W - (narrow ? 14 : 70));
  const axisY = narrow ? 122 : 118;
  const barH = 26;
  el('rect', { x: x(2005), y: axisY - barH, width: x(yr('2019-12-31')) - x(2005), height: barH, class: 'tl-design' }, svg);
  el('rect', { x: x(yr('2020-01-02')), y: axisY - barH, width: x(yr('2026-10-27')) - x(yr('2020-01-02')), height: barH, class: 'tl-test' }, svg);
  el('line', { x1: x(2005), x2: x(2027), y1: axisY, y2: axisY, class: 'tl-axis' }, svg);
  for (let yv = 2005; yv <= 2027; yv++) {
    if (narrow && yv % 5 !== 0) continue;
    el('line', { x1: x(yv), x2: x(yv), y1: axisY, y2: axisY + 5, class: 'tl-axis' }, svg);
    el('text', { x: x(yv), y: axisY + 18, 'text-anchor': 'middle', class: 'tl-year', text: String(yv) }, svg);
  }
  el('text', { x: x(2005) + 8, y: axisY - barH + 17, class: 'tl-text', text: t('tl_design') }, svg);
  wrapText(el('text', { x: x(2005), y: axisY + 36, class: 'tl-sub' }, svg), t('tl_design_sub'), narrow ? W - 20 : x(2019.5) - x(2005), 14);
  const fx = x(2020);
  el('line', { x1: fx, x2: fx, y1: axisY - barH - 30, y2: axisY + 4, class: 'tl-freeze' }, svg);
  const ft = el('text', { x: fx - 6, y: axisY - barH - 34, 'text-anchor': 'end', class: 'tl-text', text: t('tl_freeze') }, svg);
  // A small line-drawn padlock (no emoji).
  const lw = ft.getComputedTextLength ? ft.getComputedTextLength() : 80;
  const lk = el('g', { transform: `translate(${fx - 6 - lw - 16},${axisY - barH - 45})` }, svg);
  el('rect', { x: 0.7, y: 5, width: 9.6, height: 7, rx: 1.2, class: 'tl-lock' }, lk);
  el('path', { d: 'M2.8 5V3.4a2.7 2.7 0 0 1 5.4 0V5', class: 'tl-lock' }, lk);
  const fsub = el('text', { x: fx - 6, y: axisY - barH - 18, 'text-anchor': 'end', class: 'tl-sub', text: t('tl_freeze_sub') }, svg);
  // Narrow screens: keep the end-anchored line inside the chart instead of cutting off its start.
  const fsl = fsub.getComputedTextLength ? fsub.getComputedTextLength() : 0;
  if (fx - 6 - fsl < 4) fsub.setAttribute('x', 4 + fsl);
  if (!narrow) {
    el('text', { x: x(yr('2020-01-02')) + 8, y: axisY - barH + 17, class: 'tl-text tl-on', text: t('tl_test', { a: tA, b: tB }) }, svg);
    el('text', { x: x(yr('2020-01-02')), y: axisY + 36, class: 'tl-sub', text: t('tl_test_sub') }, svg);
  } else {
    el('text', { x: W - 14, y: axisY + 64, 'text-anchor': 'end', class: 'tl-text', text: t('tl_test', { a: tA, b: tB }) }, svg);
    el('text', { x: W - 14, y: axisY + 80, 'text-anchor': 'end', class: 'tl-sub', text: t('tl_test_sub') }, svg);
  }
  const px = x(yr('2026-10-27')) + 6;
  const pbx = narrow ? x(yr('2026-10-27')) - 52 : px, pby = narrow ? axisY - barH - 32 : axisY - barH;
  el('rect', { x: pbx, y: pby, width: 52, height: barH, rx: 2, class: 'tl-pass' }, svg);
  el('text', { x: pbx + 26, y: pby + 17, 'text-anchor': 'middle', class: 'tl-pass-text', text: t('tl_pass') }, svg);
  // Hindsight leak: an arc from the test period back to the design period.
  const lx0 = x(2023), lx1 = x(2012), ly = axisY + 50;
  if (!narrow) {
    el('path', { d: `M${lx0},${axisY + 4} C${lx0},${ly + 30} ${lx1},${ly + 30} ${lx1},${ly - 4}`, class: 'tl-leak' }, svg);
    el('path', { d: `M${lx1 - 4},${ly + 2} L${lx1},${ly - 6} L${lx1 + 4},${ly + 2}`, class: 'tl-leak' }, svg);
    wrapText(el('text', { x: lx1 - 30, y: ly + 40, class: 'tl-leak-text' }, svg), t('tl_leak'), W - lx1 + 10, 14);
  } else {
    wrapText(el('text', { x: x(2005), y: axisY + 112, class: 'tl-leak-text' }, svg), `⟲ ${t('tl_leak')}`, W - 28, 14);
  }

  const rc = S.data.research.c30_test;
  document.getElementById('tl-checks').innerHTML = rc.checks.map((c, i) => `<li><span class="ok${c.pass ? '' : ' no'}" role="img" aria-label="${esc(t(c.pass ? 'pass' : 'fail'))}"></span><span>${esc(zh() ? CHECKS_ZH[i] : (CHECKS_EN[i] || c.en))}</span></li>`).join('');
  const c30 = rc.c30, spy = rc.spy;
  // The same-pain SPY + T-bill mix, recomputed here (daily-rebalanced, test.md's share), as a third column.
  const ctx = S.ctx, ta = ctx.index.get(rc.test[0]), tb = ctx.index.get(rc.test[1]);
  const wS = rc.same_pain_spy_share, rSpy = C.blockReturns(ctx, 'SPY'), rCash = C.blockReturns(ctx, 'CASH');
  const rSame = new Float64Array(ctx.n).fill(NaN);
  for (let i = ta; i <= tb; i++) rSame[i] = wS * rSpy[i] + (1 - wS) * rCash[i];
  const sm = C.scorecard(ctx, rSame, ta, tb);
  const sFalls = rc.falls.map((f) => { const [p0, p1] = f.fall.split(' to '); return C.returnOver(ctx, rSame, ctx.index.get(p0), ctx.index.get(p1)); });
  const mo = (v) => t('months', { n: v.toFixed(0) });
  const rows = [
    [t('th_cagr'), pct(c30.cagr), pct(spy.cagr), pct(sm.cagr)], [t('th_mdd'), pct(c30.mdd), pct(spy.mdd), pct(sm.mdd)], [t('th_f10'), c30.f10, spy.f10, sm.f10],
    [t('th_wm'), pct(c30.wm), pct(spy.wm), pct(sm.wm)], [t('th_luw'), mo(c30.luw), mo(spy.luw), mo(sm.luw)],
    [t('th_ulcer'), pain(c30.ulcer), pain(spy.ulcer), pain(sm.ulcer)], [t('th_edge'), signed(c30.edge * 100), '0.0', '0.0'],
    ...rc.falls.map((f, i) => [t(['row_falls_covid', 'row_falls_2022', 'row_falls_2025'][i]), pct(f.c30, 1, true), pct(f.spy, 1, true), pct(sFalls[i], 1, true)]),
  ];
  const tbl = document.getElementById('tl-result');
  document.getElementById('result-h').textContent = t('result_h', { a: tA, b: tB });
  document.getElementById('tl-res-cap').textContent = t('result_h', { a: tA, b: tB });
  tbl.tHead.innerHTML = `<tr><th scope="col"></th><th scope="col">${swatch('var(--s-core)')} ${esc(t('th_c30'))}</th><th scope="col">${swatch('var(--s-spy)')} ${esc(t('th_spy'))}</th><th scope="col" class="wrap-head">${swatch('var(--s-twin)', 'dash')} ${esc(t('th_same'))}</th></tr>`;
  tbl.tBodies[0].innerHTML = rows.map(([l, a, b, c]) => `<tr><th scope="row">${esc(l)}</th><td><strong>${esc(String(a))}</strong></td><td>${esc(String(b))}</td><td>${esc(String(c))}</td></tr>`).join('');
  document.getElementById('tl-caveats').innerHTML = rc.caveats_en.map((c, i) => `<li>${esc(zh() ? CAVEATS_ZH[i] : c)}</li>`).join('');
}

/** Break an SVG text into tspans that fit maxWidth (words in English, characters in Chinese). */
function wrapText(node, str, maxWidth, lh) {
  const tokens = zh() ? [...str] : str.split(' ');
  const sep = zh() ? '' : ' ';
  const x = node.getAttribute('x');
  let line = [], tspan = el('tspan', { x, dy: 0 }, node);
  for (const tok of tokens) {
    line.push(tok);
    tspan.textContent = line.join(sep);
    if (tspan.getComputedTextLength() > maxWidth && line.length > 1) {
      line.pop(); tspan.textContent = line.join(sep);
      line = [tok];
      tspan = el('tspan', { x, dy: lh }, node);
      tspan.textContent = tok;
    }
  }
}

/* ================================================================== CAVEATS + METHOD */
function renderCaveats() {
  const host = document.getElementById('donts');
  if (!host.parentElement.classList.contains('caveats-grid')) {
    const grid = document.createElement('div');
    grid.className = 'caveats-grid';
    host.parentElement.insertBefore(grid, host);
    grid.appendChild(host);
    const box = document.createElement('div');
    box.className = 'limits-box';
    box.innerHTML = '<h3 class="sub" id="limits-h"></h3><ul class="limits" id="limits"></ul>';
    grid.appendChild(box);
  }
  host.innerHTML = DONTS[S.lang].map(([b, s]) => `<li><div><b>${esc(b)}</b><span>${esc(s)}</span></div></li>`).join('');
  document.getElementById('limits-h').textContent = t('limits_h');
  document.getElementById('limits').innerHTML = LIMITS[S.lang].map((s) => `<li>${esc(s)}</li>`).join('');
}
function renderMethod() {
  document.getElementById('glossary').innerHTML = GLOSSARY[S.lang].map(([dt, dd]) => `<div><dt>${esc(dt)}</dt><dd>${esc(dd)}</dd></div>`).join('');
  document.getElementById('method-list').innerHTML = METHOD[S.lang].map((s) => `<li>${esc(s)}</li>`).join('');
  const L = S.data.meta.links;
  const items = [
    ['recommendations', zh() ? '策略师建议（RECOMMENDATIONS.md）' : 'Strategist recommendations (RECOMMENDATIONS.md)'],
    ['shock_absorber_mix', zh() ? '避震组合：结果' : 'Shock-absorber mix: results'],
    ['protocol', zh() ? '预先登记的检验方案（PROTOCOL.md）' : 'Pre-registered protocol (PROTOCOL.md)'],
    ['test', zh() ? '样本外检验（test.md）' : 'Out-of-sample test (test.md)'],
    ['fund_drops', zh() ? '约 90 只基金的回撤表现' : 'About 90 funds in drops'],
    ['fund_review', zh() ? '基金审查总览' : 'Fund review overview'],
    ['model_portfolios_py', zh() ? '模型组合脚本（model_portfolios.py）' : 'Model portfolio script (model_portfolios.py)'],
    ['build_script', zh() ? '本页数据构建脚本（build_site_data.py）' : 'This page’s data builder (build_site_data.py)'],
    ['repo', zh() ? '代码仓库' : 'Repository'],
  ];
  document.getElementById('links').innerHTML = items.map(([k, label]) => `<li><a href="${L[k]}">${esc(label)}</a>${zh() && k !== 'repo' ? '（英文）' : ''}</li>`).join('');
  const D = S.data.meta.disclaimer;
  document.getElementById('disc-text').textContent = zh() ? D.zh : D.en;
  document.getElementById('disc-approx').textContent = zh() ? D.approximate_zh : D.approximate_en;
  document.getElementById('ft-data').textContent = t('ft_data', { d: dLong(S.data.meta.data_end) });
  renderVerify();
}
let verifyResult = null;
function runVerify() {
  const ctx = S.ctx; let worst = 0, bad = 0, nChecked = 0;
  for (const row of S.data.checks) {
    const a = winIdx(row.window);
    const r = C.mixReturns(ctx, row.blocks, row.currency);
    const m = C.metrics(ctx, r, a, S.end, row.currency);
    for (const k of ['cagr', 'mdd', 'ulcer', 'wm']) {
      const dlt = Math.abs(m[k] - row.m[k]); worst = Math.max(worst, dlt); if (dlt > 0.0005) bad++;
    }
    const ek = row.currency === 'USD' ? 'edge' : 'edge_sgd_proxy';
    if (row.m[ek] !== null && m.edge !== null) { const dlt = Math.abs(m.edge - row.m[ek]); worst = Math.max(worst, dlt); if (dlt > 0.0005) bad++; }
    if (m.f10 !== row.m.f10) bad++;
    nChecked++;
  }
  verifyResult = { n: nChecked, worst, bad };
  renderVerify();
}
function renderVerify() {
  const host = document.getElementById('verify');
  if (!verifyResult) { host.className = 'verify pending'; host.textContent = t('verify_run'); return; }
  const { n, worst, bad } = verifyResult;
  host.className = 'verify' + (bad ? ' bad' : '');
  host.innerHTML = bad ? t('verify_bad', { k: bad, n, d: (worst * 100).toFixed(4) }) : t('verify_ok', { n, d: (worst * 100).toFixed(4) });
}

/* ================================================================== static text + language */
function applyStatic() {
  const root = document.documentElement;
  root.setAttribute('lang', zh() ? 'zh-Hans' : 'en');
  root.setAttribute('data-lang', S.lang);
  document.title = t('title');
  document.querySelector('meta[name="description"]').setAttribute('content', t('meta_desc'));
  const vars = heroVars();
  document.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n, vars); });
  document.querySelectorAll('[data-i18n-html]').forEach((n) => { n.innerHTML = t(n.dataset.i18nHtml, vars); });
  document.querySelectorAll('[data-i18n-aria]').forEach((n) => { n.setAttribute('aria-label', t(n.dataset.i18nAria)); });
  document.querySelectorAll('[data-i18n-rd]').forEach((n) => { n.setAttribute('aria-roledescription', t(n.dataset.i18nRd)); });
  document.querySelectorAll('[data-lang-btn]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.langBtn === S.lang ? 'true' : 'false'));
  document.querySelector('.brand').setAttribute('aria-label', t('brand'));
  updateThemeLabel();
}
function heroVars() {
  const { spy, core } = heroFigures();
  const H = HERO_STATIC, rc = S.data ? S.data.research.c30_test : null;
  return {
    core_mdd: pct(core.mdd), spy_mdd: pct(spy.mdd), core_mdd_abs: pctAbs(core.mdd), spy_mdd_abs: pctAbs(spy.mdd),
    core_cagr: pct(core.cagr), spy_cagr: pct(spy.cagr),
    test_core_mdd: pct(rc ? rc.c30.mdd : H.test.core), test_spy_mdd: pct(rc ? rc.spy.mdd : H.test.spy),
    t0: dLong(rc ? rc.test[0] : H.t0), t1: dLong(rc ? rc.test[1] : H.t1),
    start: dLong(S.data ? S.data.windows['2008'].start : H.start), end: dLong(S.data ? S.data.meta.data_end : H.end),
    repo: S.data ? S.data.meta.links.repo : 'https://github.com/heyneww/GL-portfolio-exploration',
  };
}
function renderAll() {
  applyStatic();
  renderHeroNumbers();
  if (!S.data) return;
  renderHero(); renderHeroNumbers();
  renderExControls(); renderExplorer();
  renderFalls();
  renderModels();
  renderBuilderControls(); renderBuilder();
  renderFundControls(); renderFunds();
  renderTest(); renderCaveats(); renderMethod();
}
function setLang(l) {
  if (l === S.lang) return;
  S.lang = l; store('wl-lang', l);
  renderAll();
}

/* theme */
function effectiveTheme() {
  const a = document.documentElement.getAttribute('data-theme');
  if (a) return a;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function updateThemeLabel() {
  const b = document.getElementById('theme-btn');
  b.setAttribute('aria-label', t(effectiveTheme() === 'dark' ? 'theme_to_light' : 'theme_to_dark'));
}

/* ================================================================== boot */
function wireGlobal() {
  document.querySelectorAll('[data-lang-btn]').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.langBtn)));
  document.getElementById('theme-btn').addEventListener('click', () => {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    const os = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    // Back to the OS setting when the choice matches it (so "system" is reachable again); otherwise override it.
    if (next === os) {
      document.documentElement.removeAttribute('data-theme');
      try { localStorage.removeItem('wl-theme'); } catch (e) { /* storage unavailable */ }
    } else {
      document.documentElement.setAttribute('data-theme', next);
      store('wl-theme', next);
    }
    updateThemeLabel();
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', updateThemeLabel);
  for (const id of ['ex-growth', 'ex-dd']) {
    const n = document.getElementById(id);
    n.tabIndex = 0;
    n.addEventListener('keydown', exKeyboard);
    n.addEventListener('blur', () => exCursor && exCursor.clear());
  }
  document.getElementById('fa-prev').addEventListener('click', () => selectFall(S.fa.k - 1));
  document.getElementById('fa-next').addEventListener('click', () => selectFall(S.fa.k + 1));
  document.getElementById('fu-search').addEventListener('input', (ev) => { S.fu.q = ev.target.value; S.fu.focus = -1; renderFunds(); });
  document.getElementById('fu-cat').addEventListener('change', (ev) => { S.fu.cat = ev.target.value; renderFunds(); });
  // Disclaimer links: let the page scroll there, then move focus once the scroll has ended (focus and view stay together).
  document.querySelectorAll('a[href="#disclaimer"]').forEach((a) => a.addEventListener('click', () => {
    const box = document.getElementById('disclaimer');
    afterScroll(() => box.focus({ preventScroll: true }));
  }));
  // Section nav: mark the section in view. Only the nav strip itself scrolls sideways; never scrollIntoView here,
  // which would cancel the page's own smooth scroll to an anchor.
  const nav = document.querySelector('.sections'), ol = nav.querySelector('ol');
  const links = [...document.querySelectorAll('.sections a')];
  const map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) {
      links.forEach((a) => a.removeAttribute('aria-current'));
      const a = map.get(e.target.id);
      if (!a) continue;
      a.setAttribute('aria-current', 'true');
      if (ol.scrollWidth > ol.clientWidth) {
        const l = a.offsetLeft, r = l + a.offsetWidth;
        if (l < ol.scrollLeft || r > ol.scrollLeft + ol.clientWidth) ol.scrollTo({ left: Math.max(0, l - 16), behavior: 'auto' });
      }
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  map.forEach((_, id) => { const s = document.getElementById(id); if (s) io.observe(s); });
  const navEnd = () => nav.classList.toggle('at-end', ol.scrollLeft + ol.clientWidth >= ol.scrollWidth - 4);
  ol.addEventListener('scroll', navEnd, { passive: true }); navEnd();
  // Header height drives the sticky offsets (scroll padding, the builder's result strip).
  const mast = document.querySelector('.masthead');
  const setMast = () => document.documentElement.style.setProperty('--mast-h', `${mast.offsetHeight}px`);
  setMast();
  if (window.ResizeObserver) new ResizeObserver(setMast).observe(mast);
  // Resize: re-render the charts when the width changes.
  let lastW = window.innerWidth, tmr = 0;
  window.addEventListener('resize', () => {
    if (window.innerWidth === lastW) return;
    lastW = window.innerWidth;
    clearTimeout(tmr);
    tmr = setTimeout(() => {
      if (!S.data) return;
      renderHero(); renderExplorer(); renderFallStrip(); renderFallDetail(); renderBuilder(); updateSwipeHints(); navEnd();
      if (S.fu.view === 'chart') renderScatter(S.data.funds.filter((f) => fundCard(f)));
      renderTest();
    }, 140);
  });
}

async function boot() {
  applyStatic();
  wireGlobal();
  const loading = document.getElementById('loading');
  try {
    const res = await fetch('data/showcase.json');
    if (!res.ok) throw new Error(res.status);
    S.data = await res.json();
  } catch (err) {
    loading.classList.add('error');
    loading.textContent = t('load_error');
    return;
  }
  S.ctx = C.prepare(S.data);
  S.end = S.ctx.n - 1;
  S.ex.a = winIdx('2008'); S.ex.b = S.end;
  renderAll();
  loading.hidden = true;
  // A shared link to a section (#build, #funds ...) was resolved while the sections were still empty: go again.
  if (location.hash && location.hash.length > 1) {
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) requestAnimationFrame(() => target.scrollIntoView({ behavior: 'instant', block: 'start' }));
  }
  whenIdle(runVerify);
}

/** Run fn once the page has stopped scrolling (scrollend where supported, else a short quiet period). */
function afterScroll(fn) {
  let done = false, tmr = 0;
  const finish = () => { if (done) return; done = true; window.removeEventListener('scroll', onScroll); window.removeEventListener('scrollend', finish); fn(); };
  const onScroll = () => { clearTimeout(tmr); tmr = setTimeout(finish, 160); };
  window.addEventListener('scroll', onScroll, { passive: true });
  if ('onscrollend' in window) window.addEventListener('scrollend', finish, { once: true });
  tmr = setTimeout(finish, 300);
}
/** "Swipe for more" under tables that are wider than their container. */
function updateSwipeHints() {
  document.querySelectorAll('.table-wrap').forEach((w) => {
    let hint = w.nextElementSibling;
    if (!hint || !hint.classList.contains('swipe-hint')) return;
    if (w.scrollWidth > w.clientWidth + 4 && w.scrollLeft < 8) hint.dataset.show = ''; else delete hint.dataset.show;
    if (!w.dataset.hinted) { w.dataset.hinted = '1'; w.addEventListener('scroll', () => { if (w.scrollLeft > 8) delete hint.dataset.show; }, { passive: true }); }
  });
}

boot();
