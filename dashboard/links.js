/* Cross-page links for the dashboard (catalog, analysis, studies, recommendations, diagnostics).
 * Uses DIAG_INDEX (diagnostics-index.js) when loaded, so any page can say whether an
 * experiment has diagnostics and whether a health check flagged it.
 */
(function (root) {
  // Generated data files declare top-level consts, which are shared globals but not window properties.
  const IDX = (typeof DIAG_INDEX !== 'undefined' && DIAG_INDEX) || root.DIAG_INDEX || { checks: [], flags: {}, studiesByExp: {}, studyTitles: {} };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const normPlatform = p => p ? String(p).toLowerCase().replace(/^lovelace_/, '') : '';
  const checkLabel = id => (IDX.checks.find(c => c.id === id) || { label: id }).label;

  const L = {
    index: IDX,
    esc,
    normPlatform,
    catalog: eid => `index.html?q=${encodeURIComponent(eid)}`,
    study: sid => `studies.html#${encodeURIComponent(sid)}`,
    studyTitle: sid => IDX.studyTitles[sid] || sid,
    /** diagnostics.html deep link: one condition (E-id + platform), an E-id, or any filter state. */
    diag(eid, platform, extra) {
      const p = new URLSearchParams(extra || {});
      const plat = normPlatform(platform);
      if (eid && plat) p.set('open', `${eid}@${plat}`);
      else if (eid) p.set('q', eid);
      return `diagnostics.html#${p}`;
    },
    diagStudy: sid => `diagnostics.html#${new URLSearchParams({ study: sid })}`,
    hasDiag: (eid, platform) => platform ? `${eid}@${normPlatform(platform)}` in IDX.flags
      : ['h100', 'l40s'].some(p => `${eid}@${p}` in IDX.flags),
    flags: (eid, platform) => IDX.flags[`${eid}@${normPlatform(platform)}`] || [],
    checkLabel,
    studiesFor: eid => IDX.studiesByExp[eid] || [],
    /** recommendations.html state for a measured context. */
    reco({ mode, params, platform, gpus, concurrency, prompt }) {
      const size = params == null ? '1b' : params < 1000 ? 'small' : params < 2000 ? '1b' : params < 4000 ? '3b' : params < 8000 ? '7b' : 'large';
      const g = [1, 2, 4, 8, 16].reduce((a, b) => Math.abs(b - gpus) < Math.abs(a - gpus) ? b : a, 8);
      const s = { mode, size, hardware: normPlatform(platform) || 'other', gpus: String(g), priority: 'throughput' };
      if (mode === 'inference') { s.prompt = prompt >= 640 ? '1280' : '128'; s.concurrency = String([1, 2, 4, 8].reduce((a, b) => Math.abs(b - (concurrency || 8)) < Math.abs(a - (concurrency || 8)) ? b : a, 8)); }
      return `recommendations.html#${new URLSearchParams(s)}`;
    },
    /** HTML: "E401" linked to its diagnostics, with a warning chip per health-check flag. */
    diagLinkHtml(eid, platform, opts = {}) {
      const plat = normPlatform(platform);
      const known = L.hasDiag(eid, plat);
      const text = opts.text || (plat ? `${eid}@${plat}` : eid);
      if (!known) return `<span class="xl-id">${esc(text)}</span>`;
      const f = plat ? L.flags(eid, plat) : [];
      const chips = opts.noFlags ? '' : f.map(x => `<span class="xl-flag" title="Diagnostics health check failed: ${esc(checkLabel(x))}">⚠ ${esc(checkLabel(x))}</span>`).join('');
      return `<a class="xl-id" href="${L.diag(eid, plat)}" title="Hardware diagnostics for ${esc(text)}">${esc(text)}</a>${chips}`;
    },
    /** Shared look for links injected into pages with different stylesheets. */
    injectStyles() {
      if (document.getElementById('xl-style')) return;
      const s = document.createElement('style'); s.id = 'xl-style';
      s.textContent = `
        .xl-id { font-family: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace; font-size: .92em; }
        a.xl-id, a.xl-link { color: var(--blue, #2a78d6); text-decoration: none; }
        a.xl-id:hover, a.xl-link:hover { text-decoration: underline; }
        .xl-flag { display: inline-block; font-size: 10px; font-weight: 700; padding: 0 6px; margin-left: 4px; border-radius: 999px;
          background: rgba(183,121,0,.16); color: var(--warning, #b77900); vertical-align: 1px; white-space: nowrap; }
        .xl-row { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12.5px; margin: 8px 0 0; align-items: baseline; }
        .xl-row .xl-k { color: var(--text-muted, #898781); font-size: 11px; text-transform: uppercase; letter-spacing: .05em; font-weight: 700; }
        a.xl-link { font-weight: 600; }`;
      document.head.append(s);
    },
  };
  root.XL = L;
  if (typeof module !== 'undefined') module.exports = L;
})(typeof window !== 'undefined' ? window : globalThis);
