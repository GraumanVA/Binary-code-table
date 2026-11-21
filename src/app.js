/** Browser interaction only; calculations, state and export have separate modules. */
(function (root) {
  'use strict';
  const Bounds = root.AtlasBounds || require('./bounds.js');
  const Format = root.AtlasFormat || require('./format.js');
  const State = root.AtlasState || require('./state.js');
  const Export = root.AtlasExport || require('./export.js');

  function createApp(document, window, options = {}) {
    const q = id => document.getElementById(id);
    const data = options.data || JSON.parse(q('seed').textContent);
    const version = data.metadata.version;
    q('datasetVersion').textContent = version;
    const engine = Bounds.createEngine(data);
    const st = { ...State.defaults };
    const { esc, notation, exactVal, boundAttributions, boundNumber,
      exactIntegers, displayClaim } = Format.createFormatters(data);
    const calculate = (n, d) => engine.calculate(n, d, st);
    let activeExport = null;

    function persistRoute() {
      try { window.history.replaceState(null, '', State.serializeRoute(st, version)); }
      catch (_) { /* Some file viewers disallow history changes. */ }
    }

    function syncControls() {
      for (const id of [...State.rangeFields, 'parity']) q(id).value = st[id];
      for (const id of State.sourceFields) q(id).checked = st[id];
      q('rangeNote').hidden = true;
      q('rangeNote').textContent = '';
      for (const id of State.rangeFields) q(id).setAttribute('aria-invalid', 'false');
    }

    const GRID_ROW_HEIGHT = 43, GRID_OVERSCAN = 6;
    let gridColumns = [], gridWindow = '';
    const distanceColumns = () => State.distanceColumns(st);

    function gridValue(result) {
      switch (result.status) {
        case 'exact': return notation(result.L);
        case 'interval': return notation(result.L) + '–' + notation(result.U);
        case 'lower': return '≥ ' + notation(result.L);
        case 'upper': return '≤ ' + notation(result.U);
        case 'conflict': return 'CONFLICT';
        default: return '—';
      }
    }

    function showGrid() {
      const scroll = q('matrixScroll'), top = scroll.scrollTop, left = scroll.scrollLeft;
      gridColumns = distanceColumns();
      gridWindow = '';
      // Keep widths stable while virtual rows are replaced during scrolling.
      const widths = gridColumns.map(d => Math.max(105, 20 + 8 * Math.max(
        gridValue(calculate(st.nStart, d)).length, gridValue(calculate(st.nEnd, d)).length)));
      q('matrix').style.width = (64 + widths.reduce((sum, width) => sum + width, 0)) + 'px';
      q('matrix').innerHTML = `
        <colgroup><col style="width:64px">${widths.map(width => `<col style="width:${width}px">`).join('')}</colgroup>
        <thead><tr><th scope="col">n / d</th>${gridColumns.map(d => `<th scope="col">${d}</th>`).join('')}</tr></thead>
        <tbody id="matrixBody"></tbody>`;
      q('matrix').setAttribute('aria-rowcount', st.nEnd - st.nStart + 2);
      q('matrix').setAttribute('aria-colcount', gridColumns.length + 1);
      renderGridRows(true, top);
      scroll.scrollTop = top;
      scroll.scrollLeft = left;
      const parityLabel = st.parity === 'odd' ? ' · odd d' : st.parity === 'even' ? ' · even d' : '';
      q('shown').textContent = `${st.nEnd-st.nStart+1} lengths × ${gridColumns.length} distances${parityLabel}`;
    }

    function renderGridRows(force = false, scrollTop = q('matrixScroll').scrollTop) {
      const total = st.nEnd - st.nStart + 1;
      const viewport = q('matrixScroll').clientHeight || 600;
      const virtual = total > 80 || total * gridColumns.length > 4000;
      const first = virtual ? Math.min(total - 1,
        Math.max(0, Math.floor((scrollTop - GRID_ROW_HEIGHT) / GRID_ROW_HEIGHT) - GRID_OVERSCAN)) : 0;
      const end = virtual ? Math.min(total, first + Math.ceil(viewport / GRID_ROW_HEIGHT) + 2 * GRID_OVERSCAN) : total;
      const key = `${first},${end}`;
      if (!force && gridWindow === key) return;
      gridWindow = key;
      const spacer = height => `<tr class="spacer" aria-hidden="true"><td colspan="${gridColumns.length+1}" style="height:${height}px"></td></tr>`;
      let html = first ? spacer(first * GRID_ROW_HEIGHT) : '';
      for (let row = first; row < end; row++) {
        const n = st.nStart + row;
        html += `<tr class="data-row" aria-rowindex="${row+2}"><th scope="row">${n}</th>`;
        for (const d of gridColumns) {
          const result = calculate(n, d);
          const chosen = st.detailOpen && n === st.n && d === st.d;
          const sources = [...new Set(result.cs.map(claim => claim.source))].sort().join('+');
          const tooltip = `A(${n},${d}): ${result.L ?? '?'} ≤ A ≤ ${result.U ?? '?'}. ${sources || 'No imported bounds'}`;
          html += `<td><button data-n="${n}" data-d="${d}" class="cell ${result.status}${chosen ? ' selected' : ''}"
            aria-label="${esc(tooltip)}" aria-pressed="${chosen}" title="${esc(tooltip)}"><span class="value">${esc(gridValue(result))}</span></button></td>`;
        }
        html += '</tr>';
      }
      if (end < total) html += spacer((total - end) * GRID_ROW_HEIGHT);
      q('matrixBody').innerHTML = html;
    }

    function showDetail() {
      q('detail').hidden = !st.detailOpen;
      q('workspace').classList.toggle('has-detail', st.detailOpen);
      if (!st.detailOpen) { q('detail').innerHTML = ''; return; }
      const result = calculate(st.n, st.d);
      const status = { exact: 'Exact value', interval: 'Bounded interval', lower: 'Lower bound only',
        upper: 'Upper bound only', empty: 'No imported result', conflict: 'Source conflict' }[result.status];
      const lowerClaims = result.cs.filter(claim => claim.lower != null && claim.lower === result.L);
      const upperClaims = result.cs.filter(claim => claim.upper != null && claim.upper === result.U);
      const lower = boundNumber(result.L, lowerClaims, 'lower');
      const upper = boundNumber(result.U, upperClaims, 'upper');
      const compact = lower !== esc(exactVal(result.L)) || upper !== esc(exactVal(result.U));
      const exact = compact ? exactIntegers([['Lower bound', result.L], ['Upper bound', result.U]]) : '';
      const order = { P: 0, B: 1, L: 2, T: 3 };
      const notes = result.cs.length
        ? result.cs.slice().sort((a, b) => order[a.source] - order[b.source]).map(displayClaim).join('')
        : '<div class="norecord">No bound is available from the enabled sources.</div>';
      q('detail').innerHTML = `
        <div class="detail-top">
          <div class="detail-heading"><span class="detail-eyebrow">Parameter details</span>
            <button class="text-button close-detail" id="closeDetail" aria-label="Close parameter details">Close</button></div>
          <div class="math-title"><i>A</i>(${st.n}, ${st.d})</div>
          <span class="summary-status ${result.status === 'exact' ? 'exact' : ''}">${esc(status)}</span>
          <div class="bounds">
            <div class="bound"><label>Lower bound</label><strong title="Exact integer: ${esc(exactVal(result.L))}">${lower}</strong>
              <small>${esc(boundAttributions(lowerClaims, 'lower'))}</small></div>
            <div class="bound"><label>Upper bound</label><strong title="Exact integer: ${esc(exactVal(result.U))}">${upper}</strong>
              <small>${esc(boundAttributions(upperClaims, 'upper'))}</small></div>
          </div>${exact}
        </div>
        <div class="detail-content">
          <div class="subhead">Source claims and derivations (${result.cs.length})</div>${notes}
          <div class="outbound"><a href="${q('seed') ? './dist/editor.html' : './editor.html'}#A-${st.n}-${st.d}">Update this entry</a> · <a href="#sources">Source data</a></div></div>`;
      q('closeDetail').addEventListener('click', closeDetail);
    }

    function closeDetail() {
      st.detailOpen = false;
      persistRoute();
      render();
      const cell = q('matrix').querySelector(`button[data-n="${st.n}"][data-d="${st.d}"]`);
      (cell || q('matrixScroll')).focus({ preventScroll: true });
    }

    function choose(n, d, { updateHash = true, focusDetail = true } = {}) {
      if (!Number.isInteger(n) || !Number.isInteger(d) || n < 1 || n > 512 || d < 1 || d > 512) return;
      Object.assign(st, { n, d, detailOpen: true });
      if (n < st.nStart || n > st.nEnd) {
        st.nStart = Math.max(1, n - 5);
        st.nEnd = Math.min(512, st.nStart + 18);
      }
      if (d < st.dStart || d > st.dEnd) {
        st.dStart = Math.max(1, d - 4);
        st.dEnd = Math.min(512, st.dStart + 13);
      }
      if (st.parity !== 'all' && (d % 2 === 1) !== (st.parity === 'odd')) st.parity = d % 2 ? 'odd' : 'even';
      syncControls();
      if (updateHash) persistRoute();
      render();
      if (focusDetail) {
        q('closeDetail').focus({ preventScroll: true });
        if (window.matchMedia('(max-width:860px)').matches) q('detail').scrollIntoView({ block: 'start' });
      }
    }

    function render() { showGrid(); showDetail(); }

    function readControls() {
      const controls = { parity: q('parity').value,
        litsyn: q('litsyn').checked, brouwer: q('brouwer').checked, theorems: q('theorems').checked };
      controls.literature = q('literature').checked;
      for (const id of State.rangeFields) controls[id] = q(id).value;
      const result = State.applyControls(st, controls);
      Object.assign(st, result.next);
      for (const id of State.rangeFields) q(id).setAttribute('aria-invalid', String(result.invalid.includes(id)));
      q('rangeNote').hidden = !result.message;
      q('rangeNote').textContent = result.message;
      render();
      persistRoute();
    }

    function showExportProgress(job, completed, total) {
      if (activeExport !== job) return;
      q('exportProgress').max = Math.max(1, total);
      q('exportProgress').value = completed;
      q('exportStatus').textContent = `Exporting ${completed.toLocaleString()} of ${total.toLocaleString()} bounds…`;
    }

    function releaseWorker(job) {
      if (job.worker) job.worker.terminate();
      if (job.workerURL) window.URL.revokeObjectURL(job.workerURL);
      job.worker = null;
      job.workerURL = null;
    }

    function finishExport(job, message) {
      if (activeExport !== job) return;
      releaseWorker(job);
      activeExport = null;
      q('export').disabled = false;
      q('cancelExport').hidden = true;
      q('exportStatus').textContent = message;
    }

    function download(job, blob, rowCount) {
      if (activeExport !== job || job.cancelled) return;
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = `binary-bounds-n${job.settings.nStart}-${job.settings.nEnd}.csv`;
      document.body.append(link);
      link.click();
      window.setTimeout(() => { window.URL.revokeObjectURL(link.href); link.remove(); }, 1000);
      finishExport(job, `Exported ${rowCount.toLocaleString()} bounds from ${version}.`);
    }

    async function fallbackExport(job) {
      releaseWorker(job);
      try {
        const result = await Export.generateCSV(engine, job.settings, {
          signal: { get aborted() { return job.cancelled; } },
          onProgress: ({ completed, total }) => showExportProgress(job, completed, total),
          yieldControl: () => new Promise(resolve => window.setTimeout(resolve, 0)),
        });
        download(job, new window.Blob(result.parts, { type: 'text/csv;charset=utf-8' }), result.rowCount);
      } catch (error) {
        if (error.name !== 'AbortError') finishExport(job, `Export failed: ${error.message}`);
      }
    }

    function startExport() {
      if (activeExport) return;
      const job = { settings: Object.freeze({ ...st, version }), cancelled: false };
      activeExport = job;
      q('export').disabled = true;
      q('cancelExport').hidden = false;
      q('exportActivity').hidden = false;
      showExportProgress(job, 0, (st.nEnd-st.nStart+1) * distanceColumns().length);
      if (typeof window.Worker !== 'function') {
        job.promise = fallbackExport(job);
        return;
      }
      try {
        let workerURL = options.workerURL;
        if (!workerURL) {
          const code = JSON.parse(q('exportWorker').textContent);
          job.workerURL = window.URL.createObjectURL(new window.Blob([code], { type: 'text/javascript' }));
          workerURL = job.workerURL;
        }
        job.worker = new window.Worker(workerURL);
        job.worker.onmessage = event => {
          if (activeExport !== job) return;
          const message = event.data;
          if (message.type === 'progress') showExportProgress(job, message.completed, message.total);
          else if (message.type === 'complete') download(job, message.blob, message.rowCount);
          else if (message.type === 'error') finishExport(job, `Export failed: ${message.message}`);
        };
        job.worker.onerror = () => {
          if (activeExport === job && !job.fallbackStarted) {
            job.fallbackStarted = true;
            job.promise = fallbackExport(job);
          }
        };
        job.worker.postMessage({ data, settings: job.settings });
      } catch (_) {
        job.promise = fallbackExport(job);
      }
    }

    function cancelExport() {
      if (!activeExport) return;
      const job = activeExport;
      job.cancelled = true;
      finishExport(job, 'Export cancelled.');
    }

    function loadHash() {
      const route = State.parseRoute(window.location.hash, version);
      if (!route) return;
      Object.assign(st, route.state);
      syncControls();
      q('snapshotNotice').hidden = !route.versionMismatch;
      q('snapshotNotice').textContent = route.versionMismatch
        ? `This link refers to dataset ${route.linkedVersion}; this page contains ${version}. Results may differ.` : '';
    }

    for (const id of [...State.rangeFields, 'parity', ...State.sourceFields]) {
      q(id).addEventListener('change', readControls);
    }
    q('matrix').addEventListener('click', event => {
      const cell = event.target.closest('button[data-n]');
      if (cell && q('matrix').contains(cell)) choose(Number(cell.dataset.n), Number(cell.dataset.d));
    });
    let rowFrame = 0;
    q('matrixScroll').addEventListener('scroll', () => {
      if (!rowFrame) rowFrame = window.requestAnimationFrame(() => { rowFrame = 0; renderGridRows(); });
    }, { passive: true });
    window.addEventListener('resize', () => renderGridRows(true));
    if (typeof window.ResizeObserver === 'function') new window.ResizeObserver(() => renderGridRows()).observe(q('matrixScroll'));
    q('export').addEventListener('click', startExport);
    q('cancelExport').addEventListener('click', cancelExport);
    window.addEventListener('hashchange', () => { loadHash(); render(); });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') { q('options').open = false; if (st.detailOpen) closeDetail(); }
    });
    document.addEventListener('click', event => { if (!q('options').contains(event.target)) q('options').open = false; });
    loadHash();
    syncControls();
    render();
    return { state: st, engine, choose, readControls, renderGridRows,
      startExport, cancelExport, getExport: () => activeExport };
  }

  const api = { createApp };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.AtlasApp = api;
  }
})(globalThis);
