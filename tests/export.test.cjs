const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { generateCSV } = require('../src/export.js');
const { createEngine } = require('../src/bounds.js');
const { defaults } = require('../src/state.js');
const html = fs.readFileSync(path.join(__dirname, '../coding_bounds.html'), 'utf8');
const data = JSON.parse(html.match(/<script id="seed" type="application\/json">([\s\S]*?)<\/script>/)[1]);

test('CSV uses exact integers, version and a frozen source snapshot', async () => {
  const settings = { ...defaults, nStart: 17, nEnd: 17, dStart: 3, dEnd: 3, version: data.metadata.version };
  let first = true;
  const result = await generateCSV(createEngine(data), settings, {
    yieldControl: async () => { if (first) { first = false; settings.brouwer = false; } },
  });
  const csv = result.parts.join('');
  assert.equal(result.rowCount, 1);
  assert(csv.includes('"17","3","6144","6551"'));
  assert(csv.includes(data.metadata.version));
  assert.equal(result.settings.brouwer, true);
});

test('the entire supported range is exported in chunks, including unmounted rows', async () => {
  const engine = { calculate(n, d) { return { L: BigInt(n), U: BigInt(n + d), status: 'interval', cs: [] }; } };
  let yields = 0, progress = 0;
  const settings = { ...defaults, nStart: 1, nEnd: 512, dStart: 1, dEnd: 512, parity: 'all' };
  const result = await generateCSV(engine, settings, {
    onProgress: value => { progress = value.completed; },
    yieldControl: async () => { yields++; },
    timeBudgetMs: 0,
  });
  assert.equal(result.rowCount, 262144);
  assert.equal(progress, 262144);
  assert(yields > 1);
  assert(result.parts.at(-1).includes('"512","512","512","1024"'));
  assert(result.parts.length > 1000);
});

test('cancelled exports stop before producing a downloadable result', async () => {
  const signal = { aborted: false };
  await assert.rejects(generateCSV(createEngine(data), defaults, {
    signal, yieldControl: async () => { signal.aborted = true; },
  }), { name: 'AbortError' });
});

test('the built worker completes a real large export while the main thread stays responsive', { timeout: 120000 }, async () => {
  const code = JSON.parse(html.match(/<script id="exportWorker" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  const adapter = `
    const { parentPort, workerData } = require('node:worker_threads');
    const vm = require('node:vm');
    const context = vm.createContext({ Blob, performance, setTimeout, URLSearchParams,
      postMessage: message => parentPort.postMessage(message) });
    vm.runInContext(workerData.code, context);
    parentPort.on('message', message => context.onmessage({ data: message }));
  `;
  const worker = new Worker(adapter, { eval: true, workerData: { code } });
  let heartbeats = 0, messages = 0;
  const timer = setInterval(() => { heartbeats++; }, 5);
  try {
    const result = await new Promise((resolve, reject) => {
      worker.on('error', reject);
      worker.on('message', message => {
        if (message.type === 'progress') messages++;
        if (message.type === 'error') reject(new Error(message.message));
        if (message.type === 'complete') resolve(message);
      });
      worker.postMessage({ data, settings: { ...defaults, nStart: 1, nEnd: 512,
        dStart: 3, dEnd: 63, version: data.metadata.version } });
    });
    assert.equal(result.rowCount, 15872);
    assert(heartbeats > 0);
    assert(messages > 1);
    const csv = await result.blob.text();
    assert(csv.includes('"17","3","6144","6551"'));
    assert(csv.includes('"512","63"'));
  } finally {
    clearInterval(timer);
    await worker.terminate();
  }
});
