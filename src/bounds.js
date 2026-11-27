/** Source lookup and merging, independent of browser controls and presentation. */
(function (root) {
  'use strict';
  const math = root.AtlasMath || require('./math.js');
  const imports = { litsyn: true, brouwer: true, grassl: true, literature: true };

  function grasslEnabled(settings) {
    return settings.grassl ?? (settings.literature !== false);
  }

  function beforeLength(records, n) {
    let first = 0, end = records.length;
    while (first < end) {
      const mid = Math.floor((first + end) / 2);
      if (records[mid].n < n) first = mid + 1;
      else end = mid;
    }
    return records[first - 1];
  }

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
    const paddingLengths = new Map(), paddingCache = new Map();
    function rememberLength(n, d) {
      const pair = math.oddPartner(n, d);
      if (!paddingLengths.has(pair.d)) paddingLengths.set(pair.d, new Set());
      paddingLengths.get(pair.d).add(pair.n);
    }
    for (const row of eligible) rememberLength(row.n, row.d);
    for (const row of data.brouwer) rememberLength(row.n, row.d);
    for (const row of grassl.values()) rememberLength(row.n, row.d);
    for (const row of data.literature_claims || []) {
      if (row.active === false) continue;
      const pair = math.oddPartner(row.n, row.d), key = `${pair.n},${pair.d}`;
      if (!literature.has(key)) literature.set(key, []);
      literature.get(key).push(row);
      if (row.lower != null) rememberLength(row.n, row.d);
    }

    function directCandidates(n, d, settings) {
      const claims = [];
      const pair = math.oddPartner(n, d), key = `${pair.n},${pair.d}`;
      if (settings.litsyn && pair.n >= 1 && pair.d >= 3) {
        const row = litsyn.get(key) || (byDistance.get(pair.d) || []).find(item => item.n > pair.n);
        if (row) {
          const steps = row.n - pair.n, divisor = 2n ** BigInt(steps);
          const sourceBound = BigInt(row.lower);
          claims.push({ source: 'L', originN: row.n, originD: row.d,
            lower: (sourceBound + divisor - 1n) / divisor, upper: null,
            record: row, implied: steps > 0, steps, parity: d % 2 === 0, sourceBound });
        }
      }
      if (settings.brouwer) {
        const originN = d % 2 ? n + 1 : n, originD = d % 2 ? d + 1 : d;
        const row = brouwer.get(`${originN},${originD}`);
        if (row) claims.push({ source: 'B', originN, originD,
          lower: BigInt(row.lower), upper: BigInt(row.upper), record: row, parity: d % 2 === 1 });
      }
      if (settings.theorems) claims.push(calculator.elementaryBound(n, d));
      if (grasslEnabled(settings)) {
        const witness = grassl.get(key);
        if (witness) {
          const originN = witness.code_n, originD = pair.d + originN - pair.n;
          claims.push({ source: 'G', originN, originD, lower: 2n ** BigInt(witness.k), upper: null,
            record: witness, parity: n !== originN || d !== originD });
        }
      }
      if (settings.literature !== false) {
        for (const row of literature.get(key) || []) {
          claims.push({ source: 'P', originN: row.n, originD: row.d,
            lower: row.lower == null ? null : BigInt(row.lower),
            upper: row.upper == null ? null : BigInt(row.upper), record: row,
            parity: n !== row.n || d !== row.d });
        }
      }
      return claims;
    }

    function paddingIndex(d) {
      if (paddingCache.has(d)) return paddingCache.get(d);
      const index = { L: [], B: [], G: [], P: [] };
      const lengths = [...(paddingLengths.get(d) || [])].sort((a, b) => a - b);
      for (const n of lengths) {
        for (const claim of directCandidates(n, d, imports)) {
          // An archive claim shortened to an earlier length is covered by the
          // original row or by shortening directly to the requested length.
          if (claim.lower == null || claim.implied) continue;
          const records = index[claim.source], best = records.at(-1);
          if (best?.lower > claim.lower) continue;
          if (best?.n === n && claim.lower === best.lower) best.claims.push(claim);
          else records.push({ n, lower: claim.lower, claims: [claim] });
        }
      }
      paddingCache.set(d, index);
      return index;
    }

    function calculate(n, d, settings = { litsyn: true, brouwer: true, literature: true, theorems: true }) {
      const valid = Number.isInteger(n) && Number.isInteger(d) && n >= 1 && d >= 1 && n <= 512 && d <= 512;
      const cs = valid ? directCandidates(n, d, settings) : [];
      let L = null, U = null;
      for (const claim of cs) {
        if (claim.lower != null && (L == null || claim.lower > L)) L = claim.lower;
        if (claim.upper != null && (U == null || claim.upper < U)) U = claim.upper;
      }
      if (valid) {
        const pair = math.oddPartner(n, d), index = paddingIndex(pair.d);
        const enabled = { L: settings.litsyn, B: settings.brouwer,
          G: grasslEnabled(settings), P: settings.literature !== false };
        const padded = [];
        for (const [source, records] of Object.entries(index)) {
          if (!enabled[source]) continue;
          const best = beforeLength(records, pair.n);
          if (best && (L == null || best.lower > L)) padded.push(best);
        }
        if (padded.length) {
          for (const candidate of padded) if (L == null || candidate.lower > L) L = candidate.lower;
          for (const { n: fromN, lower, claims } of padded) {
            if (lower !== L) continue;
            const padding = { fromN: fromN + d - pair.d, toN: n, d };
            for (const claim of claims) cs.push({ ...claim, upper: null, padding });
          }
        }
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
