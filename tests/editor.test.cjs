const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Model = require('../src/editor-model.js');
const Editor = require('../src/editor.js');
const { mountEditor } = require('./editor-helper.cjs');
const { mount } = require('./dom-helper.cjs');
const data = mountEditor({ deferStart: true }).data;
const claim = changes => ({ n: 17, d: 3, lower: '6144', references: ['milshtein2026'], active: true, ...changes });

test('reference edits preserve fingerprints and bound updates round-trip in the source bundle', () => {
  const original = Model.createDraft(data);
  const updated = Model.saveReference(data, original, 'shek89', { ...original.citations.shek89, citation: 'Corrected full citation.' });
  assert.equal(updated.draft.citations.shek89.source_sha256, original.citations.shek89.source_sha256);
  assert.notEqual(updated.draft.citations.shek89.citation, original.citations.shek89.citation);
  const added = Model.saveClaim(data, updated.draft, null, claim());
  const bundle = Model.exportBundle(data, added.draft);
  assert.deepEqual(Model.importBundle(data, JSON.parse(JSON.stringify(bundle))), added.draft);
  assert.equal(bundle.files['data/literature_claims.json'][0].lower, '6144');
  assert.equal(original.claims.length, 0);
});

test('editor rejects contradictory parity bounds, unknown references and imprecise numbers', () => {
  const draft = Model.createDraft(data);
  for (const values of [claim({ upper: '6000', lower: '' }), claim({ n: 36, d: 22, lower: '6' }),
    claim({ references: ['unknown'] }), claim({ lower: 6144 }), claim({ n: 513 }), claim({ lower: '1e10' })]) {
    assert.throws(() => Model.saveClaim(data, draft, null, values));
  }
  const first = Model.saveClaim(data, draft, null, claim());
  assert.throws(() => Model.saveClaim(data, first.draft, null, claim({ n: 18, d: 4, lower: '', upper: '6000' })), /Conflicting/);
  const inactive = Model.saveClaim(data, draft, null, claim({ lower: '999999', active: false }));
  assert.equal(inactive.draft.claims[0].active, false);
  const exact = '9007199254740993';
  assert.equal(Model.saveClaim(data, draft, null, claim({ n: 512, d: 1, lower: exact })).draft.claims[0].lower, exact);
});

test('stale or foreign bundles and changed archive fingerprints are rejected', () => {
  const draft = Model.createDraft(data), bundle = Model.exportBundle(data, draft);
  assert.throws(() => Model.importBundle(data, { ...bundle, base_version: 'old' }), /another dataset/);
  assert.throws(() => Model.importBundle(data, { ...bundle, files: { ...bundle.files, '../index.html': 'wrong' } }), /update bundle/);
  draft.citations.shek89.source_sha256 = 'changed';
  assert.throws(() => Model.validateDraft(data, draft), /fingerprint/);
});

test('forms save references and bounds, restore local drafts and download the matching source files', async () => {
  const page = mountEditor({ hash: '#A-17-3' }), q = id => page.elements.get(id);
  q('referenceAuthors').value = 'Test Author\nSecond Author'; q('referenceYear').value = '2026';
  q('referenceCitation').value = 'A full citation for a maintenance test.'; q('referenceURL').value = 'https://example.org/paper';
  q('referenceKind').value = 'paper'; q('referenceForm').submit();
  const key = Object.keys(page.app.getDraft().citations).find(key => key.startsWith('ref-test-author'));
  assert(key); assert(q('claimReferences').selectedOptions.some(option => option.value === key));
  q('claimLower').value = '6144'; q('claimForm').submit();
  assert.equal(page.app.getDraft().claims.length, 1);
  assert.equal(q('claimFeedback').textContent, 'Saved to draft.');
  q('downloadBundle').click();
  const bundle = JSON.parse(await page.downloads[0].blob.text());
  assert.deepEqual(Model.importBundle(data, bundle), page.app.getDraft());
  q('downloadClaims').click(); q('downloadReferences').click();
  assert.equal(page.downloads[1].filename, 'literature_claims.json');
  assert.equal(JSON.parse(await page.downloads[2].blob.text())[key].authors[1], 'Second Author');
  const restored = mountEditor({ stored: page.stored });
  assert.deepEqual(restored.app.getDraft(), page.app.getDraft());
  q('claimUpper').value = '6000'; q('claimForm').submit();
  assert.equal(page.app.getDraft().claims[0].upper, undefined);
  assert(q('claimFeedback').classes.has('editor-error'));
});

test('import and reset clear stale forms, and unavailable browser storage permits export', async () => {
  const page = mountEditor({ window: { localStorage: { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } } } });
  const q = id => page.elements.get(id);
  page.app.loadReference('shek89'); q('referenceCitation').value = 'Updated citation.'; q('referenceForm').submit();
  assert(q('editorStatus').textContent.includes('memory'));
  const bundle = Model.exportBundle(data, page.app.getDraft());
  q('claimLower').value = 'stale'; q('importBundle').files = [{ text: async () => JSON.stringify(bundle) }];
  await q('importBundle').listeners.change();
  assert.equal(q('claimLower').value, '');
  q('resetDraft').click();
  assert.deepEqual(page.app.getDraft(), Model.createDraft(data));
  q('downloadBundle').click(); assert.equal(page.downloads.length, 1);
});

test('editor loads and retries with relative manifest paths under a Pages project prefix', async () => {
  let fail = true;
  const requested = [];
  const page = mountEditor({ deferStart: true, window: { fetch: async url => {
    requested.push(url);
    if (fail) throw Error('Offline');
    const pathname = new URL(url).pathname;
    assert(pathname.startsWith('/repository/data/'));
    const contents = fs.readFileSync(path.resolve(__dirname, '../dist', pathname.slice('/repository/'.length)), 'utf8');
    return { ok: true, json: async () => JSON.parse(contents) };
  } } });
  await assert.rejects(Editor.start(page.document, page.window), /Offline/);
  assert.equal(page.elements.get('editorRetry').hidden, false);
  fail = false;
  assert(await Editor.start(page.document, page.window));
  assert.equal(page.elements.get('editorContent').hidden, false);
  assert.equal(page.elements.get('editorRetry').hidden, true);
  assert.equal(requested.length, 4);
});

test('requested cleanup and context-aware editor links remain in both table editions', () => {
  for (const filename of ['../dist/index.html', '../src/app.js', '../src/format.js']) {
    const text = fs.readFileSync(path.join(__dirname, filename), 'utf8');
    assert(!/preview|Example: a newer lower bound|For odd distance, A\(n,d\) = A\(n\+1,d\+1\)/i.test(text));
  }
  const portable = mount(); portable.app.choose(17, 3);
  assert(portable.elements.get('detail').innerHTML.includes('./dist/editor.html#A-17-3'));
  const hosted = mount('', {}, { edition: 'external', deferStart: true });
  // The maintained app receives data separately and uses a sibling editor URL.
  const { createApp } = require('../src/app.js');
  const app = createApp(hosted.document, hosted.window, { data }); app.choose(17, 3);
  assert(hosted.elements.get('detail').innerHTML.includes('./editor.html#A-17-3'));
});
