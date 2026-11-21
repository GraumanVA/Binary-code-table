/** Range validation and reproducible, backwards-compatible parameter links. */
(function (root) {
  'use strict';
  const defaults = Object.freeze({ n: 17, d: 3, detailOpen: false,
    nStart: 14, nEnd: 32, dStart: 3, dEnd: 15, parity: 'odd',
    litsyn: true, brouwer: true, literature: true, theorems: true });
  const rangeFields = ['nStart', 'nEnd', 'dStart', 'dEnd'];
  const sourceFields = ['litsyn', 'brouwer', 'literature', 'theorems'];

  function applyControls(previous, controls) {
    // Filters always apply, even when a range field is an unfinished draft.
    const next = { ...previous, parity: controls.parity,
      litsyn: controls.litsyn, brouwer: controls.brouwer, theorems: controls.theorems };
    next.literature = controls.literature ?? previous.literature;
    const values = {}, invalid = [];
    let message = '';
    for (const field of rangeFields) {
      const raw = String(controls[field]), value = Number(raw);
      if (!raw.trim() || !Number.isInteger(value) || value < 1 || value > 512) invalid.push(field);
      values[field] = value;
    }
    if (invalid.length) message = 'Enter whole numbers from 1 to 512. The table keeps the last valid range.';
    else if (values.nStart > values.nEnd) {
      invalid.push('nStart', 'nEnd');
      message = 'Length from must not exceed Length to. The table keeps the last valid range.';
    } else if (values.dStart > values.dEnd) {
      invalid.push('dStart', 'dEnd');
      message = 'Distance from must not exceed Distance to. The table keeps the last valid range.';
    } else Object.assign(next, values);
    if (next.detailOpen && (next.n < next.nStart || next.n > next.nEnd || next.d < next.dStart || next.d > next.dEnd
        || (next.parity !== 'all' && (next.d % 2 === 1) !== (next.parity === 'odd')))) next.detailOpen = false;
    return { next, invalid, message };
  }

  function distanceColumns(settings) {
    const columns = [];
    for (let d = settings.dStart; d <= settings.dEnd; d++) {
      if (settings.parity === 'all' || (d % 2 === 1) === (settings.parity === 'odd')) columns.push(d);
    }
    return columns;
  }

  function serializeRoute(settings, version) {
    const params = new URLSearchParams();
    for (const field of sourceFields) params.set(field, settings[field] ? '1' : '0');
    for (const field of [...rangeFields, 'parity']) params.set(field, String(settings[field]));
    params.set('v', version);
    const path = settings.detailOpen ? `A-${settings.n}-${settings.d}` : 'browse';
    return `#${path}?${params}`;
  }

  function parseRoute(hash, version) {
    const match = hash.match(/^#(browse|A-(\d+)-(\d+))(?:\?(.*))?$/);
    if (!match) return null;
    const params = new URLSearchParams(match[4] || '');
    const state = { ...defaults };
    for (const field of sourceFields) {
      if (params.get(field) === '0' || params.get(field) === '1') state[field] = params.get(field) === '1';
    }
    if (['all', 'odd', 'even'].includes(params.get('parity'))) state.parity = params.get('parity');
    const controls = { ...state };
    for (const field of rangeFields) if (params.has(field)) controls[field] = params.get(field);
    Object.assign(state, applyControls(state, controls).next);
    if (match[2]) {
      const n = Number(match[2]), d = Number(match[3]);
      if (n < 1 || n > 512 || d < 1 || d > 512) return null;
      Object.assign(state, { n, d, detailOpen: true });
      state.nStart = Math.min(state.nStart, n); state.nEnd = Math.max(state.nEnd, n);
      state.dStart = Math.min(state.dStart, d); state.dEnd = Math.max(state.dEnd, d);
      if (state.parity !== 'all' && (d % 2 === 1) !== (state.parity === 'odd')) state.parity = d % 2 ? 'odd' : 'even';
    }
    const linkedVersion = params.get('v');
    return { state, versionMismatch: Boolean(linkedVersion && linkedVersion !== version), linkedVersion };
  }

  const api = { defaults, rangeFields, sourceFields, applyControls, distanceColumns, serializeRoute, parseRoute };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AtlasState = api;
})(globalThis);
