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
  assert.equal(bundle.changes.claims[0].after.lower, '6144');
  assert.equal(bundle.changes.claims[0].before, null);
  assert.deepEqual(bundle.changes.citations.map(change => change.key), ['shek89']);
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

test('legacy and foreign bundles are checked, while per-record bundles survive unrelated updates', () => {
  const draft = Model.createDraft(data), bundle = Model.exportBundle(data, draft);
  const legacy = { format: 'a-nd-update', schema_version: 1, base_version: data.metadata.version,
    files: { 'data/citations.json': draft.citations, 'data/literature_claims.json': draft.claims } };
  assert.deepEqual(Model.importBundle(data, legacy), draft);
  assert.throws(() => Model.importBundle(data, { ...legacy, base_version: 'old' }), /another dataset/);
  assert.throws(() => Model.importBundle(data, {
    ...bundle, changes: { ...bundle.changes, '../index.html': 'wrong' },
  }), /update bundle/);
  const changed = Model.saveReference(data, draft, 'shek89', { citation: 'My correction.' }).draft;
  const edited = Model.exportBundle(data, changed);
  const newer = { ...data, metadata: { ...data.metadata, version: 'new' }, citation_metadata: {
    ...data.citation_metadata, cord67: { ...data.citation_metadata.cord67, citation: 'Another correction.' },
  } };
  const merged = Model.importBundle(newer, edited);
  assert.equal(merged.citations.cord67.citation, 'Another correction.');
  assert.equal(merged.citations.shek89.citation, 'My correction.');
  assert.throws(() => Model.importBundle({
    ...newer, citation_metadata: { ...newer.citation_metadata,
      shek89: { ...newer.citation_metadata.shek89, citation: 'Conflicting correction.' } },
  }, edited), /Conflicting update records: shek89/);
  draft.citations.shek89.source_sha256 = 'changed';
  assert.throws(() => Model.validateDraft(data, draft), /fingerprint/);
});

test('forms draft side-specific evidence, show changes, and recover a patch after publication', async () => {
  const page = mountEditor({ hash: '#A-17-3' }), q = id => page.elements.get(id);
  q('referenceAuthors').value = 'Test Author\nSecond Author'; q('referenceYear').value = '2026';
  q('referenceCitation').value = 'A full citation for a maintenance test.'; q('referenceURL').value = 'https://example.org/paper';
  q('referenceKind').value = 'paper'; q('referenceForm').submit();
  const key = Object.keys(page.app.getDraft().citations).find(key => key.startsWith('ref-test-author'));
  assert(key);
  q('useLowerReference').click();
  assert(q('lowerReferences').selectedOptions.some(option => option.value === key));
  q('claimLower').value = '6144'; q('lowerLocator').value = 'Theorem 1';
  q('claimUpper').value = '6551'; q('upperLocator').value = 'Table 2';
  q('upperReferences').options.find(option => option.value === 'tseng2023').selected = true;
  q('claimForm').submit();
  assert.equal(page.app.getDraft().claims.length, 1);
  assert.equal(q('claimFeedback').textContent, 'Saved to draft.');
  q('downloadBundle').click();
  const bundle = JSON.parse(await page.downloads[0].blob.text());
  assert.deepEqual(Model.importBundle(data, bundle), page.app.getDraft());
  const row = bundle.changes.claims[0].after;
  assert.deepEqual(row.lower_references, [key]);
  assert.deepEqual(row.upper_references, ['tseng2023']);
  assert.equal(row.lower_source_locator, 'Theorem 1');
  assert.equal(row.upper_source_locator, 'Table 2');
  assert.equal(bundle.changes.citations[0].after.authors[1], 'Second Author');
  assert(q('draftChanges').innerHTML.includes('A(17,3)'));
  const newer = { ...data, metadata: { ...data.metadata, version: 'new' } };
  const restored = mountEditor({ stored: page.stored, data: newer, hash: '#A-18-4' });
  assert.deepEqual(restored.app.getDraft().claims, page.app.getDraft().claims);
  assert.equal(restored.elements.get('claimLower').value, '6144');
  q('claimUpper').value = '6000'; q('claimForm').submit();
  assert.equal(page.app.getDraft().claims[0].upper, '6551');
  assert(q('claimFeedback').classes.has('editor-error'));
});

test('conflicting saved patches remain available to download', async () => {
  const page = mountEditor();
  page.app.loadReference('shek89');
  page.elements.get('referenceCitation').value = 'My correction.';
  page.elements.get('referenceForm').submit();
  const newer = { ...data, metadata: { ...data.metadata, version: 'new' }, citation_metadata: {
    ...data.citation_metadata, shek89: { ...data.citation_metadata.shek89, citation: 'Another correction.' },
  } };
  const reopened = mountEditor({ data: newer, stored: page.stored });
  assert.match(reopened.elements.get('editorStatus').textContent, /Conflicting update records: shek89/);
  assert.equal(reopened.elements.get('downloadPending').hidden, false);
  reopened.elements.get('downloadPending').click();
  const pending = JSON.parse(await reopened.downloads[0].blob.text());
  assert.equal(pending.changes.citations[0].after.citation, 'My correction.');
});

test('the table credits each side separately and keeps legacy shared evidence readable', () => {
  const { createEngine } = require('../src/bounds.js');
  const { createFormatters } = require('../src/format.js');
  const row = { id: 'PAPER-BOTH', n: 17, d: 3, lower: '6144', upper: '6551',
    lower_references: ['milshtein2026'], upper_references: ['tseng2023'],
    lower_source_locator: 'Theorem 1', upper_source_locator: 'Table 2' };
  const engine = createEngine({ ...data, literature_claims: [row] });
  const source = engine.calculate(17, 3).cs.find(item => item.record?.id === row.id);
  const format = createFormatters(data);
  assert.deepEqual(format.referenceIds(source, 'lower'), ['milshtein2026']);
  assert.deepEqual(format.referenceIds(source, 'upper'), ['tseng2023']);
  assert.match(format.displayClaim(source), /Lower bound:[^]*Theorem 1[^]*Upper bound:[^]*Table 2/);
  const legacy = { ...source, record: { references: ['milshtein2026'] } };
  assert.deepEqual(format.referenceIds(legacy, 'lower'), ['milshtein2026']);
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
  assert(portable.elements.get('detail').innerHTML.includes('../dist/editor.html#A-17-3'));
  const hosted = mount('', {}, { edition: 'external', deferStart: true });
  // The maintained app receives data separately and uses a sibling editor URL.
  const { createApp } = require('../src/app.js');
  const app = createApp(hosted.document, hosted.window, { data }); app.choose(17, 3);
  assert(hosted.elements.get('detail').innerHTML.includes('./editor.html#A-17-3'));
});
