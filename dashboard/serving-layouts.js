/* Part 2 · "Serving across several chips" — renders from RECO_DATA.layouts (the same
 * checksum-traced layout rows Part 4 ranks), so the narrative numbers cannot drift from them.
 */
(function () {
  const root = document.getElementById('servingLayouts');
  if (!root || typeof RECO_DATA === 'undefined') return;
  const XLs = window.XL;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v, d = 0) => Number(v).toLocaleString('en-GB', { maximumFractionDigits: d, minimumFractionDigits: d });
  const TIE = 3; // % — differences smaller than this are shown as ties (means of 3 trials, no CI here)

  const OBJ = [
    { k: 'tps', t: 'Throughput', unit: 'tok/s', hi: true, d: 0, note: 'output tokens per second, whole node' },
    { k: 'ttft', t: 'First token', unit: 'ms', hi: false, d: 1, note: 'p95 time to first token' },
    { k: 'tpot', t: 'Time per token', unit: 'ms', hi: false, d: 1, note: 'p95 time per output token' },
    { k: 'lat', t: 'Request latency', unit: 'ms', hi: false, d: 0, note: 'p95 end-to-end', detailOnly: true },
    { k: 'j', t: 'Energy per token', unit: 'J', hi: false, d: 2, note: 'all allocated GPUs, measured region' },
  ];
  const short = l => l.layout.replace(' replicas', '').replace(', single engine', '').replace(' × ', '×');
  const tpClass = l => `tp${l.tp}`;
  const plat = p => p === 'h100' ? 'H100' : 'L40S';

  // group rows: model+platform -> load -> layouts
  const groups = [];
  for (const l of RECO_DATA.layouts) {
    let g = groups.find(x => x.model === l.model && x.platform === l.platform);
    if (!g) groups.push(g = { model: l.model, platform: l.platform, gpus: l.gpus, loads: [] });
    let ld = g.loads.find(x => x.prompt === l.prompt && x.concurrency === l.concurrency);
    if (!ld) g.loads.push(ld = { prompt: l.prompt, concurrency: l.concurrency, rows: [] });
    ld.rows.push(l);
  }
  groups.sort((a, b) => a.model.localeCompare(b.model) * -1 || a.platform.localeCompare(b.platform));
  for (const g of groups) {
    g.loads.sort((a, b) => a.prompt - b.prompt || a.concurrency - b.concurrency);
    for (const ld of g.loads) {
      ld.rows.sort((a, b) => a.tp - b.tp);
      ld.key = `${g.model}|${g.platform}|${ld.prompt}|${ld.concurrency}`;
      ld.label = `prompt ${fmt(ld.prompt)} · ${ld.concurrency} concurrent`;
      ld.best = {};
      for (const o of OBJ) {
        const s = [...ld.rows].sort((a, b) => o.hi ? b[o.k] - a[o.k] : a[o.k] - b[o.k]);
        const margin = s[1] ? (o.hi ? s[0][o.k] / s[1][o.k] - 1 : 1 - s[0][o.k] / s[1][o.k]) * 100 : null;
        ld.best[o.k] = { win: s[0], next: s[1], margin, tie: margin != null && margin < TIE };
      }
    }
  }

  /* ---------- explainer: what a layout is ---------- */
  function diagram() {
    const rows = [[1, 8], [2, 4], [4, 2], [8, 1]].map(([tp, reps]) => {
      const groupsHtml = Array.from({ length: reps }, () =>
        `<span class="sl-rep tp${tp}">${'<i></i>'.repeat(tp)}</span>`).join('');
      return `<div class="sl-diag-row"><span class="sl-diag-lbl">${tp === 8 ? 'TP8, one engine' : `TP${tp} × ${reps} replicas`}</span><span class="sl-diag-gpus">${groupsHtml}</span></div>`;
    }).join('');
    return `<figure class="sl-diagram" aria-label="Four ways to split eight GPUs">${rows}
      <figcaption>Eight GPUs, four splits. Each square is a GPU; each outlined group is one copy of the model. TP = tensor parallel: how many GPUs one copy is sharded across.</figcaption></figure>`;
  }

  /* ---------- per-model answer cards (computed) ---------- */
  function answers() {
    return groups.map(g => {
      const lines = OBJ.filter(o => !o.detailOnly).map(o => {
        const by = new Map(); let ties = 0;
        for (const ld of g.loads) {
          const b = ld.best[o.k];
          if (b.tie) { ties++; continue; }
          const k = short(b.win);
          if (!by.has(k)) by.set(k, { l: b.win, loads: [], m: [] });
          by.get(k).loads.push(ld); by.get(k).m.push(b.margin);
        }
        const parts = [...by.values()].sort((a, b) => b.loads.length - a.loads.length).map(x => {
          const all = x.loads.length === g.loads.length;
          const where = all ? 'every load' : x.loads.map(ld => `p${ld.prompt}·c${ld.concurrency}`).join(', ');
          const lo = Math.min(...x.m), hi = Math.max(...x.m);
          return `<span class="sl-chip ${tpClass(x.l)}"><i></i>${esc(short(x.l))}</span> ${esc(where)} <span class="sl-m">(${lo === hi ? `+${lo.toFixed(0)}%` : `+${lo.toFixed(0)}–${hi.toFixed(0)}%`})</span>`;
        });
        if (ties) parts.push(`<span class="sl-m">tie at ${ties} load${ties > 1 ? 's' : ''}</span>`);
        return `<li><b>${o.t}:</b> ${parts.join('; ')}</li>`;
      }).join('');
      return `<article class="sl-card"><p class="sl-card-k">${esc(g.model)} · ${g.gpus} × ${plat(g.platform)} · ${g.loads.length} loads</p><ul>${lines}</ul></article>`;
    }).join('');
  }

  /* ---------- winner matrix ---------- */
  let selected = null;
  function matrix() {
    const cols = OBJ.filter(o => !o.detailOnly);
    const head = `<tr><th scope="col">Load</th>${cols.map(o => `<th scope="col">${o.t}<span>${o.hi ? 'higher' : 'lower'} is better</span></th>`).join('')}</tr>`;
    const body = groups.map(g => `<tr class="sl-grp"><th colspan="${cols.length + 1}" scope="rowgroup">${esc(g.model)} · ${g.gpus} × ${plat(g.platform)}</th></tr>` +
      g.loads.map(ld => `<tr class="sl-row${selected === ld.key ? ' sel' : ''}" data-key="${esc(ld.key)}" tabindex="0" aria-selected="${selected === ld.key}">
        <th scope="row">${esc(ld.label)}</th>${cols.map(o => {
          const b = ld.best[o.k];
          if (b.tie) return `<td><span class="sl-chip ${tpClass(b.win)}"><i></i>${esc(short(b.win))}</span> ≈ <span class="sl-chip ${tpClass(b.next)}"><i></i>${esc(short(b.next))}</span> <span class="sl-m">tie</span></td>`;
          return `<td><span class="sl-chip ${tpClass(b.win)}"><i></i>${esc(short(b.win))}</span> <span class="sl-m">+${b.margin.toFixed(0)}%</span></td>`;
        }).join('')}</tr>`).join('')).join('');
    return `<p class="sl-cap">Best layout per load and objective, with its lead over the runner-up (leads under ${TIE}% shown as ties). Select a row for the full comparison.</p><div class="table-wrap"><table class="sl-matrix" aria-label="Best serving layout per load and objective"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  }

  /* ---------- detail for one load ---------- */
  function detail() {
    const g = groups.find(x => selected.startsWith(`${x.model}|${x.platform}|`));
    const ld = g.loads.find(x => x.key === selected);
    const charts = OBJ.map(o => {
      const max = Math.max(...ld.rows.map(r => r[o.k]));
      const b = ld.best[o.k];
      const bars = ld.rows.map(r => {
        const w = r === b.win;
        return `<div class="sl-bar-row${w ? ' win' : ''}"><span class="sl-bar-lbl">${esc(short(r))}</span>
          <span class="sl-bar-track"><span class="sl-bar ${tpClass(r)}" style="width:${(100 * r[o.k] / max).toFixed(1)}%"></span></span>
          <span class="sl-bar-val">${fmt(r[o.k], o.d)} ${o.unit}${w ? (b.tie ? ' · tie' : ' · best') : ''}</span></div>`;
      }).join('');
      return `<div class="sl-mini"><p class="sl-mini-t">${o.t} <span>${esc(o.note)} · ${o.hi ? 'higher' : 'lower'} is better</span></p>${bars}</div>`;
    }).join('');
    const sources = ld.rows.map(r => `${esc(short(r))}: ${XLs ? XLs.diagLinkHtml(r.id, r.platform) : esc(r.id + '@' + r.platform)}`).join(' · ');
    return `<div class="sl-detail-head"><h3>${esc(g.model)} · ${g.gpus} × ${plat(g.platform)} · ${esc(ld.label)}</h3>
      <a class="xl-link" href="recommendations.html#${new URLSearchParams({ mode: 'inference', size: g.model.startsWith('Qwen') ? '7b' : '1b', hardware: g.platform, gpus: String(g.gpus), priority: 'throughput', prompt: String(ld.prompt >= 640 ? 1280 : 128), concurrency: String(ld.concurrency) })}">Open this load in Part 4 →</a></div>
      <div class="sl-minis">${charts}</div>
      <p class="sl-src"><span class="xl-k">Runs (hardware diagnostics)</span> ${sources}</p>`;
  }

  function render() {
    root.querySelector('#slMatrix').innerHTML = matrix();
    root.querySelector('#slDetail').innerHTML = selected ? detail() : '';
    root.querySelectorAll('.sl-row').forEach(tr => {
      const pick = () => { selected = tr.dataset.key; render(); root.querySelector('#slDetail').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
      tr.addEventListener('click', pick);
      tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    });
  }

  root.querySelector('#slDiagram').innerHTML = diagram();
  root.querySelector('#slAnswers').innerHTML = answers() +
    `<p class="sl-key">Where each layout wins, with its lead over the runner-up. <b>p128·c8</b> = 128-token prompt, 8 concurrent requests. Leads under ${TIE}% count as ties.</p>`;
  // Open on the load with the clearest trade-off: Qwen2.5-7B, long prompt, 8 concurrent.
  selected = (groups.find(g => g.model.startsWith('Qwen'))?.loads.find(l => l.prompt === 1280 && l.concurrency === 8) || groups[0].loads[0]).key;
  render();
})();
