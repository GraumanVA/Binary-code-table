const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createEngine } = require('../src/bounds.js');
const { createCalculator } = require('../src/math.js');
const { createFormatters } = require('../src/format.js');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../coding_bounds_seed.json'), 'utf8'));

test('all imported-range results are consistent and parity-equivalent', () => {
  const engine = createEngine(data);
  let count = 0;
  for (let n = 3; n <= 512; n++) {
    for (let d = 3; d <= Math.min(29, n); d++) {
      const result = engine.calculate(n, d);
      assert(!result.conflict, `${n},${d}`);
      assert(result.cs.every(claim => !claim.record || !data.editorial_exclusions.some(item => item.claim_id === claim.record.id)));
      if (d % 2 && n < 512) {
        const partner = engine.calculate(n + 1, d + 1);
        assert.equal(result.L, partner.L, `${n},${d} lower`);
        assert.equal(result.U, partner.U, `${n},${d} upper`);
      }
      count++;
    }
  }
  assert.equal(count, 13419);
});

test('parity closure works with every combination of enabled sources', () => {
  const engine = createEngine(data);
  for (let mask = 0; mask < 8; mask++) {
    const settings = { litsyn: Boolean(mask & 1), brouwer: Boolean(mask & 2), theorems: Boolean(mask & 4) };
    for (const [n, d] of [[17, 3], [32, 19], [35, 21], [511, 29]]) {
      const a = engine.calculate(n, d, settings), b = engine.calculate(n + 1, d + 1, settings);
      assert.equal(a.L, b.L);
      assert.equal(a.U, b.U);
    }
  }
  const result = engine.calculate(32, 19);
  assert.equal(result.U, 5n);
  assert.deepEqual(result.cs.find(claim => claim.source === 'T').upperProof,
    { n: 33, d: 20, rule: 'Plotkin bound' });
});

test('exact arithmetic retains Johnson, perfect-code and boundary results', () => {
  const math = createCalculator();
  assert.equal(math.johnsonBound(13, 5).upper, 77n);
  assert.equal(math.johnsonBound(29, 5).upper, 1230101n);
  assert.equal(math.johnsonBound(30, 6).upper, 1230101n);
  assert.equal(math.elementaryBound(512, 1).upper, 2n ** 512n);
  assert.equal(math.elementaryBound(1, 2).upper, 1n);
  assert.equal(math.elementaryBound(1, 2).lower, 1n);
  assert.equal(math.elementaryBound(512, 511).upper, math.elementaryBound(513, 512).upper);
  for (const [n, d, value] of [[7, 3, 16n], [15, 3, 2048n], [23, 7, 4096n], [24, 8, 4096n]]) {
    assert.equal(math.elementaryBound(n, d).upper, value);
  }
  assert.equal(createEngine(data).calculate(17, 3).U, 6551n);
});

test('original products and shortening use exact representations', () => {
  const format = createFormatters(data);
  for (const row of data.litsyn) {
    const claim = { source: 'L', record: row, lower: BigInt(row.lower), steps: 0 };
    const power = format.powerForm(claim.lower, [claim]);
    assert.equal(String(power.N), row.N);
    assert.equal(power.k, row.k);
    assert.equal(power.N * 2n ** BigInt(power.k), claim.lower);
  }
  const rounded = { source: 'L', record: { N: '83', k: 6 }, lower: 21n, steps: 8 };
  assert.equal(format.powerForm(21n, [rounded]), null);
  assert.equal(format.authorLabel('shek89'), 'Shekhunova, Bezzateev and Mironchikov (1989)');
});
