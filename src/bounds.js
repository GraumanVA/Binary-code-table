/** Source lookup and merging, independent of browser controls and presentation. */
(function (root) {
  'use strict';
  const math = root.AtlasMath || require('./math.js');

  function createEngine(data) {
    const excluded = new Set(data.editorial_exclusions.map(row => row.claim_id));
    const eligible = data.litsyn.filter(row => !excluded.has(row.id));
    const litsyn = new Map(eligible.map(row => [`${row.n},${row.d}`, row]));
    const brouwer = new Map(data.brouwer.map(row => [`${row.n},${row.d}`, row]));
    const grassl = new Map((data.grassl || []).map(row => [`${row.n},${row.d}`, row]));
    const byDistance = new Map();
    for (const row of eligible) {
      if (!byDistance.has(row.d)) byDistance.set(row.d, []);
      byDistance.get(row.d).push(row);
    }
    for (const rows of byDistance.values()) rows.sort((a, b) => a.n - b.n);
    const calculator = math.createCalculator();
    const literature = new Map();
    for (const row of data.literature_claims || []) {
      if (row.active === false) continue;
      const pair = math.oddPartner(row.n, row.d), key = `${pair.n},${pair.d}`;
      if (!literature.has(key)) literature.set(key, []);
      literature.get(key).push(row);
    }

    function candidates(n, d, settings) {
      const claims = [];
      if (!Number.isInteger(n) || !Number.isInteger(d) || n < 1 || d < 1 || n > 512 || d > 512) return claims;
      if (settings.litsyn) {
        const originN = d % 2 ? n : n - 1, originD = d % 2 ? d : d - 1;
        if (originN >= 1 && originD >= 3 && originD <= 29) {
          let row = litsyn.get(`${originN},${originD}`);
          if (!row) row = (byDistance.get(originD) || []).find(item => item.n > originN);
          if (row) {
            const steps = row.n - originN, divisor = 2n ** BigInt(steps);
            const sourceBound = BigInt(row.lower);
            claims.push({ source: 'L', originN: row.n, originD: row.d,
              lower: (sourceBound + divisor - 1n) / divisor, upper: null,
              record: row, implied: steps > 0, steps, parity: d % 2 === 0, sourceBound });
          }
        }
      }
      if (settings.brouwer) {
        const originN = d % 2 ? n + 1 : n, originD = d % 2 ? d + 1 : d;
        const row = brouwer.get(`${originN},${originD}`);
        if (row) claims.push({ source: 'B', originN, originD,
          lower: BigInt(row.lower), upper: BigInt(row.upper), record: row, parity: d % 2 === 1 });
      }
      if (settings.theorems) claims.push(calculator.elementaryBound(n, d));
      if (settings.literature !== false) {
        const pair = math.oddPartner(n, d);
        const key = `${pair.n},${pair.d}`;
        const witness = grassl.get(key);
        if (witness) {
          const originN = witness.code_n, originD = pair.d + originN - pair.n;
          claims.push({ source: 'G', originN, originD, lower: 2n ** BigInt(witness.k), upper: null,
            record: witness, parity: n !== originN || d !== originD });
        }
        for (const row of literature.get(key) || []) {
          claims.push({ source: 'P', originN: row.n, originD: row.d,
            lower: row.lower == null ? null : BigInt(row.lower),
            upper: row.upper == null ? null : BigInt(row.upper), record: row,
            parity: n !== row.n || d !== row.d });
        }
      }
      return claims;
    }

    function calculate(n, d, settings = { litsyn: true, brouwer: true, literature: true, theorems: true }) {
      const cs = candidates(n, d, settings);
      let L = null, U = null;
      for (const claim of cs) {
        if (claim.lower != null && (L == null || claim.lower > L)) L = claim.lower;
        if (claim.upper != null && (U == null || claim.upper < U)) U = claim.upper;
      }
      const conflict = L != null && U != null && L > U;
      const status = conflict ? 'conflict' : L != null && U != null
        ? (L === U ? 'exact' : 'interval') : L != null ? 'lower' : U != null ? 'upper' : 'empty';
      return { n, d, cs, L, U, conflict, status };
    }

    return { calculate, calculator };
  }

  const api = { createEngine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AtlasBounds = api;
})(globalThis);
