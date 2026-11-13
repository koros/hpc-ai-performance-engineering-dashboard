/* Part 2 · "Real text: padding and packing" — renders from RECO_DATA.realText (S7 condition
 * rows, cohort-refreshed intervals) and the S7 contrasts (all_controlled_effects.csv), the same
 * evidence Part 3 shows and Part 4 ranks.
 */
(function () {
  const root = document.getElementById('realText');
  if (!root || typeof RECO_DATA === 'undefined' || !RECO_DATA.realText) return;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v, d = 0) => Number(v).toLocaleString('en-GB', { maximumFractionDigits: d, minimumFractionDigits: d });
  const MODES = ['pad to max', 'dynamic padding', 'length-bucketed padding', 'packing'];
  const MODE_LABEL = { 'pad to max': 'Pad to max (1,024)', 'dynamic padding': 'Dynamic padding', 'length-bucketed padding': 'Length-bucketed', 'packing': 'Packing' };
  const rows = RECO_DATA.realText;
  const contrasts = RECO_DATA.contrasts.filter(c => c.study === 's7-real-text');
  const models = [...new Set(rows.map(r => r.workload))];
  let model = models[0], gpus = 8;

  /* ---------- diagram: one batch of four paragraphs under each mode ---------- */
  function diagram() {
    const lens = [3, 7, 2, 5], W = 8;               // tokens per paragraph, window 8 (illustrative)
    const row = (cells) => `<span class="rt-seq">${cells.map(c => `<i class="${c}"></i>`).join('')}</span>`;
    const padRow = (n, to) => row([...Array(n).fill('tok'), ...Array(to - n).fill('pad')]);
    const modes = [
      ['Pad to max', 'Every sequence padded to the full window.', lens.map(n => padRow(n, W)).join('')],
      ['Dynamic padding', 'Padded only to the longest in its batch.', lens.map(n => padRow(n, Math.max(...lens))).join('')],
      ['Length-bucketed', 'Similar lengths batched together, then padded.', `<span class="rt-batch">${[2, 3].map(n => padRow(n, 3)).join('')}</span><span class="rt-batch">${[5, 7].map(n => padRow(n, 7)).join('')}</span>`],
      ['Packing', 'Paragraphs joined end to end into full windows.', (() => {
        const docs = lens.flatMap((n, d) => Array(n).fill(`tok d${d % 2}`));
        const out = []; for (let i = 0; i < docs.length; i += W) out.push(row(docs.slice(i, i + W)));
        return out.join('');
      })()],
    ];
    return `<div class="rt-diagram" role="img" aria-label="Four ways to batch four paragraphs of 3, 7, 2 and 5 tokens">${modes.map(([t, d, body]) =>
      `<div class="rt-mode"><p class="rt-mode-t">${t}</p><div class="rt-seqs">${body}</div><p class="rt-mode-d">${d}</p></div>`).join('')}</div>
      <p class="rt-key"><i class="tok"></i> real token <i class="pad"></i> padding · illustrative: four paragraphs of 3, 7, 2 and 5 tokens, window of 8.</p>`;
  }

  /* ---------- measured comparison for one model and GPU count ---------- */
  function chart() {
    const sel = rows.filter(r => r.workload === model && r.gpus === gpus);
    const max = Math.max(...sel.map(r => r.hi));
    const base = sel.find(r => r.mode === 'pad to max');
    const bars = MODES.map(m => {
      const r = sel.find(x => x.mode === m); if (!r) return '';
      const c = contrasts.find(x => x.workload === model && x.gpus === gpus && x.treatment === m);
      const mult = c ? `${fmt(1 + c.change / 100, 2)}× <span class="rt-ci">(95% CI ${1 + c.lo / 100 < 0 ? 'below 0 to ' : fmt(1 + c.lo / 100, 2) + '–'}${fmt(1 + c.hi / 100, 2)}${c.verdict === 'inconclusive' ? ', inconclusive' : ''})</span>` : 'baseline';
      const strag = r.imb > 1.2 ? `<span class="rt-strag" title="Rank token imbalance: busiest GPU's tokens ÷ mean, averaged over steps">busiest GPU ${fmt(r.imb, 2)}× mean</span>` : '';
      return `<div class="rt-row${m === 'packing' ? ' best' : ''}">
        <span class="rt-lbl">${MODE_LABEL[m]}</span>
        <span class="rt-track"><span class="rt-bar" style="width:${(100 * r.tps / max).toFixed(1)}%"></span><span class="rt-whisk" style="left:${(100 * r.lo / max).toFixed(1)}%;width:${Math.max(0.4, 100 * (r.hi - r.lo) / max).toFixed(1)}%"></span></span>
        <span class="rt-val">${fmt(r.tps)} <small>useful tok/s</small></span>
        <span class="rt-mult">${mult}</span>
        <span class="rt-padbar" title="Share of processed tokens that were padding"><span style="width:${(100 * r.pad).toFixed(1)}%"></span></span>
        <span class="rt-padval">${fmt(100 * r.pad)}% padding ${strag}</span>
        <span class="rt-src">${window.XL ? XL.diagLinkHtml(r.id, 'l40s', { text: r.id, noFlags: true }) : esc(r.id)}</span>
      </div>`;
    }).join('');
    const caveat = model.startsWith('TinyLlama') && gpus === 2
      ? `<p class="rt-warn">TinyLlama at 2 GPUs is slower than at 1 GPU in two of four modes, the same 2-GPU L40S anomaly first seen in E291; do not read these 2-GPU numbers as a scaling trend.</p>` : '';
    return `${caveat}<div class="rt-chart" aria-label="Useful tokens per second by batching mode, ${esc(model)}, ${gpus} L40S GPUs">${bars}</div>
      <p class="rt-foot">Bars: mean useful (non-padding) tokens/s over ${base ? base.n : 3} trials, whiskers 95% CI. Multiples are against padding to 1,024 tokens on the same GPUs. Grey bars: share of processed tokens that were padding.</p>`;
  }

  function controls() {
    return `<div class="rt-controls"><div class="seg-rt" role="radiogroup" aria-label="Model">${models.map(m =>
      `<button type="button" role="radio" aria-checked="${m === model}" data-model="${esc(m)}">${esc(m)}</button>`).join('')}</div>
      <div class="seg-rt" role="radiogroup" aria-label="GPUs">${[1, 2, 4, 8].map(g =>
      `<button type="button" role="radio" aria-checked="${g === gpus}" data-gpus="${g}">${g} GPU${g > 1 ? 's' : ''}</button>`).join('')}</div></div>`;
  }

  function render() {
    root.querySelector('#rtCompare').innerHTML = controls() + chart();
    root.querySelectorAll('[data-model]').forEach(b => b.addEventListener('click', () => { model = b.dataset.model; render(); }));
    root.querySelectorAll('[data-gpus]').forEach(b => b.addEventListener('click', () => { gpus = Number(b.dataset.gpus); render(); }));
  }

  root.querySelector('#rtDiagram').innerHTML = diagram();
  render();
})();
