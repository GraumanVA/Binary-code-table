const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { loadDataset } = require('../src/data.js');
const Boot = require('../src/boot.js');
const { createEngine } = require('../src/bounds.js');
const { createFormatters } = require('../src/format.js');
const { mount } = require('./dom-helper.cjs');
const dist = path.resolve(__dirname, '../dist');

function diskFetch(overrides = {}) {
  return async url => {
    const pathname = new URL(url).pathname;
    if (Object.hasOwn(overrides, pathname)) return overrides[pathname];
    const filename = path.resolve(dist, '.' + pathname);
    assert(filename.startsWith(dist + path.sep));
    if (!fs.existsSync(filename)) return { ok: false, status: 404 };
    return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(filename, 'utf8')) };
  };
}

test('external HTML contains no dataset and its data files reproduce the portable edition', async () => {
  const page = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  assert(!page.includes('id="seed"'));
  assert(!page.includes('N. Shekhunova'));
  assert(!page.includes('"LIT-7-3"'));
  assert(page.length < 15000);
  const data = await loadDataset('https://bounds.example/data/manifest.json', diskFetch());
  const portable = mount();
  for (const key of ['metadata', 'litsyn', 'brouwer', 'grassl', 'literature_claims', 'citation_metadata', 'bound_references']) {
    assert.deepEqual(data[key], portable.data[key]);
  }
  assert.equal(createEngine(data).calculate(17, 3).L, 6144n);
});

test('loader refuses mixed snapshots, missing files and invalid JSON', async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'data/manifest.json'), 'utf8'));
  const boundsPath = '/data/' + manifest.files.bounds;
  const bounds = JSON.parse(fs.readFileSync(path.join(dist, boundsPath), 'utf8'));
  await assert.rejects(loadDataset('https://bounds.example/data/manifest.json', diskFetch({
    [boundsPath]: { ok: true, json: async () => ({ ...bounds, version: 'other-snapshot' }) },
  })), /different snapshots/);
  await assert.rejects(loadDataset('https://bounds.example/data/manifest.json', diskFetch({
    [boundsPath]: { ok: false, status: 404 },
  })), /404/);
  await assert.rejects(loadDataset('https://bounds.example/data/manifest.json', diskFetch({
    [boundsPath]: { ok: true, json: async () => { throw new Error('bad JSON'); } },
  })), /valid JSON/);
});

test('external boot loads data, mounts once and exports through the external worker URL', async () => {
  let workerURL;
  class FakeWorker {
    constructor(url) { workerURL = url; }
    postMessage() {}
    terminate() {}
  }
  const page = mount('#A-17-3?brouwer=0', { fetch: diskFetch(), Worker: FakeWorker }, { edition: 'external', deferStart: true });
  const app = await Boot.start(page.document, page.window);
  assert.equal(app.state.brouwer, false);
  assert.equal(page.elements.get('loadStatus').hidden, true);
  assert.equal(app.engine.calculate(17, 3, app.state).L, 5312n);
  assert.equal(await Boot.start(page.document, page.window), app);
  app.startExport();
  assert(workerURL.startsWith('https://bounds.example/assets/export-worker.bundle.'));
  app.cancelExport();
});

test('failed loads keep controls disabled and allow a successful retry', async () => {
  let fail = true;
  const page = mount('', { fetch: (...args) => fail ? Promise.reject(new Error('Offline')) : diskFetch()(...args) },
    { edition: 'external', deferStart: true });
  await assert.rejects(Boot.start(page.document, page.window), /Offline/);
  assert.equal(page.elements.get('export').disabled, true);
  assert.equal(page.elements.get('retryLoad').hidden, false);
  assert.equal(page.elements.get('retryLoad').disabled, false);
  assert(page.elements.get('loadStatus').textContent.includes('Could not load'));
  fail = false;
  const app = await Boot.start(page.document, page.window);
  assert(app);
  assert.equal(page.elements.get('export').disabled, false);
  assert.equal(page.elements.get('loadStatus').hidden, true);
});

test('portable boot works without any network access', async () => {
  const page = mount('', { fetch: () => { throw new Error('Must not fetch'); } }, { deferStart: true });
  assert(await Boot.start(page.document, page.window));
});

test('the maintained edition loads its complete dataset through HTTP', async () => {
  const server = http.createServer((request, response) => {
    const filename = path.resolve(dist, '.' + new URL(request.url, 'http://localhost').pathname);
    if (!filename.startsWith(dist + path.sep) || !fs.existsSync(filename)) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader('Content-Type', 'application/json');
    response.end(fs.readFileSync(filename));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  try {
    const data = await loadDataset(`http://127.0.0.1:${server.address().port}/data/manifest.json`, fetch);
    assert.equal(data.litsyn.length, 1014);
    assert.equal(data.citation_metadata.shek89.year, '1989');
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('literature records merge by parity, retain authors, and respect the filter', () => {
  const { data } = mount();
  const update = { id: 'PAPER-MIL2026-17-3', n: 17, d: 3, lower: '6144', references: ['milshtein2026'] };
  const dataset = { ...data, literature_claims: [update] };
  const engine = createEngine(dataset);
  const settings = { litsyn: true, brouwer: false, literature: true, theorems: true };
  assert.equal(engine.calculate(17, 3, settings).L, 6144n);
  assert.equal(engine.calculate(18, 4, settings).L, 6144n);
  assert.equal(engine.calculate(17, 3, { ...settings, literature: false }).L, 5312n);
  const record = engine.calculate(18, 4, settings).cs.find(claim => claim.source === 'P');
  const format = createFormatters(dataset);
  assert.equal(format.boundAttributions([record], 'lower'), 'Milshtein (2026)');
  assert(format.displayClaim(record).includes('Four New Single-Error-Correcting Binary Codes'));
  const upperOnly = { ...update, lower: undefined, upper: '6551', references: ['tseng2023'] };
  const upperDataset = { ...data, literature_claims: [upperOnly] };
  const result = createEngine(upperDataset).calculate(17, 3, { litsyn: false, brouwer: false, theorems: false });
  assert.equal(result.L, null);
  assert.equal(result.status, 'upper');
  assert(!createFormatters(upperDataset).displayClaim(result.cs[0]).includes('— ≤'));
});
