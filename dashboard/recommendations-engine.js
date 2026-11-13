/* Evidence-proximity recommendation engine (Part 4 · Recommendations).
 *
 * Pure functions, shared by recommendations.html and recommendations.test.cjs.
 * Nothing here predicts performance: it ranks *measured* contrasts by how close
 * their tested context (platform, GPU count, parameter count) is to the reader's
 * workload, and abstains when the closest evidence is too far away.
 */
(function (root) {
  const SIZE_BANDS = {           // millions of parameters, [lo, hi)
    small: [0, 1000], '1b': [1000, 2000], '3b': [2000, 4000], '7b': [4000, 8000], large: [8000, Infinity],
  };
  const TIERS = ['direct', 'near', 'transfer', 'distant'];
  const NEAR_DECADES = 0.5;      // ≈3.2× parameter count
  const NEAR_DOUBLINGS = 1;      // one GPU-count doubling
  const MATERIAL = 3;            // % — same threshold the studies use for verdicts

  function sizeDistance(params, band) {
    const [lo, hi] = SIZE_BANDS[band];
    if (params >= lo && params < hi) return 0;
    return params < lo ? Math.log10(lo / params) : Math.log10(params / hi);
  }

  /** Where a piece of evidence sits relative to the reader's workload. */
  function proximity(ev, input) {
    const dSize = sizeDistance(ev.params, input.size);
    const dGpu = Math.abs(Math.log2(Number(input.gpus) / ev.gpus));
    const samePlatform = input.hardware !== 'other' && ev.platform === input.hardware;
    const close = dGpu <= NEAR_DOUBLINGS && dSize <= NEAR_DECADES;
    let tier = 'distant';
    if (samePlatform && dGpu === 0 && dSize === 0) tier = 'direct';
    else if (samePlatform && close) tier = 'near';
    else if (!samePlatform && close) tier = 'transfer';
    return { tier, rank: TIERS.indexOf(tier), dSize, dGpu, dist: dGpu + 2 * dSize, samePlatform };
  }

  const median = xs => {
    const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
    return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null;
  };

  function classify(counts) {
    const { helps: h, hurts: x, total: t } = counts;
    if (h > 0 && x === 0 && h >= t / 2) return 'try';
    if (x > 0 && h === 0 && x >= t / 2) return 'avoid';
    if (h === 0 && x === 0) {
      // "No measurable gain" needs evidence of a negligible effect (CI inside ±3%), not merely no evidence.
      return counts.no_material_effect > t / 2 ? 'skip' : 'unclear';
    }
    return 'mixed';
  }

  function memoryStatus(values) {
    if (!values.length) return null;
    if (values.every(v => v <= -MATERIAL)) return 'try';
    if (values.every(v => v >= MATERIAL)) return 'avoid';
    if (values.every(v => Math.abs(v) < MATERIAL)) return 'skip';
    return 'mixed';
  }

  /** Training: group contrasts into levers, keep each lever's closest evidence tier. */
  function rankLevers(input, data) {
    const byLever = new Map();
    for (const c of data.contrasts) {
      const p = proximity(c, input);
      const row = { ...c, prox: p };
      if (!byLever.has(c.lever)) byLever.set(c.lever, []);
      byLever.get(c.lever).push(row);
    }
    const levers = [];
    for (const [id, rows] of byLever) {
      rows.sort((a, b) => a.prox.rank - b.prox.rank || a.prox.dist - b.prox.dist || b.change - a.change);
      const best = rows[0].prox.rank;
      const nearest = rows.filter(r => r.prox.rank === best);
      const counts = { helps: 0, hurts: 0, no_material_effect: 0, inconclusive: 0, total: nearest.length };
      nearest.forEach(r => { counts[r.verdict] = (counts[r.verdict] || 0) + 1; });
      const changes = nearest.map(r => r.change);
      const mems = nearest.filter(r => r.memChange != null).map(r => r.memChange);
      const status = classify(counts);
      let memStatus = memoryStatus(mems);
      // Saving memory by giving up most of the throughput is a trade-off, not a recommendation.
      if (memStatus === 'try' && status === 'avoid') memStatus = 'tradeoff';
      levers.push({
        id, study: rows[0].study, control: rows[0].control, treatment: rows[0].treatment,
        tier: TIERS[best], tierRank: best, rows, nearest, counts,
        status, memStatus,
        median: median(changes), min: Math.min(...changes), max: Math.max(...changes),
        memMedian: median(mems),
      });
    }
    const order = { try: 0, mixed: 1, tradeoff: 1, unclear: 2, skip: 3, avoid: 4 };
    const key = input.priority === 'memory' ? 'memStatus' : 'status';
    levers.sort((a, b) =>
      (a.tierRank === 3) - (b.tierRank === 3) ||
      (a[key] == null) - (b[key] == null) ||
      order[a[key]] - order[b[key]] || a.tierRank - b.tierRank ||
      (key === 'memStatus' ? a.memMedian - b.memMedian : b.median - a.median));
    return levers;
  }

  const OBJECTIVES = {
    throughput: { key: 'tps', better: 'max', label: 'Output tokens/s (node)', unit: 'tok/s' },
    latency: { key: 'lat', better: 'min', label: 'End-to-end latency p95', unit: 'ms' },
    ttft: { key: 'ttft', better: 'min', label: 'Time to first token p95', unit: 'ms' },
    energy: { key: 'j', better: 'min', label: 'Energy per output token', unit: 'J' },
  };

  function bestBy(rows, obj) {
    const o = OBJECTIVES[obj];
    const s = [...rows].sort((a, b) => o.better === 'max' ? b[o.key] - a[o.key] : a[o.key] - b[o.key]);
    const [w, r] = s;
    const margin = r ? (o.better === 'max' ? w[o.key] / r[o.key] - 1 : 1 - w[o.key] / r[o.key]) * 100 : null;
    return { winner: w, runnerUp: r, margin, sorted: s };
  }

  /** Inference: pick the closest measured serving context, then rank its layouts. */
  function rankLayouts(input, data) {
    const groups = new Map();
    for (const l of data.layouts) {
      const k = `${l.study}|${l.platform}|${l.gpus}`;
      if (!groups.has(k)) groups.set(k, { study: l.study, model: l.model, params: l.params, platform: l.platform, gpus: l.gpus, rows: [] });
      groups.get(k).rows.push(l);
    }
    const ranked = [...groups.values()].map(g => ({ ...g, prox: proximity(g, input) }))
      .sort((a, b) => a.prox.rank - b.prox.rank || a.prox.dist - b.prox.dist);
    const g = ranked[0];
    const prompt = Number(input.prompt), conc = Number(input.concurrency);
    const shapes = [...new Set(g.rows.map(r => `${r.prompt}|${r.concurrency}`))].map(s => s.split('|').map(Number));
    shapes.sort((a, b) => (a[0] !== prompt) - (b[0] !== prompt) ||
      Math.abs(Math.log2(a[1] / conc)) - Math.abs(Math.log2(b[1] / conc)));
    const [sp, sc] = shapes[0];
    const rows = g.rows.filter(r => r.prompt === sp && r.concurrency === sc);
    const objectives = {};
    for (const o of Object.keys(OBJECTIVES)) objectives[o] = bestBy(rows, o);
    return {
      context: g, alternatives: ranked.slice(1).filter(x => x.prox.rank < 3),
      shape: { prompt: sp, concurrency: sc, exact: sp === prompt && sc === conc }, rows, objectives,
    };
  }

  function lowbit(input, data) {
    if (!data.lowbit.length) return null;
    const prox = proximity(data.lowbit[0], input);
    return { prox, rows: data.lowbit };
  }

  /** Evidence counts per (platform, workload, gpus) for the coverage map. */
  function coverage(data, mode) {
    const cells = new Map();
    const src = mode === 'training' ? data.contrasts : data.layouts;
    for (const r of src) {
      const model = r.workload || r.model;
      const k = `${r.platform}|${model}|${r.gpus}`;
      if (!cells.has(k)) cells.set(k, { platform: r.platform, model, params: r.params, gpus: r.gpus, n: 0 });
      cells.get(k).n++;
    }
    return [...cells.values()];
  }

  const api = { SIZE_BANDS, TIERS, OBJECTIVES, MATERIAL, sizeDistance, proximity, rankLevers, rankLayouts, lowbit, coverage, median };
  if (typeof module !== 'undefined') module.exports = api;
  else root.RecoEngine = api;
})(this);
