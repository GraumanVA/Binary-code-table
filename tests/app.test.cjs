const test = require('node:test');
const assert = require('node:assert/strict');
const { mount } = require('./dom-helper.cjs');

test('filters apply during an invalid range draft, including CSV exports', async () => {
  const page = mount();
  page.elements.get('nEnd').value = '1';
  page.elements.get('nEnd').listeners.change();
  page.elements.get('brouwer').checked = false;
  page.elements.get('brouwer').listeners.change();
  assert.equal(page.app.state.brouwer, false);
  assert.equal(page.app.state.nEnd, 32);
  assert.equal(page.elements.get('nEnd').value, '1');
  assert.equal(page.app.engine.calculate(17, 3, page.app.state).L, 5312n);
  page.app.startExport();
  await page.app.getExport().promise;
  const csv = await page.downloads[0].blob.text();
  assert(!csv.includes('Brouwer 2026'));
  assert(csv.includes('"17","3","5312"'));
});

test('shared links restore filters, parity, ranges, selection and snapshot version', () => {
  const original = mount();
  original.elements.get('brouwer').checked = false;
  original.elements.get('nEnd').value = '200';
  original.elements.get('brouwer').listeners.change();
  original.app.choose(17, 3);
  const route = original.window.location.hash;
  assert(route.includes('brouwer=0'));
  assert(route.includes('v=snapshot-'));
  const reopened = mount(route);
  assert.deepEqual(reopened.app.state, original.app.state);
  assert.equal(reopened.elements.get('brouwer').checked, false);
  assert.equal(reopened.app.engine.calculate(17, 3, reopened.app.state).L, 5312n);
});

test('legacy links work and mismatched snapshot links produce a visible notice', () => {
  const legacy = mount('#A-18-4');
  assert.equal(legacy.app.state.n, 18);
  assert.equal(legacy.app.state.d, 4);
  assert.equal(legacy.app.state.parity, 'even');
  const mismatch = mount('#A-17-3?brouwer=0&v=older-snapshot');
  assert.equal(mismatch.elements.get('snapshotNotice').hidden, false);
  assert(mismatch.elements.get('snapshotNotice').textContent.includes('older-snapshot'));
});

test('large ranges remain independent and virtual rows reach the end', () => {
  const page = mount();
  for (const [key, value] of [['nStart', 1], ['nEnd', 512], ['dStart', 1], ['dEnd', 512]]) {
    page.elements.get(key).value = value;
  }
  page.elements.get('nEnd').listeners.change();
  assert.equal(page.app.state.nEnd, 512);
  assert.equal(page.app.state.dEnd, 512);
  assert.equal(page.elements.get('matrix').attributes['aria-rowcount'], '513');
  page.app.renderGridRows(true, 512 * 43);
  assert(page.elements.get('matrixBody').innerHTML.includes('data-n="512"'));
  assert(page.elements.get('matrixBody').innerHTML.includes('data-d="511"'));
});

test('worker export uses a frozen snapshot, reports progress and can be cancelled', () => {
  let worker;
  class FakeWorker {
    constructor() { worker = this; }
    postMessage(message) { this.message = message; }
    terminate() { this.terminated = true; }
  }
  const page = mount('', { Worker: FakeWorker });
  page.app.startExport();
  assert.equal(page.elements.get('export').disabled, true);
  assert.equal(worker.message.settings.brouwer, true);
  page.elements.get('brouwer').checked = false;
  page.elements.get('brouwer').listeners.change();
  assert.equal(worker.message.settings.brouwer, true);
  worker.onmessage({ data: { type: 'progress', completed: 20, total: 133 } });
  assert.equal(Number(page.elements.get('exportProgress').value), 20);
  page.app.cancelExport();
  assert(worker.terminated);
  assert.equal(page.elements.get('export').disabled, false);
  worker.onmessage({ data: { type: 'complete', blob: new Blob(['stale']), rowCount: 1 } });
  assert.equal(page.downloads.length, 0);
});

test('fallback export cancellation yields without downloading a partial file', async () => {
  const page = mount();
  page.app.startExport();
  const job = page.app.getExport();
  page.app.cancelExport();
  await job.promise;
  assert.equal(page.downloads.length, 0);
  assert.equal(page.elements.get('exportStatus').textContent, 'Export cancelled.');
});

test('compact exact products and corrected authors remain in parameter details', () => {
  const page = mount();
  page.app.choose(70, 3);
  assert(page.elements.get('detail').innerHTML.includes('1,657,009 × 2<sup>43</sup>'));
  page.app.choose(200, 29);
  assert(page.elements.get('detail').innerHTML.includes('Shekhunova, Bezzateev and Mironchikov (1989)'));
  assert(!page.elements.get('detail').innerHTML.includes('%\\bibitem'));
});
