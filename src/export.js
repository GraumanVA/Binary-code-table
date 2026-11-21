/** Snapshot-based CSV export shared by the worker and yielding fallback. */
(function (root) {
  'use strict';
  const state = root.AtlasState || require('./state.js');
  const sourceLabel = claim => claim.source === 'L' ? 'Litsyn 1999'
    : claim.source === 'B' ? 'Brouwer 2026' : claim.source === 'P' ? 'Literature update' : 'Standard theorem';
  const csvRow = values => values.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',');

  async function generateCSV(engine, settings, options = {}) {
    // Never read live controls while exporting: every row uses this snapshot.
    const snapshot = Object.freeze({ ...settings });
    const columns = state.distanceColumns(snapshot);
    const total = (snapshot.nEnd - snapshot.nStart + 1) * columns.length;
    const onProgress = options.onProgress || (() => {});
    const yieldControl = options.yieldControl || (() => new Promise(resolve => setTimeout(resolve, 0)));
    const now = options.now || (() => performance.now());
    const budget = options.timeBudgetMs ?? 8;
    const parts = [csvRow(['n', 'd', 'lower', 'upper', 'status', 'source_count', 'sources', 'dataset_version', 'upper_method'])];
    let pending = [], completed = 0, lastYield = now();

    function checkCancellation() {
      if (options.signal?.aborted) {
        const error = new Error('Export cancelled');
        error.name = 'AbortError';
        throw error;
      }
    }

    onProgress({ completed, total });
    await yieldControl();
    checkCancellation();
    for (let n = snapshot.nStart; n <= snapshot.nEnd; n++) {
      for (const d of columns) {
        checkCancellation();
        const result = engine.calculate(n, d, snapshot);
        const upperMethod = result.cs.filter(claim => claim.upper != null && claim.upper === result.U)
          .map(claim => claim.rule || sourceLabel(claim)).join(' / ');
        pending.push(csvRow([n, d, result.L ?? '', result.U ?? '', result.status,
          result.cs.length, result.cs.map(sourceLabel).join(' + '), snapshot.version || '', upperMethod]));
        completed++;
        if (pending.length >= 128) {
          parts.push('\r\n' + pending.join('\r\n'));
          pending = [];
        }
        if (now() - lastYield >= budget) {
          onProgress({ completed, total });
          await yieldControl();
          checkCancellation();
          lastYield = now();
        }
      }
    }
    if (pending.length) parts.push('\r\n' + pending.join('\r\n'));
    onProgress({ completed, total });
    return { parts, rowCount: completed, settings: snapshot };
  }

  const api = { generateCSV, csvRow };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AtlasExport = api;
})(globalThis);
