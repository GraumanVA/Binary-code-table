const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createEngine } = require('../src/bounds.js');
const { createCalculator, oddPartner } = require('../src/math.js');
const { createFormatters } = require('../src/format.js');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../build/coding_bounds_seed.json'), 'utf8'));

test('all sourced distances and derived lengths are consistent and parity-equivalent', () => {
  const engine = createEngine(data);
  const exclusions = new Set(data.editorial_exclusions.map(row => row.claim_id));
  const sources = [...data.litsyn, ...data.brouwer, ...data.grassl, ...data.literature_claims]
    .filter(row => row.active !== false && !exclusions.has(row.id));
  const sourcedPairs = sources.map(row => oddPartner(row.n, row.d));
  function checkPair(n, d) {
    if (n === 0) {
      assert(!engine.calculate(1, 2).conflict);
      return;
    }
    const result = engine.calculate(n, d);
    assert(!result.conflict, `${n},${d}`);
    assert(result.cs.every(claim => !claim.record || !exclusions.has(claim.record.id)));
    if (n < 512) {
      const partner = engine.calculate(n + 1, d + 1);
      assert.equal(result.L, partner.L, `${n},${d} lower`);
      assert.equal(result.U, partner.U, `${n},${d} upper`);
    }
  }
  for (const d of new Set(sourcedPairs.map(row => row.d))) {
    for (let n = d; n <= 512; n++) checkPair(n, d);
  }
  for (const { n, d } of sourcedPairs) {
    if (n < d) checkPair(n, d);
  }
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

test('Grassl supports the lower bound on both sides of parity and credits the construction', () => {
  const engine = createEngine(data);
  const baseline = createEngine({ ...data, grassl: [] });
  for (const [n, d, lower] of [[30, 19, 4n], [40, 13, 8192n], [256, 169, 4n]]) {
    for (const [length, distance] of [[n, d], [n + 1, d + 1]]) {
      const result = engine.calculate(length, distance);
      const previous = baseline.calculate(length, distance);
      assert.equal(result.L, lower);
      assert(result.L >= previous.L);
      assert(result.cs.some(claim => claim.source === 'G' && claim.lower === lower));
      assert.equal(result.U, previous.U);
    }
  }
  const disabled = { litsyn: true, brouwer: true, theorems: true, literature: false };
  assert.equal(engine.calculate(30, 19, disabled).L, baseline.calculate(30, 19, disabled).L);
  assert(!engine.calculate(30, 19, disabled).cs.some(claim => claim.source === 'G'));
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

test('zero padding repairs the archive gap and keeps its source and parity derivation', () => {
  const engine = createEngine(data);
  const archiveOnly = { litsyn: true, brouwer: false, grassl: false, literature: false, theorems: true };
  const before = engine.calculate(61, 25, archiveOnly);
  const result = engine.calculate(62, 25, archiveOnly);
  assert.equal(before.L, 4096n);
  assert.equal(result.L, before.L);
  const padded = result.cs.find(claim => claim.padding);
  assert.equal(padded.record.id, 'LIT-61-25');
  assert.equal(padded.upper, null);
  assert(result.cs.some(claim => claim.source === 'L' && !claim.padding));

  const partner = engine.calculate(63, 26, archiveOnly);
  assert.equal(partner.L, result.L);
  const format = createFormatters(data);
  const partnerClaim = partner.cs.find(claim => claim.padding);
  const markup = format.displayClaim(partnerClaim);
  assert(markup.includes('odd/even parity identity'));
  assert(markup.includes('Append one zero coordinate'));
  assert.deepEqual(format.referenceIds(partnerClaim, 'lower'), padded.record.refs);
});

test('the final Grassl length pads forward and source filters stay independent', () => {
  const engine = createEngine(data);
  const settings = { grassl: true, literature: false, theorems: true };
  const source = engine.calculate(256, 31, settings);
  const result = engine.calculate(257, 31, settings);
  assert(source.L > 2n);
  assert(result.L >= source.L);
  const claim = result.cs.find(item => item.padding && item.source === 'G');
  assert(claim);
  assert.equal(claim.upper, null);
  assert.equal(engine.calculate(258, 32, settings).L, result.L);
  assert.equal(engine.calculate(257, 31, { ...settings, grassl: false, literature: true }).L, 2n);
});

test('literature lower bounds pad forward without carrying over their upper bounds', () => {
  const row = { n: 18, d: 4, lower: '6144', upper: '6551' };
  const engine = createEngine({ ...data, literature_claims: [row] });
  const settings = { literature: true, grassl: false };
  const result = engine.calculate(19, 4, settings);
  assert.equal(result.L, 6144n);
  assert.equal(result.U, null);
  assert.deepEqual(result.cs[0].padding, { fromN: 18, toN: 19, d: 4 });
  assert.equal(engine.calculate(19, 4, { ...settings, literature: false }).L, null);
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
