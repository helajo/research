// Pure calculations, a line-by-line port of meta.method (portfolio_lab.mix.fixed_mix,
// portfolio_lab.drawdowns.scorecard / falls, mix.same_pain_edge, model_portfolios.same_share).
// No DOM access: this module is also imported by Node to check the Python reference values.

export const DAYS = 252;
export const COST_BPS = 5;

/** Index the shipped JSON once: dense Float64Arrays (NaN before a block's first day). */
export function prepare(data) {
  const dates = data.dates;
  const n = dates.length;
  const blocks = {};
  for (const [id, b] of Object.entries(data.blocks)) {
    const a = new Float64Array(n).fill(NaN);
    for (let k = 0; k < b.r.length; k++) a[b.first + k] = b.r[k];
    blocks[id] = { r: a, first: b.first };
  }
  const fx = new Float64Array(n).fill(NaN);
  for (let k = 0; k < data.fx.r.length; k++) fx[data.fx.first + k] = data.fx.r[k];
  const month = new Int32Array(n);
  for (let i = 0; i < n; i++) month[i] = +dates[i].slice(0, 4) * 12 + (+dates[i].slice(5, 7) - 1);
  const monthEnd = new Uint8Array(n);
  for (let i = 0; i < n; i++) monthEnd[i] = (i === n - 1 || month[i + 1] !== month[i]) ? 1 : 0;
  const index = new Map(dates.map((d, i) => [d, i]));
  return { dates, n, blocks, fx, month, monthEnd, index, cache: new Map() };
}

/** Bounded cache: drop the oldest mixes and yardsticks (never the block arrays). */
function remember(ctx, key, val) {
  ctx.cache.set(key, val);
  if (ctx.cache.size > 260) {
    for (const k of ctx.cache.keys()) {
      if (ctx.cache.size <= 180) break;
      if (k.startsWith('m|') || k.startsWith('pl|')) ctx.cache.delete(k);
    }
  }
}

/** First index on or after an ISO date. */
export function idxOnOrAfter(ctx, iso) {
  const d = ctx.dates;
  let lo = 0, hi = d.length - 1;
  if (iso <= d[0]) return 0;
  if (iso > d[hi]) return hi;
  while (lo < hi) { const m = (lo + hi) >> 1; if (d[m] < iso) lo = m + 1; else hi = m; }
  return lo;
}

/** SGD return = (1 + USD return) x (1 + fx) - 1. */
export function toCcy(ctx, r, ccy) {
  if (ccy !== 'SGD') return r;
  const out = new Float64Array(r.length);
  const fx = ctx.fx;
  for (let i = 0; i < r.length; i++) out[i] = (1 + r[i]) * (1 + fx[i]) - 1;
  return out;
}

export function blockReturns(ctx, id, ccy = 'USD') {
  const key = `b|${id}|${ccy}`;
  if (!ctx.cache.has(key)) ctx.cache.set(key, toCcy(ctx, ctx.blocks[id].r, ccy));
  return ctx.cache.get(key);
}

/** First day every chosen block has a return (never before the data start). */
export function mixStart(ctx, weights) {
  let s = 0;
  for (const id of Object.keys(weights)) if (weights[id] > 0) s = Math.max(s, ctx.blocks[id].first);
  return s;
}

/**
 * fixed_mix: held = target on the start day; drift daily; at each month end charge
 * turnover x cost_bps x (1 + ret) and reset to target. Returns a length-n array (NaN before start).
 * Weights of 0 are dropped (they never trade). A single block at 100% is the block itself.
 */
export function mixReturns(ctx, weights, ccy = 'USD', costBps = COST_BPS) {
  const ids = Object.keys(weights).filter((k) => weights[k] > 0);
  const key = `m|${ids.map((k) => k + ':' + weights[k]).join(',')}|${ccy}|${costBps}`;
  if (ctx.cache.has(key)) return ctx.cache.get(key);
  const n = ctx.n;
  const out = new Float64Array(n).fill(NaN);
  const start = mixStart(ctx, weights);
  if (ids.length === 1) {
    const r = ctx.blocks[ids[0]].r;
    for (let i = start; i < n; i++) out[i] = r[i];
  } else {
    const m = ids.length;
    const target = ids.map((k) => weights[k]);
    const rs = ids.map((k) => ctx.blocks[k].r);
    const held = target.slice();
    const grown = new Array(m);
    const c = costBps / 1e4;
    for (let i = start; i < n; i++) {
      let nav = 0;
      for (let j = 0; j < m; j++) {
        const x = rs[j][i];
        grown[j] = held[j] * (1 + (Number.isNaN(x) ? 0 : x));
        nav += grown[j];
      }
      let ret = nav - 1;
      for (let j = 0; j < m; j++) held[j] = grown[j] / nav;
      if (ctx.monthEnd[i]) {
        let turn = 0;
        for (let j = 0; j < m; j++) turn += Math.abs(held[j] - target[j]);
        ret -= turn * c * (1 + ret);
        for (let j = 0; j < m; j++) held[j] = target[j];
      }
      out[i] = ret;
    }
  }
  const res = ccy === 'SGD' ? toCcy(ctx, out, 'SGD') : out;
  remember(ctx, key, res);
  return res;
}

/** Growth of 1 and drawdown over [a, b] inclusive (running max starts at 1). */
export function curves(r, a, b) {
  const len = b - a + 1;
  const growth = new Float64Array(len);
  const dd = new Float64Array(len);
  let g = 1, peak = 1;
  for (let k = 0; k < len; k++) {
    g *= 1 + r[a + k];
    growth[k] = g;
    if (g > peak) peak = g;
    dd[k] = g / peak - 1;
  }
  return { growth, dd };
}

/** portfolio_lab.drawdowns.falls (threshold 0.10) on a drawdown array; returns [{peak, low, rec, depth}] as offsets. */
export function fallsFromDD(dd, threshold = 0.10) {
  const out = [];
  let peak = 0, lowAt = -1, low = 0;
  for (let k = 0; k < dd.length; k++) {
    const x = dd[k];
    if (x >= 0) {
      if (low <= -threshold) out.push({ peak, low: lowAt, rec: k, depth: low });
      peak = k; lowAt = -1; low = 0;
    } else if (x < low) { lowAt = k; low = x; }
  }
  if (low <= -threshold) out.push({ peak, low: lowAt, rec: null, depth: low });
  return out;
}

/** portfolio_lab.drawdowns.scorecard on days [a, b] inclusive. */
export function scorecard(ctx, r, a, b) {
  const n = b - a + 1;
  const { dd, growth } = curves(r, a, b);
  const total = growth[n - 1];
  const cagr = Math.pow(total, DAYS / n) - 1;
  let mean = 0;
  for (let i = a; i <= b; i++) mean += r[i];
  mean /= n;
  let v = 0;
  for (let i = a; i <= b; i++) v += (r[i] - mean) ** 2;
  const vol = Math.sqrt(v / (n - 1)) * Math.sqrt(DAYS);
  let mdd = 0, sq = 0, run = 0, longest = 0;
  for (let k = 0; k < n; k++) {
    const x = dd[k];
    if (x < mdd) mdd = x;
    sq += x * x;
    if (x < 0) { run++; if (run > longest) longest = run; } else run = 0;
  }
  let wm = Infinity, mp = 1, cur = ctx.month[a];
  for (let i = a; i <= b; i++) {
    if (ctx.month[i] !== cur) { wm = Math.min(wm, mp - 1); mp = 1; cur = ctx.month[i]; }
    mp *= 1 + r[i];
  }
  wm = Math.min(wm, mp - 1);
  return {
    cagr, vol, mdd, wm,
    f10: fallsFromDD(dd, 0.10).length,
    luw: longest / 21,
    ulcer: Math.sqrt(sq / n),
  };
}

/** numpy.interp for increasing xp. left/right default to the end values. */
export function interp(x, xp, fp, left, right) {
  const L = left === undefined ? fp[0] : left;
  const R = right === undefined ? fp[fp.length - 1] : right;
  if (Number.isNaN(x)) return NaN;
  if (x < xp[0]) return L;
  if (x > xp[xp.length - 1]) return R;
  if (x === xp[xp.length - 1]) return fp[fp.length - 1];
  let j = 0;
  while (j < xp.length - 1 && !(x >= xp[j] && x < xp[j + 1])) j++;
  const dx = xp[j + 1] - xp[j];
  return dx === 0 ? fp[j] : fp[j] + (x - xp[j]) * (fp[j + 1] - fp[j]) / dx;
}

/** Daily-rebalanced risky + safe mixes; points sorted by (ulcer, cagr). */
export function painLine(ctx, risky, safe, a, b, step = 0.05) {
  const key = `pl|${a}|${b}|${step}|${risky.__id || ''}|${safe.__id || ''}`;
  if (risky.__id && safe.__id && ctx.cache.has(key)) return ctx.cache.get(key);
  const steps = Math.round(1 / step);
  const pts = [];
  const tmp = new Float64Array(ctx.n);
  for (let s = 0; s <= steps; s++) {
    const w = s / steps;
    for (let i = a; i <= b; i++) tmp[i] = w * risky[i] + (1 - w) * safe[i];
    const sc = scorecard(ctx, tmp, a, b);
    pts.push({ w, ulcer: sc.ulcer, cagr: sc.cagr });
  }
  const sorted = pts.slice().sort((p, q) => (p.ulcer - q.ulcer) || (p.cagr - q.cagr));
  const res = { pts, sorted };
  if (risky.__id && safe.__id) remember(ctx, key, res);
  return res;
}

function tagged(ctx, id, ccy) {
  const r = blockReturns(ctx, id, ccy);
  if (!r.__id) r.__id = `${id}:${ccy}`;
  return r;
}

/**
 * Same-pain yardsticks for a window.
 * USD: SPY + T-bills (edge, spy_share).  SGD: SPY in SGD + T-bill-rate cash with no currency move
 * (edge_sgd_proxy), as the strategist's "SGD edge".
 */
export function yardstick(ctx, ccy, a, b) {
  const spy = tagged(ctx, 'SPY', ccy);
  const cash = tagged(ctx, 'CASH', 'USD');
  const line = painLine(ctx, spy, cash, a, b, 0.05);
  return line;
}

export function edgeFor(ctx, sc, ccy, a, b) {
  const line = yardstick(ctx, ccy, a, b);
  const xp = line.sorted.map((p) => p.ulcer);
  const fp = line.sorted.map((p) => p.cagr);
  const same = interp(sc.ulcer, xp, fp, undefined, NaN);
  return Number.isNaN(same) ? null : sc.cagr - same;
}

export function spyShareFor(ctx, sc, a, b) {
  const spy = tagged(ctx, 'SPY', 'USD');
  const cash = tagged(ctx, 'CASH', 'USD');
  const fine = painLine(ctx, spy, cash, a, b, 0.01);
  const share = interp(sc.ulcer, fine.pts.map((p) => p.ulcer), fine.pts.map((p) => p.w), undefined, NaN);
  return Number.isNaN(share) ? null : share;
}

/** Full metrics for a return array on [a, b], including the same-pain edge in the chosen currency. */
export function metrics(ctx, r, a, b, ccy) {
  const sc = scorecard(ctx, r, a, b);
  sc.edge = edgeFor(ctx, sc, ccy, a, b);
  return sc;
}

/** portfolio_lab.drawdowns.return_over: prod(1 + r) over days after peak up to and including low. */
export function returnOver(ctx, r, peakIdx, lowIdx) {
  if (Number.isNaN(r[peakIdx])) {
    // covered only if the series has data on the peak day (its first return may be the peak day itself)
    return null;
  }
  let p = 1;
  for (let i = peakIdx + 1; i <= lowIdx; i++) {
    if (Number.isNaN(r[i])) return null;
    p *= 1 + r[i];
  }
  return p - 1;
}

/**
 * Decimation for drawing. 'minmax' keeps the low and the high of every bucket (about buckets x 2 points);
 * 'min' keeps only the low (a drawdown's story is its lower envelope). Returns offsets.
 */
export function decimate(arr, buckets, mode = 'minmax') {
  const n = arr.length;
  if (n <= buckets * (mode === 'min' ? 1 : 2)) return Array.from({ length: n }, (_, i) => i);
  const out = [0];
  const size = n / buckets;
  for (let b = 0; b < buckets; b++) {
    const s = Math.floor(b * size), e = Math.min(n, Math.floor((b + 1) * size));
    let mi = s, ma = s;
    for (let i = s; i < e; i++) { if (arr[i] < arr[mi]) mi = i; if (arr[i] > arr[ma]) ma = i; }
    if (mode === 'min') out.push(mi);
    else if (mi < ma) { out.push(mi, ma); } else if (ma < mi) { out.push(ma, mi); } else out.push(mi);
  }
  out.push(n - 1);
  return [...new Set(out)].sort((x, y) => x - y);
}
