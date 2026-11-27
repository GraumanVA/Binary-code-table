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

test('Grassl improves the lower bound on both sides of parity and credits the construction', () => {
  const engine = createEngine(data);
  const baseline = createEngine({ ...data, grassl: [] });
  for (const [n, d, lower] of [[30, 19, 4n], [40, 13, 8192n], [256, 169, 4n]]) {
    for (const [length, distance] of [[n, d], [n + 1, d + 1]]) {
      const result = engine.calculate(length, distance);
      const previous = baseline.calculate(length, distance);
      assert.equal(result.L, lower);
      assert(result.L > previous.L);
      assert.equal(result.U, previous.U);
    }
  }
  const disabled = { litsyn: true, brouwer: true, theorems: true, literature: false };
  assert.equal(engine.calculate(30, 19, disabled).L, 2n);
  const witness = engine.calculate(31, 20).cs.find(claim => claim.source === 'G');
  const format = createFormatters(data);
  assert.equal(format.boundAttributions([witness], 'lower'), 'Cordaro and Wagner (1967)');
  const details = format.displayClaim(witness);
  assert(details.includes('[30, 2, 20]'));
  assert(details.includes('q=2&amp;n=30&amp;k=2'));
  assert(details.includes('10.1109/TIT.1967.1053987'));
  assert(details.includes('odd/even parity identity'));

  const kurz = engine.calculate(45, 19).cs.find(claim => claim.source === 'G');
  assert.equal(format.boundAttributions([kurz], 'lower'), 'Kurz (2021)');
  const kurzDetails = format.displayClaim(kurz);
  assert(kurzDetails.includes('https://doi.org/10.3934/amc.2020074'));
  assert(kurzDetails.includes('q=2&amp;n=45&amp;k=9'));
  assert(kurzDetails.includes('Puncturing the [46,9,20] code'));
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
