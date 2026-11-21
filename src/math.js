/** Exact binary bounds. Internal parity partners may have n=0 or n=513. */
(function (root) {
  'use strict';

  function binomial(n, k) {
    if (k < 0 || k > n) return 0n;
    k = Math.min(k, n - k);
    let value = 1n;
    for (let i = 1; i <= k; i++) value = value * BigInt(n - i + 1) / BigInt(i);
    return value;
  }

  function oddPartner(n, d) {
    return d % 2 ? { n, d } : { n: n - 1, d: d - 1 };
  }

  function createCalculator() {
    const johnsonCache = new Map();
    const pairCache = new Map();

    function johnsonBound(n, d) {
      if (d < 3 || d > n) return null;
      const { n: N, d: D } = oddPartner(n, d);
      const key = `${N},${D}`;
      if (johnsonCache.has(key)) return johnsonCache.get(key);
      const e = (D - 1) / 2;
      let constantWeight = 1n, volume = 1n, choose = 1n;
      for (let i = e; i >= 0; i--) {
        constantWeight = BigInt(N - i) * constantWeight / BigInt(D - i);
      }
      for (let i = 1; i <= e; i++) {
        choose = choose * BigInt(N - i + 1) / BigInt(i);
        volume += choose;
      }
      const q = BigInt(Math.floor(N / (e + 1)));
      const delta = binomial(N, e + 1) - binomial(D, e) * constantWeight;
      if (delta < 0n) throw new Error('Invalid Johnson correction');
      const upper = (2n ** BigInt(N)) * q / (q * volume + delta);
      const result = { N, D, e, constantWeight, volume, q, delta, upper };
      johnsonCache.set(key, result);
      return result;
    }

    function directBound(n, d) {
      const result = { n, d, lower: 2n };
      if (d > n) return { ...result, lower: 1n, upper: 1n, rule: 'Distance exceeds length' };
      if (d === 1) return { ...result, lower: 2n ** BigInt(n), upper: 2n ** BigInt(n), rule: 'Full Hamming space' };
      if (d === 2) return { ...result, lower: 2n ** BigInt(n - 1), upper: 2n ** BigInt(n - 1), rule: 'Binary parity code' };

      let upper = 2n ** BigInt(n - d + 1), rule = 'Singleton bound';
      const radius = Math.floor((d - 1) / 2);
      let volume = 1n, choose = 1n;
      for (let i = 1; i <= radius; i++) {
        choose = choose * BigInt(n - i + 1) / BigInt(i);
        volume += choose;
      }
      const hammingUpper = (2n ** BigInt(n)) / volume;
      if (hammingUpper < upper) { upper = hammingUpper; rule = 'Hamming (sphere-packing) bound'; }
      if (2 * d > n) {
        const plotkin = BigInt(2 * d) / BigInt(2 * d - n);
        if (plotkin < upper) { upper = plotkin; rule = 'Plotkin bound'; }
      }
      const johnson = johnsonBound(n, d);
      if (johnson.upper < upper) { upper = johnson.upper; rule = 'Johnson bound'; }
      return { ...result, upper, rule, hammingUpper, johnson };
    }

    function elementaryBound(n, d) {
      const odd = oddPartner(n, d), key = `${odd.n},${odd.d}`;
      if (!pairCache.has(key)) {
        const a = directBound(odd.n, odd.d);
        const b = directBound(odd.n + 1, odd.d + 1);
        pairCache.set(key, { a, b, winner: b.upper < a.upper ? b : a });
      }
      const { a, b, winner } = pairCache.get(key);
      const viaParity = winner.n !== n || winner.d !== d;
      const local = d % 2 ? a : b;
      const lower = a.lower > b.lower ? a.lower : b.lower;
      const relation = viaParity
        ? ` The upper bound is evaluated at A(${winner.n},${winner.d}) and transferred by the odd/even parity identity.`
        : '';
      return {
        source: 'T', originN: n, originD: d, lower, upper: winner.upper,
        rule: winner.rule + (viaParity ? ' via parity identity' : ''),
        upperProof: { n: winner.n, d: winner.d, rule: winner.rule },
        hammingUpper: local.hammingUpper, johnson: local.johnson,
        note: `Elementary bounds are evaluated at both parity-equivalent pairs and the smallest upper bound is retained.${relation}`,
      };
    }

    return { johnsonBound, elementaryBound, directBound };
  }

  const api = { binomial, oddPartner, createCalculator };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AtlasMath = api;
})(globalThis);
