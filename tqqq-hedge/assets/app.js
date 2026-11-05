// TQQQ hedge page: loads data/*.json (exported from the verified study), renders every section in English or Chinese.
import { STR } from './i18n.js';
import * as C from './charts.js';

const S = {
  lang: document.documentElement.getAttribute('data-lang') === 'zh' ? 'zh' : 'en',
  d: null,
  grid: new Map(),
  ex: { hedge: 0.2, leverage: 2, rebalance: 'M', funding: 0.05, maintenance: 0.025 },
  gr: { win: 'main', sel: { main: new Set(['qqq', 'third_2x_realistic', 'recipe_a', 'mix_a', 'base']), stress: new Set(['qqq', 'base', 'third_3x', 'a_5x', 'a_2x']) } },
  rc: { funding: 0.05 },
};
const MINUS = '−';
const REPO = 'https://github.com/heyneww/GL-portfolio-exploration';
const STUDY_BRANCH = 'claude/exciting-bohr-etre25'; // the branch that holds reports/tqqq_short_hedge (not on main yet)
const DEEP_DIVE_URL = `${REPO}/blob/${STUDY_BRANCH}/reports/tqqq_short_hedge/DEEP_DIVE.md`;
const STUDY_URL = `${REPO}/tree/${STUDY_BRANCH}/reports/tqqq_short_hedge`;
const DEEP_DIVE_LOCAL = 'DEEP_DIVE.txt'; // plain-text copy of DEEP_DIVE.md published with the page
const HEDGE_LABEL = { 0.1: '0.10', 0.15: '0.15', 0.2: '0.20', 0.25: '0.25', 0.3333: '1/3', 0.5: '0.50' };
// [line colour, dash, text colour for labels (the darker --s-*-text tokens pass AA on the tinted background)]
const SERIES_STYLE = {
  qqq: ['var(--s-qqq)', null, 'var(--s-qqq-text)'], base: ['var(--s-base)', null, 'var(--s-base-text)'], mix_base: ['var(--s-mix)', 'dash', 'var(--s-mix-text)'],
  third_2x_realistic: ['var(--s-real)', null, 'var(--s-real-text)'], recipe_a: ['var(--s-a)', null, 'var(--s-a-text)'], recipe_a_5: ['var(--s-a)', 'dash', 'var(--s-a-text)'],
  mix_a: ['var(--s-mix)', 'dot', 'var(--s-mix-text)'],
  third_3x: ['var(--s-real)', null, 'var(--s-real-text)'], third_2x: ['var(--s-real)', 'dash', 'var(--s-real-text)'], a_5x: ['var(--s-a)', null, 'var(--s-a-text)'],
  a_2x: ['var(--s-a)', 'dash', 'var(--s-a-text)'], base_f0: ['var(--s-base)', 'dash', 'var(--s-base-text)'],
};
const MAIN_SERIES = ['qqq', 'third_2x_realistic', 'recipe_a', 'recipe_a_5', 'mix_a', 'base', 'mix_base'];
const STRESS_SERIES = ['qqq', 'base', 'third_3x', 'third_2x', 'a_5x', 'a_2x'];
const EP_MAIN_COLS = ['qqq', 'third_2x_realistic', 'recipe_a', 'recipe_a_5', 'base', 'third_3x', 'a_5x', 'base_f0', 'mix_base'];
const EP_STRESS_COLS = ['qqq', 'base', 'third_3x', 'third_2x', 'a_5x', 'a_2x'];

/* ---------- helpers ---------- */
const zh = () => S.lang === 'zh';
/** CJK typography: a straight-quoted phrase in Chinese text becomes “…” (attribute quotes, preceded by =, are kept). */
const ZH_QUOTE = /(?<!=)"([^"<>\n]+)"/g;
function zq(s) { return zh() ? String(s).replace(ZH_QUOTE, '“$1”') : String(s); }
function t(key, vars) {
  let s = STR[S.lang][key];
  if (s === undefined) s = STR.en[key];
  if (s === undefined) return key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
  return zq(s);
}
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
/** Display-only typography for English data strings (the JSON stays verbatim): curly quotes and apostrophes, en dashes
 *  in number ranges (never inside ISO dates such as 2026-06-24 or 06-27), a true minus before a number. `code` is left alone. */
const RANGE = /(?<![\d.\-])(\d+(?:\.\d+)?[kMB%x]?)-(\d+(?:\.\d+)?)(?![\d\-])/g;
function typoPart(p) {
  return p
    .replace(RANGE, (m, a, b) => ((/^\d{4}$/.test(a) && b.length === 2) || /^0\d$/.test(a) || /^0\d$/.test(b) ? m : `${a}–${b}`))
    .replace(/(^|[\s(\[\/])-(?=\.?\d)/g, '$1−')
    .replace(/(^|[\s(\[—–])"/g, '$1“').replace(/"/g, '”')
    .replace(/(\w)'/g, '$1’').replace(/(^|[\s(\[])'/g, '$1‘').replace(/'/g, '’');
}
/** Number ranges only (table labels such as 2010-2019 or VIX 15-20), in both languages. */
function dashRange(s) { return typoPart(String(s).replace(/["']/g, '')); }
function typo(s) { return zh() ? String(s) : String(s).split(/(`[^`]*`)/).map((p, i) => (i % 2 ? p : typoPart(p))).join(''); }
/** The study's own section numbers become "study §N" / "研究第 N 节", so they never read as this page's §01–§08;
 *  the verification script paths in the visible notes become a plain phrase. */
function refs(s) {
  s = String(s);
  if (zh()) return s.replace(/DEEP_DIVE(?:\.md)?\s*第\s*(\d+)\s*节/g, '研究第 $1 节').replace(/(?<!研究)第\s*(\d)\s*节/g, '研究第 $1 节')
    .replace(/[；;]\s*deep_dive\/_verify\/[\w\/.-]+\.py。?/g, '（脚本在研究的核查文件里）。').replace(/deep_dive\/_verify\/[\w\/.-]+\.py/g, '研究的核查文件');
  return s.replace(/DEEP_DIVE(?:\.md)? section (\d+)/g, 'study §$1').replace(/\b(?:in )?section (\d)\b/g, (m, n) => (m.startsWith('in ') ? 'in ' : '') + 'study §' + n)
    .replace(/;\s*deep_dive\/_verify\/[\w\/.-]+\.py\.?/g, ' (script in the study’s verification files).').replace(/deep_dive\/_verify\/[\w\/.-]+\.py/g, 'the study’s verification files').replace(/^study §/, 'Study §');
}
/** A data string, escaped, with study references, typography and Chinese quotes fixed. */
function tx(s) { return esc(typo(zq(refs(s)))); }
/** This page's own sections (§01–§08) as links to their anchors (not inside an existing link). */
const SEC_IDS = ['what', 'explore', 'growth', 'funding', 'decay', 'years', 'recipes', 'caveats'];
function secLinks(html) { return String(html).replace(/§0([1-8])(?![^<]*<\/a>)/g, (m, n) => `<a class="secref" href="#${SEC_IDS[n - 1]}">${m}</a>`); }
/** A dated phrase that must not break across lines. */
function nw(s) { return `<span class="nw">${esc(s)}</span>`; }
/** Minimal markdown: **bold** and `code` on an escaped string. */
function mdOf(s) { return s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>'); }
function md(s) { return mdOf(tx(s)); }
function num(x, d = 1) {
  if (x === null || x === undefined || !Number.isFinite(x)) return t('dash');
  const a = Math.abs(x).toFixed(d);
  return (x < 0 && +a !== 0 ? MINUS : '') + a;
}
function pct(x, d = 1) { return x === null || x === undefined || !Number.isFinite(x) ? t('dash') : num(x * 100, d) + '%'; }
function signedNum(x, d = 1) { if (x === null || x === undefined || !Number.isFinite(x)) return t('dash'); const a = Math.abs(x).toFixed(d); return (x < 0 && +a !== 0 ? MINUS : '+') + a; }
function ptsTxt(x, d = 1) { return x === null || x === undefined || !Number.isFinite(x) ? t('dash') : t('pts', { v: signedNum(x * 100, d) }); }
/** Points as a big number: the unit set small beside the digits (in Chinese "个点" would otherwise outweigh them). */
function ptsHtml(x, d = 1) { return x === null || x === undefined || !Number.isFinite(x) ? t('dash') : `${signedNum(x * 100, d)}<span class="unit">${zh() ? '' : '\u2009'}${esc(t('pts_unit'))}</span>`; }
/** Liquidations a year: two decimals below 2 (0.18, 1.26, 1.34 as the deep dive prints them), one above. */
function liqTxt(x) { if (x === null || x === undefined || !Number.isFinite(x)) return t('dash'); return Math.abs(x) < 2 ? x.toFixed(2) : x.toFixed(1); }
function money(v) { return v === null || v === undefined ? t('dash') : '$' + v.toFixed(2); }
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function dLong(iso) { const [y, m, d] = iso.split('-').map(Number); return zh() ? `${y} 年 ${m} 月 ${d} 日` : `${d} ${MON[m - 1]} ${y}`; }
function dMonth(iso) { const [y, m] = iso.split('-').map(Number); return zh() ? `${y} 年 ${m} 月` : `${MON[m - 1]} ${y}`; }
function int(n) { return Math.round(n).toLocaleString('en-US'); }
function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }
function swatch(color, dash) { return `<span class="swatch${dash === 'dash' ? ' swatch--dash' : dash === 'dot' ? ' swatch--dot' : ''}" style="color:${color}" aria-hidden="true"></span>`; }
function cls(x) { return x > 0 ? 'pos' : x < 0 ? 'neg' : ''; }
function heat(x, scale = 0.3) {
  if (x === null || x === undefined) return '';
  const k = Math.min(1, Math.abs(x) / scale);
  const c = x >= 0 ? 'var(--ok)' : 'var(--loss)'; // the same gain colour as the tiles' and tables' positive numbers
  return `style="background:color-mix(in srgb, ${c} ${Math.round(k * 28)}%, transparent)"`;
}
function sname(id) { return t('s_' + id); }
function sshort(id) { return t('short_' + id); }
const narrow = () => window.innerWidth <= 720;
function segmented(host, options, current, onPick) {
  host.innerHTML = '';
  host.style.setProperty('--seg-cols', options.length <= 4 ? options.length : 3);
  for (const o of options) {
    const b = document.createElement('button');
    b.type = 'button'; b.setAttribute('role', 'radio'); b.textContent = o.label;
    b.setAttribute('aria-checked', o.value === current ? 'true' : 'false');
    b.addEventListener('click', () => onPick(o.value));
    host.appendChild(b);
  }
}
function tableFill(id, head, rows) {
  const tb = document.getElementById(id);
  tb.querySelector('thead').innerHTML = `<tr>${head.map((h) => (typeof h === 'string' ? `<th scope="col">${h}</th>` : `<th scope="col" class="${h.cls}">${h.html}</th>`)).join('')}</tr>`;
  tb.querySelector('tbody').innerHTML = rows.join('');
}
function cellKey(c) { return [c.hedge, c.leverage, c.rebalance, c.funding, c.maintenance].join('|'); }
function cell(h, l, r, f, m) { return S.grid.get([h, l, r, f, m].join('|')); }
function rcCell(h, l, m, f, w) { return S.d.grid.realistic_case.cells.find((c) => c.hedge === h && c.leverage === l && c.maintenance === m && c.funding === f && c.window === w); }
/** A tile label; terms explained in the glossary get a dotted link to their entry (opened if it is folded). */
const GLOSSED = { tile_sharpe: 'sharpe', tile_liqcost: 'topup', tile_vs: 'mix', tile_fund_share: 'nav', tile_fees_share: 'taker', tile_liq: 'liq', tile_mdd: 'worst',
  th_gap: 'gap', th_cost: 'cost', th_comp: 'comp', th_decay: 'decay', th_giveback: 'giveback', th_beat: 'beat', th_comp_neg: 'beat' };
function label(key) { return GLOSSED[key] ? `<a class="term" href="#gl-${GLOSSED[key]}">${esc(t(key))}</a>` : esc(t(key)); }
/** The glossary: the six terms the trade needs shown, the rest folded. */
const GL_OPEN = ['hedge', 'isolated', 'maint', 'liq', 'funding', 'reset'];
const GL_MORE = ['perp', 'notional', 'leverage', 'taker', 'topup', 'mix', 'tbills', 'nav', 'sharpe', 'pts', 'worst', 'cagr', 'gap', 'cost', 'comp', 'decay', 'giveback', 'beat', 'tstat', 'adl', 'basis', 'xstocks'];

/* ---------- hero ---------- */
function renderHero() {
  const g = S.d.grid, m = S.d.meta;
  document.getElementById('hero-data').innerHTML = t('hero_data', { start: nw(dLong(m.data_start)), end: nw(dLong(m.data_end)), days: int(m.trading_days), written: nw(dLong(m.written)) });
  const third = rcCell(0.3333, 2, 0.025, 0.05, '2010-02..2026-10');
  const a = rcCell(0.2, 2, 0.025, 0.05, '2010-02..2026-10');
  const a10 = cell(0.2, 2, 'M', 0.1, 0.01);
  // the comparison is the point, so it is the big number; the return is the sub line; the parameters a muted mono line
  const items = [
    [t('hero_n1'), ptsHtml(third.vs_mix), cls(third.vs_mix), t('hero_n1_sub', { cagr: pct(third.cagr), tb: pct(g.tbill_cagr) }), t('hero_n1_params')],
    [t('hero_n2'), ptsHtml(a.vs_mix), cls(a.vs_mix), t('hero_n2_sub', { cagr: pct(a.cagr) }), t('hero_n2_params')],
    [t('hero_n3'), esc(money(a10.final_value)), '', t('hero_n3_sub', { qqq: money(g.spot_only.final_value) }), t('hero_n3_params')],
  ];
  document.getElementById('hero-numbers').innerHTML = items.map(([dt, big, c, sub, params]) =>
    `<div class="sounding"><dt>${esc(dt)}</dt><dd><span class="big ${c}">${big}</span><span class="sub">${esc(sub)}</span><span class="params">${esc(params)}</span></dd></div>`).join('');
  // what "recipe A" means, and why the $4.72 here differs from the 2.5%-maintenance curve in section 03
  document.getElementById('hero-recipe-note').innerHTML = t('hero_recipe_note_html', { a1: money(a10.final_value), a25: money(S.d.curves.main.series.recipe_a.stats.final_value) });
  // five lines: a short lead each, the study's own sentence behind a disclosure (verbatim from DEEP_DIVE.md)
  document.getElementById('five').innerHTML = m.five_lines[S.lang].map((s, i) =>
    `<li><span class="lead">${esc(t('five_lead_' + (i + 1)))}</span><details><summary>${esc(t('five_more'))}</summary><p>${md(s)}</p></details></li>`).join('');
  // the modelling assumptions as a definition list (the same content as meta.assumptions, split by topic)
  const as = ['spot', 'short', 'liq', 'fees', 'reserve', 'margin', 'funding', 'data'];
  document.getElementById('assumptions').innerHTML = as.map((k) => `<div><dt>${esc(t('as_' + k))}</dt><dd>${esc(t('as_' + k + '_d', { start: dLong(m.data_start), end: dLong(m.data_end) }))}</dd></div>`).join('');
  const gl = (k) => `<div id="gl-${k}"><dt>${esc(t('gl_' + k))}</dt><dd>${secLinks(esc(t('gl_' + k + '_d')))}</dd></div>`;
  document.getElementById('glossary').innerHTML = GL_OPEN.map(gl).join('');
  document.getElementById('glossary-more').innerHTML = GL_MORE.map(gl).join('');
  document.getElementById('gl-more-sum').textContent = t('glossary_more', { n: GL_MORE.length });
  document.getElementById('ft-data').innerHTML = zh() ? `${nw(dLong(m.data_start))}至${nw(dLong(m.data_end))}` : `${nw(dLong(m.data_start))} → ${nw(dLong(m.data_end))}`;
  document.getElementById('hero-repo').href = STUDY_URL;
}

/* ---------- diagram: HTML boxes and arrows (real text, stacks under 600 px) + a price panel drawn at host width ---------- */
function renderDiagram() {
  const host = document.getElementById('diagram');
  const right = '<svg viewBox="0 0 44 16" aria-hidden="true"><path class="dg-arrow" d="M2 8h36M32 3l6 5-6 5"/></svg>';
  const left = '<svg viewBox="0 0 44 16" aria-hidden="true"><path class="dg-arrow" d="M42 8H6M12 3L6 8l6 5"/></svg>';
  host.innerHTML = `<div class="dg">
    <div class="dg-box dg-box--spot"><b>${esc(t('dg_spot'))}</b><span>${esc(t('dg_spot_sub'))}</span></div>
    <div class="dg-link dg-link--hedge">${right}<div><span>${esc(t('dg_hedge'))}</span></div></div>
    <div class="dg-box dg-box--perp"><b>${esc(t('dg_perp'))}</b><span>${esc(t('dg_perp_sub'))}</span>
      <div class="dg-margin"><b>${esc(t('dg_margin'))}</b><span>${esc(t('dg_margin_sub'))}</span><span class="dg-m">${esc(t('dg_leverage'))}</span></div></div>
    <div class="dg-link dg-link--fund">${left}<div><b>${esc(t('dg_funding'))}</b><span>${esc(t('dg_funding_sub'))}</span></div></div>
  </div><div class="dg-price-host" id="dg-price"></div>`;
  drawPricePanel(document.getElementById('dg-price'));
}
function drawPricePanel(host) {
  // Under 480 px the labels get their own places: "TQQQ price" as an axis title at the top, the "down" label under the
  // baseline, the "up" label to the left of its arrow above the curve, each with a halo in the card's colour.
  const W = host.clientWidth || 600, small = W < 480, H = small ? 232 : 176;
  const svg = C.el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, host);
  const defs = C.el('defs', {}, svg);
  for (const [id, color] of [['dg-head-loss', 'var(--loss)'], ['dg-head-ok', 'var(--ok)']]) {
    const mk = C.el('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
    C.el('path', { d: 'M0 0L10 5L0 10z', fill: color }, mk);
  }
  const x0 = 6, x1 = W - 6, liqY = small ? 60 : 24, bottom = small ? H - 24 : H - 6, resetY = small ? bottom - 44 : H - 48;
  C.el('line', { class: 'dg-axis', x1: x0, x2: x1, y1: bottom, y2: bottom }, svg);
  C.el('line', { class: 'dg-axis', x1: x0, x2: x0, y1: liqY - 18, y2: bottom }, svg);
  C.el('line', { class: 'dg-reset', x1: x0, x2: x1, y1: resetY, y2: resetY }, svg);
  C.el('text', { class: 'dg-t', x: x1 - 2, y: resetY + 15, 'text-anchor': 'end', text: t('dg_reset') }, svg);
  C.el('line', { class: 'dg-liq', x1: x0, x2: x1, y1: liqY, y2: liqY }, svg);
  if (small) {
    C.el('text', { class: 'dg-liq-t', x: x0 + 6, y: liqY - 20, text: t('dg_liq') }, svg);
    C.el('text', { class: 'dg-liq-t', x: x0 + 6, y: liqY - 6, style: 'font-weight:400', text: t('dg_liq_sub') }, svg);
  } else C.el('text', { class: 'dg-liq-t', x: x0 + 6, y: liqY - 7, text: t('dg_liq') + ' · ' + t('dg_liq_sub') }, svg);
  if (small) C.el('text', { class: 'dg-t dg-halo', x: x0 + 6, y: 12, text: t('dg_price') + ' ↑' }, svg);
  else C.el('text', { class: 'dg-t', x: x0 + 6, y: bottom - 4, text: t('dg_price') }, svg);
  // the price path: starts on the reset price, wanders, ends on the liquidation line
  const px = (f) => x0 + 14 + (x1 - x0 - 24) * f, span = resetY - liqY;
  const d = `M${px(0)} ${resetY} C ${px(0.1)} ${resetY + 8}, ${px(0.18)} ${resetY + 14}, ${px(0.26)} ${resetY + 6}` +
    ` S ${px(0.4)} ${resetY - span * 0.35}, ${px(0.5)} ${resetY - span * 0.28}` +
    ` S ${px(0.64)} ${resetY + 4}, ${px(0.74)} ${resetY - span * 0.2}` +
    ` S ${px(0.9)} ${liqY + span * 0.3}, ${px(1)} ${liqY + 1}`;
  C.el('path', { class: 'dg-path', d }, svg);
  C.el('circle', { cx: px(1), cy: liqY + 1, r: 4.5, fill: 'var(--loss)' }, svg);
  // up: the short loses (red arrow from the reset price towards the line); down: the short gains (green, below the reset)
  const ux = px(0.58);
  C.el('path', { class: 'dg-varrow', d: `M${ux} ${resetY - 6} L${ux} ${liqY + 14}`, stroke: 'var(--loss)', 'marker-end': 'url(#dg-head-loss)' }, svg);
  if (small) C.el('text', { class: 'dg-lose dg-halo', x: ux - 8, y: liqY + 24, 'text-anchor': 'end', text: t('dg_up') }, svg);
  else C.el('text', { class: 'dg-lose dg-halo', x: ux + 8, y: liqY + 26, text: t('dg_up') }, svg);
  const dx = px(0.18);
  C.el('path', { class: 'dg-varrow', d: `M${dx} ${resetY + 6} L${dx} ${bottom - 8}`, stroke: 'var(--ok)', 'marker-end': 'url(#dg-head-ok)' }, svg);
  if (small) C.el('text', { class: 'dg-gain dg-halo', x: x0 + 6, y: bottom + 17, text: t('dg_down') }, svg);
  else C.el('text', { class: 'dg-gain dg-halo', x: dx + 8, y: resetY + 30, text: t('dg_down') }, svg);
}

/* ---------- explorer ---------- */
function thresholdTxt(lev, m) { return pct((1 / lev - m) / (1 + m)); }
function renderExControls() {
  const ax = S.d.grid.axes, e = S.ex;
  const presets = [
    ['preset_real', { hedge: 0.2, leverage: 2, rebalance: 'M', funding: 0.05, maintenance: 0.025 }],
    ['preset_third_real', { hedge: 0.3333, leverage: 2, rebalance: 'M', funding: 0.05, maintenance: 0.025 }],
    ['preset_a', { hedge: 0.2, leverage: 2, rebalance: 'M', funding: 0.1, maintenance: 0.025 }],
    ['preset_a1', { hedge: 0.2, leverage: 2, rebalance: 'M', funding: 0.1, maintenance: 0.01 }],
    ['preset_base', { hedge: 0.3333, leverage: 5, rebalance: 'M', funding: 0.1, maintenance: 0.01 }],
  ];
  const ph = document.getElementById('ex-presets');
  ph.innerHTML = '';
  for (const [k, p] of presets) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.textContent = t(k);
    const same = Object.keys(p).every((q) => p[q] === e[q]);
    b.setAttribute('aria-pressed', same ? 'true' : 'false');
    b.addEventListener('click', () => { Object.assign(S.ex, p); renderExControls(); renderExplorer(); });
    ph.appendChild(b);
  }
  const pick = (k) => (v) => { S.ex[k] = v; renderExControls(); renderExplorer(); };
  segmented(document.getElementById('ex-hedge'), ax.hedge.map((h) => ({ value: h, label: HEDGE_LABEL[h] })), e.hedge, pick('hedge'));
  segmented(document.getElementById('ex-lev'), ax.leverage.map((l) => ({ value: l, label: zh() ? `${l} 倍` : `${l}x` })), e.leverage, pick('leverage'));
  segmented(document.getElementById('ex-reset'), ax.rebalance.map((r) => ({ value: r, label: t('reset_' + r) })), e.rebalance, pick('rebalance'));
  segmented(document.getElementById('ex-funding'), ax.funding.map((f) => ({ value: f, label: signedNum(f * 100, 0) + '%' })), e.funding, pick('funding'));
  segmented(document.getElementById('ex-maint'), ax.maintenance.map((m) => ({ value: m, label: pct(m, m === 0.025 ? 1 : 0) })), e.maintenance, pick('maintenance'));
}
/** The same setting in the realistic case (taker 0.06%, 2010–2026), when the study ran it: monthly reset only. */
function rcTwin(e) { return e.rebalance === 'M' ? rcCell(e.hedge, e.leverage, e.maintenance, e.funding, '2010-02..2026-10') : null; }
let stripPrev = null;
function renderExplorer() {
  const e = S.ex, g = S.d.grid;
  const c = cell(e.hedge, e.leverage, e.rebalance, e.funding, e.maintenance);
  if (!c) return;
  // phones: a compact strip of the four key results, sticky under the masthead while the explorer is on screen, so a tap on
  // a control visibly changes something; a changed value flashes once
  const strip = [['strip_cagr', esc(pct(c.cagr)), ''], ['strip_vs', ptsHtml(c.vs_mix), cls(c.vs_mix)], ['strip_mdd', esc(pct(c.max_dd)), 'neg'], ['strip_liq', esc(liqTxt(c.liquidations_per_year)), '']];
  const sh = document.getElementById('ex-strip');
  sh.innerHTML = strip.map(([k, v, c2], i) => `<div class="strip__cell${stripPrev && stripPrev[i] !== v ? ' flash' : ''}"><span class="strip__k">${esc(t(k))}</span><span class="strip__v ${c2}">${v}</span></div>`).join('');
  stripPrev = strip.map((s) => s[1]);
  const twin = rcTwin(e);
  const feeNote = twin ? t('vs_fee_rc_html', { v: esc(ptsTxt(twin.vs_mix)) }) : t('vs_fee_gen_html');
  const tile = (key, v, c2, sub) => `<div class="tile"><dt>${label(key)}</dt><dd><span class="v ${c2 || ''}">${v}</span>${sub ? `<span class="s">${sub}</span>` : ''}</dd></div>`;
  document.getElementById('ex-tiles').innerHTML = [
    tile('tile_cagr', pct(c.cagr)),
    tile('tile_vol', pct(c.vol)),
    tile('tile_mdd', pct(c.max_dd), 'neg'),
    tile('tile_liq', liqTxt(c.liquidations_per_year)),
    `<div class="tile tile--vs"><dt>${label('tile_vs')}</dt><dd><span class="v ${cls(c.vs_mix)}">${ptsHtml(c.vs_mix)}</span><span class="s s--fee">${feeNote}</span><span class="s">${esc(t('vs_detail', { share: pct(c.mix_share), cagr: pct(c.mix_cagr), mdd: pct(c.mix_max_dd) }))}</span></dd></div>`,
  ].join('');
  document.getElementById('ex-tiles2').innerHTML = [
    tile('tile_final', money(c.final_value)),
    tile('tile_wm', pct(c.worst_month), 'neg'),
    tile('tile_sharpe', num(c.sharpe, 2)),
    tile('tile_liqcost', esc(t('pts', { v: num(c.liq_cost * 100) })), '', esc(t('tile_liqcost_sub'))),
    tile('tile_fund_share', pct(c.funding_share), '', esc(t('share_sub'))),
    tile('tile_fees_share', pct(-c.fees_share), '', esc(t('share_sub'))),
  ].join('');
  document.getElementById('ex-sentence').innerHTML = t('ex_sentence_html', {
    lev: e.leverage, maint: pct(e.maintenance, e.maintenance === 0.025 ? 1 : 0), thr: thresholdTxt(e.leverage, e.maintenance),
    period: t('period_' + e.rebalance), liq: liqTxt(c.liquidations_per_year),
  });
  C.barsH(document.getElementById('ex-bars'), {
    rows: [
      { label: t('bar_this'), value: c.cagr * 100, color: 'var(--c-this)', strong: true },
      { label: t('bar_mix'), value: c.mix_cagr * 100, color: 'var(--s-mix)' },
      { label: t('bar_tb'), value: g.tbill_cagr * 100, color: 'var(--c-bar-3)' },
      { label: t('bar_qqq'), value: g.spot_only.cagr * 100, color: 'var(--s-qqq)' },
    ],
    fmt: (v) => num(v) + '%',
  });
  const xs = g.axes.funding;
  const cells = xs.map((f) => cell(e.hedge, e.leverage, e.rebalance, f, e.maintenance));
  C.dotLine(document.getElementById('ex-fund'), {
    xs: xs.map((f) => f * 100),
    series: [
      { label: t('fund_leg_hedge'), color: 'var(--c-this)', values: cells.map((k) => k.cagr * 100) },
      { label: t('fund_leg_mix'), color: 'var(--s-mix)', dash: 'dash', values: cells.map((k) => k.mix_cagr * 100) },
    ],
    highlight: e.funding * 100, xFmt: (v) => signedNum(v, 0) + '%', yFmt: (v) => num(v) + '%', tipEl: document.getElementById('ex-fund-tip'),
    yTitle: t('ex_fund_y'), xTitle: t('ex_fund_x'),
  });
  document.getElementById('ex-fund-leg').innerHTML = `<li>${swatch('var(--c-this)')}${esc(t('fund_leg_hedge'))}</li><li>${swatch('var(--s-mix)', 'dash')}${esc(t('fund_leg_mix'))}</li>`;
}

/* ---------- growth ---------- */
function grBlock() { return S.gr.win === 'main' ? S.d.curves.main : S.d.curves.stress_1999_2010; }
function grIds() { return S.gr.win === 'main' ? MAIN_SERIES : STRESS_SERIES; }
function renderGrControls() {
  segmented(document.getElementById('gr-window'), [{ value: 'main', label: t('win_main') }, { value: 'stress', label: t('win_stress') }], S.gr.win, (v) => { S.gr.win = v; renderGrControls(); renderGrowth(); });
  const host = document.getElementById('gr-series');
  host.innerHTML = '';
  const sel = S.gr.sel[S.gr.win];
  for (const id of grIds()) {
    const [color, dash] = SERIES_STYLE[id];
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.style.setProperty('--chip-c', color);
    b.innerHTML = swatch(color, dash) + esc(sname(id));
    b.setAttribute('aria-pressed', sel.has(id) ? 'true' : 'false');
    b.addEventListener('click', () => {
      if (sel.has(id)) { if (sel.size === 1) { b.classList.add('shake'); document.getElementById('gr-msg').textContent = t('keep_one'); return; } sel.delete(id); } else sel.add(id);
      document.getElementById('gr-msg').textContent = '';
      renderGrControls(); renderGrowth();
    });
    host.appendChild(b);
  }
}
function vsMix(id, blk) {
  const s = blk.series[id];
  if (s.stats.vs_mix !== undefined) return s.stats.vs_mix;
  if (id === 'base') return s.stats.cagr - blk.series.mix_base.stats.cagr;
  if (id === 'recipe_a' || id === 'recipe_a_5') return s.stats.cagr - blk.series.mix_a.stats.cagr;
  if (id === 'third_2x_realistic') return rcCell(0.3333, 2, 0.025, 0.05, '2010-02..2026-10').vs_mix;
  return null;
}
function renderGrowth() {
  const blk = grBlock();
  const sel = S.gr.sel[S.gr.win];
  const ids = grIds().filter((id) => sel.has(id));
  const dates = blk.series.qqq.dates;
  const mk = (key) => ids.map((id) => ({ id, label: sshort(id), color: SERIES_STYLE[id][0], dash: SERIES_STYLE[id][1], textColor: SERIES_STYLE[id][2], values: blk.series[id][key] }));
  const growth = C.lineChart(document.getElementById('gr-growth'), { dates, series: mk('growth'), log: true, yFmt: (v) => '$' + (v < 1 ? v.toFixed(2) : v.toFixed(v < 10 ? 1 : 0)), endFmt: (v) => '$' + v.toFixed(2) });
  // no end labels on the drawdown chart: today's distance from the high adds little and the labels collided on phones
  const dd = C.lineChart(document.getElementById('gr-dd'), { dates, series: mk('drawdown'), yFmt: (v) => pct(v, 0), zeroTop: true, domain: [0, 0], endLabels: false, marginRight: 70 });
  const tip = document.getElementById('gr-tip');
  const coarse = C.coarsePointer();
  tip.classList.toggle('tooltip--dock', coarse);
  C.linkCursors([growth, dd], tip, (i) => {
    const rows = ids.map((id) => `<tr><th><span class="name">${swatch(SERIES_STYLE[id][0], SERIES_STYLE[id][1])}${esc(sshort(id))}</span></th><td>${money(blk.series[id].growth[i])}</td><td>${pct(blk.series[id].drawdown[i])}</td></tr>`).join('');
    return `<p class="tooltip__date">${esc(dLong(dates[i]))}</p><table><thead><tr><th></th><th>${esc(t('tip_value'))}</th><th>${esc(t('tip_dd'))}</th></tr></thead><tbody>${rows}</tbody></table>`;
  }, { dock: coarse });
  const head = [t('th_series'), t('th_cagr'), t('th_vol'), t('th_mdd'), t('th_wm'), t('th_sharpe'), t('th_liq'), t('th_final'), t('th_vs')];
  const short = narrow();
  const rows = ids.map((id) => {
    const st = blk.series[id].stats, vs = vsMix(id, blk);
    return `<tr><th scope="row"><span class="name">${swatch(SERIES_STYLE[id][0], SERIES_STYLE[id][1])}<span>${short ? esc(sshort(id)) : recipeName(sname(id))}</span></span></th><td>${pct(st.cagr)}</td><td>${pct(st.vol)}</td><td class="neg">${pct(st.max_dd)}</td><td>${pct(st.worst_month)}</td><td>${num(st.sharpe, 2)}</td><td>${st.liquidations_per_year === undefined ? t('dash') : liqTxt(st.liquidations_per_year)}</td><td>${money(st.final_value)}</td><td class="${cls(vs)}">${vs === null ? t('dash') : ptsTxt(vs)}</td></tr>`;
  });
  tableFill('gr-table', head, rows);
  document.getElementById('gr-note').innerHTML = tx(blk['note_' + S.lang]) + (S.gr.win === 'main' ? ' ' + t('gr_note_a') : '');
  renderStressTable();
  updateSwipeHints();
}
// DEEP_DIVE.md section 7, copied as printed there (display strings): the stress summary in table form.
const STRESS_ROWS = [
  ['st_base', '4.9%', '5.0%', '−6.4%', '+1.9', '5.4', '2.1'],
  ['st_3x', '6.2%', '', '', '+3.2', '1.7', ''],
  ['st_a5', '3.5%', '', '−41.6%', '', '', ''],
  ['st_f0', '1.9%', '', '', '−1.1', '', ''],
];
function renderStressTable() {
  tableFill('stress-table', [t('th_series'), t('th_cagr'), t('th_vol'), t('th_mdd'), t('th_vs_pts'), t('th_liq'), t('th_liqcost')],
    STRESS_ROWS.map((r) => `<tr><th scope="row">${esc(t(r[0]))}</th>${r.slice(1).map((v) => `<td>${v || t('dash')}</td>`).join('')}</tr>`));
}

/* ---------- funding ---------- */
const VENUE_ORDER = ['Gate', 'Binance', 'MEXC', 'Bitget', 'OKX', 'KuCoin', 'Aster'];
function venueName(v) { return zh() && v === 'Binance' ? '币安' : v; }
// The sources of DEEP_DIVE.md section 1, one line per venue, with the URL as the link (text in i18n: src_*).
const SOURCES = [
  ['src_csv', `${REPO}/blob/${STUDY_BRANCH}/reports/tqqq_short_hedge/deep_dive/funding/venues.csv`],
  ['src_gate', 'https://api.gateio.ws/api/v4/futures/usdt/risk_limit_tiers?contract=TQQQX_USDT'],
  ['src_kucoin', 'https://api-futures.kucoin.com/api/v1/contracts/risk-limit/TQQQUSDTM'],
  ['src_bitget', 'https://api.bitget.com/api/v2/mix/market/query-position-lever?symbol=TQQQUSDT&productType=USDT-FUTURES'],
  ['src_binance_api', 'https://www.binance.com/fapi/v1/exchangeInfo'],
  ['src_okx', 'https://www.okx.com/api/v5/public/instruments?instType=SWAP'],
  ['src_mexc', 'https://contract.mexc.com/api/v1/contract/detail'],
  ['src_bybit', 'https://announcements.bybit.com/en/article/new-listing-tqqqusdt-perpetual-contract-with-up-to-20x-leverage-bltddc1317d9d0c71c2/'],
  ['src_binance_square', 'https://www.binance.com/en/square/post/314524912786802'],
  ['src_binance_faq', null], // the study cites the FAQ by id only; the page behind the id sits behind a bot check, so no link
  ['src_bitget_mark', 'https://www.bitget.cloud/support/articles/12560603845668'],
  ['src_kucoin_clamp', 'https://www.kucoin.com/support/48142946141603'],
];
function renderFunding() {
  const V = S.d.venues, F = S.d.funding, L = S.lang;
  document.getElementById('venues-intro').innerHTML = md(V.intro[L]);
  const cols = ['venue', 'contract', 'listed', 'maintenance_max_leverage', 'funding_cap_8h', 'taker_fee', 'note'];
  const short = { maintenance_max_leverage: 'venue-maint', funding_cap_8h: 'venue-cap', taker_fee: 'venue-fee', note: 'venue-note', contract: 'venue-contract', listed: 'venue-listed' };
  tableFill('venues-table', cols.map((c) => esc(V.columns[L][c])), V.rows.map((r) => `<tr>${cols.map((c, i) => (i
    ? `<td class="${short[c]}${r[c][L] ? '' : ' is-empty'}" data-label="${esc(V.columns[L][c])}">${md(r[c][L])}</td>`
    : `<th scope="row">${md(r[c][L])}</th>`)).join('')}</tr>`));
  // the mechanics paragraph is a list in disguise: its lead, then one bullet per sentence (verbatim)
  document.getElementById('venues-paras').innerHTML = V.paragraphs[L].map((p, i) => {
    const h = md(p);
    const mm = i === 0 ? h.match(/^(<strong>[\s\S]*?<\/strong>)([\s\S]*)$/) : null;
    if (!mm) return `<p>${h}</p>`;
    return `<p>${mm[1]}</p><ul class="mech">${sentenceList(mm[2]).map((x) => `<li>${x}</li>`).join('')}</ul>`;
  }).join('');
  document.getElementById('venues-sources').innerHTML = SOURCES.map(([k, url]) =>
    `<li>${url ? esc(t(k)).replace('{a}', `<a href="${esc(url)}" rel="noopener">`).replace('{/a}', '</a>') : esc(t(k)).replace('{a}', '').replace('{/a}', '')}</li>`).join('');
  const fmt = (v) => num(v) + '%';
  const cw = F.headline.common_window;
  C.barsGrouped(document.getElementById('fu-venues'), {
    groups: VENUE_ORDER.map((v) => ({ label: venueName(v) })),
    series: [{ id: 'common', label: t('fu_leg_common', { start: cw.start, end: cw.end }), color: 'var(--c-bar)' }, { id: 'l30', label: t('fu_leg_30'), color: 'var(--c-bar-2)' }], // one hue, two lightnesses
    values: VENUE_ORDER.map((v) => [F.venues[v].ann_common_window_pct, F.venues[v].ann_last_30d_pct]),
    fmt, tipEl: document.getElementById('fu-venues-tip'), valueLabels: true,
  });
  document.getElementById('fu-venues-leg').innerHTML = `<li>${swatch('var(--c-bar)', 'box').replace('swatch', 'swatch swatch--box')}${esc(t('fu_leg_common', { start: cw.start, end: cw.end }))}</li><li>${swatch('var(--c-bar-2)').replace('swatch', 'swatch swatch--box')}${esc(t('fu_leg_30'))}</li>`;
  const months = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
  const mv = ['Binance', 'MEXC', 'Bitget', 'OKX', 'Gate', 'KuCoin'];
  const mcolors = ['var(--c-bar)', 'var(--v-1)', 'var(--v-2)', 'var(--v-3)', 'var(--v-4)', 'var(--v-5)']; // Binance in the accent, the rest greys (portfolio hues stay reserved)
  C.barsGrouped(document.getElementById('fu-months'), {
    groups: months.map((m) => ({ label: dMonth(m + '-01').replace(/ 2026|2026 年 /, '') })),
    series: mv.map((v, i) => ({ id: v, label: venueName(v), color: mcolors[i] })),
    values: months.map((m) => mv.map((v) => (F.venues[v].monthly_collected_pct[m] === undefined ? null : F.venues[v].monthly_collected_pct[m]))),
    fmt: (v) => num(v, 2) + '%', domain: [-0.2, 1.4], tipEl: document.getElementById('fu-months-tip'),
  });
  document.getElementById('fu-months-leg').innerHTML = mv.map((v, i) => `<li>${swatch(mcolors[i]).replace('swatch', 'swatch swatch--box')}${esc(venueName(v))}</li>`).join('');
  const by = F.btc_eth_by_year_ann_pct;
  const years = Object.keys(by.BTCUSDT);
  tableFill('btc-table', [t('th_year'), ...years], [
    `<tr><th scope="row">BTC</th>${years.map((y) => `<td>${fmt(by.BTCUSDT[y])}</td>`).join('')}</tr>`,
    `<tr><th scope="row">ETH</th>${years.map((y) => `<td>${fmt(by.ETHUSDT[y])}</td>`).join('')}</tr>`,
  ]);
}

/* ---------- decay ---------- */
function renderDecay() {
  const D = S.d.decay;
  const fmtP = (v) => num(v) + '%';
  const hl = { weekly: 'hold_weekly', monthly: 'hold_monthly', quarterly: 'hold_quarterly', yearly: 'hold_yearly' };
  C.stackedBars(document.getElementById('de-chart'), {
    groups: D.by_holding.map((h) => ({ label: t(hl[h.holding]), total: h.gap * 100, parts: [
      { id: 'cost', label: t('de_leg_cost'), value: h.cost * 100, color: 'var(--c-cost)' },
      { id: 'comp', label: t('de_leg_comp'), value: h.compounding * 100, color: 'var(--c-comp)' },
    ] })),
    fmt: fmtP, tipEl: document.getElementById('de-tip'), totalName: t('de_leg_gap'),
  });
  document.getElementById('de-leg').innerHTML = `<li>${swatch('var(--c-cost)').replace('swatch', 'swatch swatch--box')}${esc(t('de_leg_cost'))}</li><li>${swatch('var(--c-comp)').replace('swatch', 'swatch swatch--box')}${esc(t('de_leg_comp'))}</li><li><span class="swatch" style="color:var(--ink)"></span>${esc(t('de_leg_gap'))}</li>`;
  tableFill('de-hold', [t('th_holding'), t('th_periods_hold'), label('th_gap'), label('th_cost'), label('th_comp'), label('th_decay'), label('th_giveback'), label('th_beat'), label('th_comp_neg'), t('th_qvol')],
    D.by_holding.map((h) => `<tr><th scope="row">${esc(t(hl[h.holding]))}</th><td>${h.periods}</td><td>${pct(h.gap)}</td><td>${pct(h.cost)}</td><td class="${cls(h.compounding)}">${pct(h.compounding)}</td><td>${pct(h.decay)}</td><td>${pct(h.trend_give_back)}</td><td>${pct(h.share_short_beat_minus3x)}</td><td>${pct(h.share_compounding_negative)}</td><td>${pct(h.qqq_vol)}</td></tr>`));
  const dirLabel = (v) => (v === 'down' ? (zh() ? 'QQQ 下跌的月份' : 'Months QQQ fell') : (zh() ? 'QQQ 上涨的月份' : 'Months QQQ rose'));
  const cutRows = [];
  const grp = (title, rows, lab) => {
    cutRows.push(`<tr class="group"><th colspan="9">${esc(title)}</th></tr>`);
    for (const r of rows) cutRows.push(`<tr><th scope="row">${esc(lab(r.value))}</th><td>${r.periods}</td><td>${pct(r.gap)}</td><td>${pct(r.cost)}</td><td class="${cls(r.compounding)}">${pct(r.compounding)}</td><td>${pct(r.decay)}</td><td>${pct(r.trend_give_back)}</td><td>${pct(r.share_short_beat_minus3x)}</td><td>${pct(r.qqq_vol)}</td></tr>`);
  };
  grp(zh() ? '时期' : 'Era', D.by_era_monthly_reset, (v) => dashRange(v));
  grp(zh() ? '方向' : 'Direction', D.by_direction_monthly_reset, dirLabel);
  grp(zh() ? '月初 VIX' : 'VIX at the start of the month', D.by_vix_start_monthly_reset, (v) => dashRange(v.replace('>=', '≥ ').replace(/^</, '< ')));
  tableFill('de-cuts', [t('th_cut'), t('th_periods'), label('th_gap'), label('th_cost'), label('th_comp'), label('th_decay'), label('th_giveback'), label('th_beat'), t('th_qvol')], cutRows);
  const B = D.break_even_funding;
  const vars = ['third_5x', 'third_3x', 'third_2x', 'a_5x', 'a_3x', 'a_2x'];
  tableFill('be-table', [t('th_variant'), t('be_2010_2026'), t('be_2010_2019'), t('be_2020_2026')],
    vars.map((v) => `<tr><th scope="row">${esc(t('be_' + v))}</th><td>${pct(B['2010-2026'][v])}</td><td>${B['2010-2019'][v] === undefined ? t('dash') : pct(B['2010-2019'][v])}</td><td>${B['2020-2026'][v] === undefined ? t('dash') : pct(B['2020-2026'][v])}</td></tr>`));
  const r = B.by_year_range;
  document.getElementById('be-range').textContent = t('be_range', { min: pct(r.min.value), miny: r.min.year, max: signedNum(r.max.value * 100) + '%', maxy: r.max.year });
}

/* ---------- years and episodes ---------- */
function renderYears() {
  const Y = S.d.yearly, E = S.d.episodes;
  tableFill('yr-table', [t('th_year'), { html: esc(t('th_hedged')), cls: 'key' }, t('th_qqq'), t('th_tqqq'), t('th_spot_gain'), t('th_short_pnl'), t('th_funding'), t('th_fees'), t('th_interest'), t('th_liqs'), t('th_memo')],
    Y.rows.map((r) => `<tr><th scope="row">${r.year}</th><td class="key"><span class="heat-cell" ${heat(r.hedged_nav, 0.1)}>${pct(r.hedged_nav)}</span></td><td class="${cls(r.spot)}">${pct(r.spot)}</td><td class="${cls(r.tqqq)}">${pct(r.tqqq)}</td><td>${pct(r.spot_gain)}</td><td>${pct(r.short_price_pnl)}</td><td>${pct(r.funding)}</td><td>${pct(r.fees)}</td><td>${pct(r.interest)}</td><td>${r.liquidations}</td><td class="ref">${pct(r.margin_wiped_memo)}</td></tr>`));
  // Chinese episode names: no break inside "2020 年 2 月" (no-break spaces), a break allowed before the event word
  const epName = (e) => (zh() ? (E.episode_names_zh[e.episode] || e.episode).replace(/ /g, '\u00a0').replace(/([年月])(?=[^\s\d\u00a0])/g, '$1\u200b') : e.episode);
  const epTable = (id, list, colIds) => tableFill(id, [t('th_episode'), ...colIds.map((c) => esc(sshort(c)))],
    list.map((e) => `<tr><th scope="row">${esc(epName(e))}<span class="ep-dates">${e.from} → ${e.to}</span></th>${colIds.map((c) => `<td><span class="heat-cell" ${heat(e.returns[c], 0.5)}>${pct(e.returns[c])}</span></td>`).join('')}</tr>`));
  epTable('ep-main', E.main, EP_MAIN_COLS);
  epTable('ep-stress', E.stress_1999_2010, EP_STRESS_COLS);
}

/* ---------- recipes ---------- */
// DEEP_DIVE.md section 5, copied as printed there (display strings).
const RECIPES = [
  ['rc_recipe_a', '9.8%', '7.7%', '−11.2%', '−5.2%', '1.05', '0.12', '4.72', '2.7%', ['6.1% (to 2026-08) / 6.8% (to 2026-10)', '6.1%（到 2026-08）/ 6.8%（到 2026-10）']],
  ['rc_recipe_b', '7.7%', '5.2%', '−6.6%', '', '1.17', '0.12', '3.46', '3.1%', ['6.5% / 7.3%', '6.5% / 7.3%']],
  ['rc_recipe_c', '4.6%', '2.3%', '−2.3%', '−0.9%', '1.33', '0.7', '', '6.5%', ['10.3% / 11.3%', '10.3% / 11.3%']],
  ['rc_recipe_base', '4.0%', '2.4%', '−2.4%', '−1.3%', '1.01', '3.0', '1.93', '9.0%', ['10.3%', '10.3%']],
  ['rc_recipe_qqq', '19.3%', '20.6%', '−35.1%', '−13.6%', '0.89', '', '18.89', '', ['', '']],
];
/** "A (0.20, 2x, monthly) · maint. 1% · +10%": the recipe on the first line, the venue terms as a suffix line under it. */
function recipeName(s) { const [n, ...rest] = s.split(/\s*·\s*/); return esc(n) + (rest.length ? `<span class="suffix">${esc(rest.join(' · '))}</span>` : ''); }
function renderRecipes() {
  const re = document.getElementById('re-table');
  const reHead = ['th_recipe', 'th_cagr', 'th_vol', 'th_mdd', 'th_wm', 'th_sharpe', 'th_liq', 'th_final'];
  re.querySelector('thead').innerHTML = `<tr class="grp">${reHead.map((k) => `<th scope="col" rowspan="2" class="solo">${esc(t(k))}</th>`).join('')}<th scope="colgroup" colspan="2" class="sep">${esc(t('th_be_grp'))}</th></tr>` +
    `<tr><th scope="col" class="sep unit">${esc(t('th_be'))}</th><th scope="col" class="unit">${esc(t('th_last3'))}</th></tr>`;
  re.querySelector('tbody').innerHTML = RECIPES.map((r) => `<tr${r[0] === 'rc_recipe_qqq' ? ' class="ref"' : ''}><th scope="row">${recipeName(t(r[0]))}</th>${r.slice(1, 8).map((v, i) => `<td>${v ? (i === 6 ? '$' : '') + v : t('dash')}</td>`).join('')}<td class="sep">${r[8] || t('dash')}</td><td>${r[9][zh() ? 1 : 0] || t('dash')}</td></tr>`).join('');
  segmented(document.getElementById('rc-funding'), [0.05, 0.1].map((f) => ({ value: f, label: signedNum(f * 100, 0) + '%' })), S.rc.funding, (v) => { S.rc.funding = v; renderRecipes(); });
  const RC = S.d.grid.realistic_case;
  const wins = ['2010-02..2026-10', '2023-10..2026-10'];
  const rowsDef = [[0.3333, 2], [0.3333, 3], [0.2, 2], [0.2, 3], [0.3333, 5]];
  // four sub-columns per maintenance level, each with its unit in the header
  const tb = document.getElementById('rc-table');
  const units = [t('th_cagr'), t('th_vs_pts'), t('th_liq'), t('th_mdd')];
  tb.querySelector('thead').innerHTML = `<tr class="grp"><th scope="col" rowspan="2">${esc(t('th_variant'))}</th><th scope="colgroup" colspan="4" class="sep">${esc(t('th_maint', { m: '2.5%' }))}</th><th scope="colgroup" colspan="4" class="sep">${esc(t('th_maint', { m: '5%' }))}</th></tr>` +
    `<tr>${[0, 1].map(() => units.map((u, i) => `<th scope="col" class="unit${i === 0 ? ' sep' : ''}">${esc(u)}</th>`).join('')).join('')}</tr>`;
  const rows = [];
  for (const w of wins) {
    rows.push(`<tr class="group"><th colspan="9">${esc(t(w === wins[0] ? 'rc_win_long' : 'rc_win_short', { tb: pct(RC.windows[w].tbill_cagr, 2) }))}</th></tr>`);
    for (const [h, l] of rowsDef) {
      const lab = (l === 5 ? t('rc_row_ref') : (zh() ? `${HEDGE_LABEL[h]}，${l}\u00a0倍` : `${HEDGE_LABEL[h]}, ${l}x`)) + (h === 0.2 && l === 2 ? (zh() ? '' : ' ') + t('rc_row_a') : '');
      const cellsHtml = [0.025, 0.05].map((m) => {
        const c = rcCell(h, l, m, S.rc.funding, w);
        if (!c) return `<td class="sep">${t('dash')}</td><td>${t('dash')}</td><td>${t('dash')}</td><td>${t('dash')}</td>`;
        return `<td class="sep ${cls(c.cagr)}">${pct(c.cagr)}</td><td class="${cls(c.vs_mix)}">${signedNum(c.vs_mix * 100)}</td><td>${liqTxt(c.liquidations_per_year)}</td><td class="neg">${pct(c.max_dd)}</td>`;
      }).join('');
      rows.push(`<tr${l === 5 ? ' class="ref"' : ''}><th scope="row">${esc(lab)}</th>${cellsHtml}</tr>`);
    }
  }
  tb.querySelector('tbody').innerHTML = rows.join('');
  document.getElementById('rc-note').innerHTML = tx(RC['note_' + S.lang]);
  updateSwipeHints();
}

/* ---------- caveats ---------- */
function renderCaveats() {
  const m = S.d.meta, L = S.lang;
  document.getElementById('drawbacks').innerHTML = m.drawbacks[L].map((s, i) => `<li>${foldHtml(md(s), mdOf(esc(m.drawbacks.en[i])))}</li>`).join('');
  document.getElementById('ns-intro').innerHTML = tx(m.did_not_survive['intro_' + L]);
  document.getElementById('ns-list').innerHTML = m.did_not_survive[L].map((s) => `<li>${md(s)}</li>`).join('');
  // the audit material is folded behind one-line summaries; the drawbacks stay open
  document.getElementById('ns-sum').textContent = t('ns_sum', { n: m.did_not_survive[L].length });
  document.getElementById('pg-sum').textContent = t('pg_sum', { n: document.querySelectorAll('#pg-list > li').length });
  // "Where the two verifiers disagreed (…): whether A; whether B; …" is a list in disguise: the lead, then one item per dispute
  const dis = md(m.did_not_survive['disagreements_' + L]);
  const cut = scanTop(dis, 0, (c, n) => c === '：' || (c === ':' && n === ' '));
  document.getElementById('ns-dis').innerHTML = cut < 0 ? dis
    : `<p style="margin:0">${dis.slice(0, cut)}</p><ul>${splitTop(dis.slice(cut), (c, n) => c === '；' || (c === ';' && n === ' ')).map((x) => `<li>${x.replace(/^[;；]\s*/, '').replace(/[;；]\s*$/, '')}</li>`).join('')}</ul>`;
  document.getElementById('unknowns').innerHTML = m.still_unknown[L].map((s) => `<li>${md(s)}</li>`).join('');
}
/* ---------- sentence-aware text folding ----------
   scanTop walks an HTML string outside tags, parentheses and Chinese quotes and returns the index just after the first
   character for which test(char, next) holds, or -1. */
function scanTop(html, from, test) {
  let depth = 0;
  const tags = [];
  for (let i = from; i < html.length; i++) {
    const c = html[i];
    if (c === '<') {
      const j = html.indexOf('>', i);
      if (j < 0) return -1;
      const tag = html.slice(i + 1, j).trim();
      if (tag.startsWith('/')) tags.pop(); else if (!tag.endsWith('/')) tags.push(tag.split(/\s/)[0]);
      i = j;
      continue;
    }
    if (tags.length) continue;
    if (c === '&') { const j = html.indexOf(';', i); if (j > i && j - i < 10) { i = j; continue; } } // an entity such as &quot;
    if (c === '(' || c === '（' || c === '“') depth++;
    else if ((c === ')' || c === '）' || c === '”') && depth > 0) depth--;
    else if (depth === 0 && test(c, html[i + 1])) return i + 1;
  }
  return -1;
}
const isSentenceEnd = (c, n) => c === '。' || c === '；' || ((c === '.' || c === ';') && n === ' ');
/** The index just after the first sentence of html (-1 when it has no boundary). A boundary that follows fewer than
 *  15 characters of text (a ";" right after the bold lead) is skipped, so the kept part is always a real sentence. */
function sentenceEnd(html, from = 0) {
  let e = scanTop(html, from, isSentenceEnd);
  while (e >= 0 && html.slice(from, e).replace(/<[^>]+>/g, '').replace(/[\s;；:：,，.。]/g, '').length < 15) e = scanTop(html, e, isSentenceEnd);
  return e;
}
/** html split into top-level pieces at the separators test accepts. */
function splitTop(html, test) {
  const out = [];
  let i = 0;
  while (i < html.length) {
    const e = scanTop(html, i, test);
    if (e < 0) { out.push(html.slice(i)); break; }
    out.push(html.slice(i, e));
    i = e;
  }
  return out.map((x) => x.trim()).filter(Boolean);
}
/** One list item per sentence; a separating semicolon is dropped from the item's end. */
function sentenceList(html) { return splitTop(html, isSentenceEnd).map((x) => x.replace(/[;；]$/, '')); }
const LEAD_RE = /^(\s*<strong>[\s\S]*?<\/strong>)([\s\S]*)$/;
/** A long bullet keeps its bold lead and its first sentence; the rest folds into a disclosure. The decision is made on the
 *  English text (refHtml), so the same items fold in both languages; the split itself is made in the rendered language. */
function foldHtml(html, refHtml) {
  const m = html.match(LEAD_RE), r = (refHtml || html).match(LEAD_RE);
  if (!m || !r) return html;
  const rEnd = sentenceEnd(r[2]);
  if (rEnd < 0 || r[2].slice(rEnd).replace(/<[^>]+>/g, '').trim().length < 160) return html;
  const end = sentenceEnd(m[2]);
  if (end < 0) return html;
  const rest = m[2].slice(end).trim();
  if (!rest) return html;
  return `${m[1]}${closeLead(m[2].slice(0, end))} <details class="more"><summary>${esc(t('more_numbers'))}</summary><span>${rest}</span></details>`;
}
/** A visible lead that ends on a separator reads as cut off: end it as a sentence instead. */
function closeLead(h) { return h.replace(/；\s*$/, '。').replace(/;\s*$/, '.').replace(/[:：,，]\s*$/, (c) => (/[：，]/.test(c) ? '。' : '.')); }
/** Section 05's findings: only the bold lead stays in view when it is a sentence of its own; otherwise lead + first sentence. */
function foldLead(html) {
  const m = html.match(LEAD_RE);
  if (!m || !/[.。]\s*<\/strong>\s*$|[.。]<\/strong>/.test(m[1])) return null;
  const rest = m[2].trim();
  if (!rest) return null;
  return `${m[1]} <details class="more"><summary>${esc(t('more_numbers'))}</summary><span>${rest}</span></details>`;
}
/** Fold every long bullet of the .points--fold lists rendered from i18n keys (the drawbacks fold in renderCaveats). */
function foldPoints() {
  document.querySelectorAll('.points--fold > li[data-i18n-html]').forEach((li) => {
    if (li.querySelector('details')) return;
    const lead = li.parentElement.classList.contains('points--lead') ? foldLead(li.innerHTML) : null;
    const out = lead || foldHtml(li.innerHTML, STR.en[li.dataset.i18nHtml]);
    if (out !== li.innerHTML) li.innerHTML = out;
  });
}

/* ---------- static strings, language, theme ---------- */
function staticVars() {
  const m = S.d ? S.d.meta : null, g = S.d ? S.d.grid : null;
  return {
    start: m ? dLong(m.data_start) : '', end: m ? dLong(m.data_end) : '', days: m ? int(m.trading_days) : '', written: m ? dLong(m.written) : '',
    deep_dive: DEEP_DIVE_URL, deep_dive_local: DEEP_DIVE_LOCAL, generated: m ? m.generated : '', tb: g ? pct(g.tbill_cagr) : '',
  };
}
function applyStatic() {
  const root = document.documentElement;
  root.setAttribute('lang', zh() ? 'zh-Hans' : 'en');
  root.setAttribute('data-lang', S.lang);
  document.title = t('title');
  document.querySelector('meta[name="description"]').setAttribute('content', t('meta_desc'));
  const vars = staticVars();
  // a page-section reference (§01–§08) in a plain string becomes a link; everything else stays text
  document.querySelectorAll('[data-i18n]').forEach((n) => { const s = t(n.dataset.i18n, vars); if (s.includes('§0')) n.innerHTML = secLinks(esc(s)); else n.textContent = s; });
  document.querySelectorAll('[data-i18n-html]').forEach((n) => { n.innerHTML = secLinks(t(n.dataset.i18nHtml, vars)); });
  document.querySelectorAll('[data-i18n-aria]').forEach((n) => { n.setAttribute('aria-label', t(n.dataset.i18nAria)); });
  document.querySelectorAll('[data-i18n-rd]').forEach((n) => { n.setAttribute('aria-roledescription', t(n.dataset.i18nRd)); });
  document.querySelectorAll('[data-lang-btn]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.langBtn === S.lang ? 'true' : 'false'));
  document.querySelector('.brand').setAttribute('aria-label', t('brand'));
  document.getElementById('ex-lede').textContent = t('ex_lede', vars);
  updateThemeLabel();
}
function renderAll() {
  applyStatic();
  if (!S.d) return;
  renderHero(); renderDiagram();
  renderExControls(); renderExplorer();
  renderGrControls(); renderGrowth();
  renderFunding(); renderDecay(); renderYears(); renderRecipes(); renderCaveats();
  foldPoints();
  updateSwipeHints();
}
function setLang(l) {
  if (l === S.lang) return;
  S.lang = l; store('th-lang', l);
  stripPrev = null;
  renderAll();
}
function effectiveTheme() {
  const a = document.documentElement.getAttribute('data-theme');
  if (a) return a;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function updateThemeLabel() {
  document.getElementById('theme-btn').setAttribute('aria-label', t(effectiveTheme() === 'dark' ? 'theme_to_light' : 'theme_to_dark'));
}
function updateSwipeHints() {
  document.querySelectorAll('.table-wrap').forEach((w) => {
    const hint = w.nextElementSibling;
    if (!hint || !hint.classList.contains('swipe-hint')) return;
    if (w.scrollWidth > w.clientWidth + 4) hint.setAttribute('data-show', ''); else hint.removeAttribute('data-show');
  });
}
/** A link into a folded part of the page (a glossary term) opens the <details> that holds it. */
function openTarget(id) {
  const el = id && document.getElementById(id);
  if (!el) return null;
  for (let d = el.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) d.open = true;
  return el;
}
/** The masthead's real height (it wraps to two rows on phones): the explorer's sticky result strip sits right under it. */
function setMastHeight() {
  const h = document.querySelector('.masthead').offsetHeight;
  if (h) document.documentElement.style.setProperty('--mast-live', h + 'px');
}
function wireGlobal() {
  setMastHeight();
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest('a[href^="#gl-"]');
    if (!a) return;
    const el = openTarget(a.getAttribute('href').slice(1));
    if (el) { ev.preventDefault(); history.replaceState(null, '', a.getAttribute('href')); el.scrollIntoView({ block: 'start' }); }
  });
  document.querySelectorAll('[data-lang-btn]').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.langBtn)));
  document.getElementById('theme-btn').addEventListener('click', () => {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    const os = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    if (next === os) { document.documentElement.removeAttribute('data-theme'); try { localStorage.removeItem('th-theme'); } catch (e) { /* storage unavailable */ } }
    else { document.documentElement.setAttribute('data-theme', next); store('th-theme', next); }
    updateThemeLabel();
  });
  let tmr = 0;
  window.addEventListener('resize', () => { clearTimeout(tmr); tmr = setTimeout(() => { setMastHeight(); if (S.d) { renderDiagram(); renderExplorer(); renderGrowth(); renderFunding(); renderDecay(); updateSwipeHints(); } }, 160); });
  // the swipe hints depend on the web fonts' widths
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(updateSwipeHints);
  // scroll spy for the section nav
  const links = [...document.querySelectorAll('.sections a')];
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) links.forEach((a) => a.setAttribute('aria-current', a.getAttribute('href') === '#' + e.target.id ? 'true' : 'false'));
  }, { rootMargin: '-40% 0px -55% 0px' });
  document.querySelectorAll('main section[id]').forEach((s) => io.observe(s));
}

async function boot() {
  applyStatic();
  wireGlobal();
  const loading = document.getElementById('loading');
  try {
    const names = ['meta', 'grid', 'curves', 'yearly', 'episodes', 'funding', 'venues', 'decay'];
    const res = await Promise.all(names.map((n) => fetch(`data/${n}.json`).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })));
    S.d = Object.fromEntries(names.map((n, i) => [n, res[i]]));
  } catch (err) {
    loading.classList.add('error');
    loading.textContent = t('load_error');
    return;
  }
  for (const c of S.d.grid.cells) S.grid.set(cellKey(c), c);
  renderAll();
  loading.hidden = true;
  if (location.hash && location.hash.length > 1) {
    const target = openTarget(decodeURIComponent(location.hash.slice(1)));
    if (target) requestAnimationFrame(() => target.scrollIntoView({ behavior: 'instant', block: 'start' }));
  }
}
boot();
