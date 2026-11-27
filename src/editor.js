/** Static maintenance forms: local drafts and exported source files, no credentials. */
(function (root) {
  'use strict';
  const Model = root.AtlasEditorModel || require('./editor-model.js');
  const Data = root.AtlasData || require('./data.js');
  const Bounds = root.AtlasBounds || require('./bounds.js');
  const Format = root.AtlasFormat || require('./format.js');
  const MathRules = root.AtlasMath || require('./math.js');
  const sides = ['lower', 'upper'];

  function createEditor(document, window, dataset) {
    const q = id => document.getElementById(id), format = Format.createFormatters(dataset);
    const storageKey = `atlas-editor:${window.location.pathname}`;
    let draft = Model.createDraft(dataset), editingClaim = null, editingReference = null;
    let storageAvailable = true, pendingBundle = null, draftError = '';
    try {
      const storage = window.localStorage;
      const saved = storage.getItem(storageKey);
      if (saved) {
        pendingBundle = JSON.parse(saved);
      } else {
        const currentKey = `${storageKey}:${dataset.metadata.version}`;
        const priorKey = Array.from({ length: storage.length || 0 }, (_, i) => storage.key(i))
          .filter(key => key?.startsWith(`${storageKey}:`)).at(-1);
        const legacy = storage.getItem(currentKey) || (priorKey && storage.getItem(priorKey));
        if (legacy) {
          const value = JSON.parse(legacy);
          pendingBundle = { format: 'a-nd-update', schema_version: 1, base_version: value.base_version,
            files: { 'data/citations.json': value.citations, 'data/literature_claims.json': value.claims } };
        }
      }
    } catch (_) { storageAvailable = false; }
    if (pendingBundle) {
      try { draft = Model.importBundle(dataset, pendingBundle); pendingBundle = null; }
      catch (error) { draftError = error.message; }
    }

    function status(text, error = false) {
      q('editorStatus').textContent = text;
      q('editorStatus').classList.toggle('editor-error', error);
    }

    function remember() {
      refreshChanges();
      if (pendingBundle) {
        status(`A saved draft needs review. ${draftError} Download it before discarding it. Download current changes to keep them.`, true);
        return;
      }
      try { window.localStorage.setItem(storageKey, JSON.stringify(Model.exportBundle(dataset, draft))); }
      catch (_) { storageAvailable = false; }
      status(storageAvailable ? 'Draft saved in this browser.'
        : 'Draft held in memory. Download the changes before closing this page.');
    }

    function selectedReferences(side) {
      return Array.from(q(`${side}References`).selectedOptions).map(option => option.value);
    }
    function option(value, text, selected = false) {
      return `<option value="${format.esc(value)}"${selected ? ' selected' : ''}>${format.esc(text)}</option>`;
    }
    function referenceLabel(key) {
      const reference = draft.citations[key];
      return `${reference.authors.join(', ')}${reference.year ? ' ('+reference.year+')' : ''} — ${key}`;
    }

    function scopedClaims() {
      if (q('allClaims').checked) return draft.claims;
      const pair = MathRules.oddPartner(Number(q('claimN').value), Number(q('claimD').value));
      return draft.claims.filter(row => {
        const origin = MathRules.oddPartner(row.n, row.d);
        return origin.n === pair.n && origin.d === pair.d;
      });
    }

    function refreshClaims() {
      const rows = scopedClaims();
      q('claimSelect').innerHTML = option('', rows.length ? 'Choose a record or add a new bound' : 'No literature records for these parameters', !editingClaim)
        + rows.map(row => option(row.id,
        `A(${row.n},${row.d}): ${row.lower || '…'}–${row.upper || '…'}${row.active === false ? ' (inactive)' : ''}`,
        row.id === editingClaim)).join('');
    }

    function refreshReferences(selected = Object.fromEntries(sides.map(side => [side, selectedReferences(side)]))) {
      const keys = Object.keys(draft.citations).sort((a, b) => referenceLabel(a).localeCompare(referenceLabel(b)));
      const matches = (key, search) => `${referenceLabel(key)} ${draft.citations[key].citation}`.toLowerCase().includes(search);
      for (const side of sides) {
        const search = q(`${side}ReferenceSearch`).value.trim().toLowerCase();
        q(`${side}References`).innerHTML = keys.filter(key => selected[side].includes(key) || matches(key, search))
          .map(key => option(key, referenceLabel(key), selected[side].includes(key))).join('');
      }
      const search = q('referenceSearch').value.trim().toLowerCase();
      q('referenceSelect').innerHTML = option('', 'Choose a reference', !editingReference) + keys.filter(key => matches(key, search))
        .map(key => option(key, referenceLabel(key), key === editingReference)).join('');
      q('useLowerReference').disabled = q('useUpperReference').disabled = !editingReference;
    }

    function refreshChanges() {
      const changes = Model.diff(dataset, draft);
      const items = [...changes.claims, ...changes.citations].map(({ key, before, after }) => {
        const record = after ?? before;
        const action = before === null ? 'Add' : after === null ? 'Remove' : 'Edit';
        const label = record.id ? `A(${record.n},${record.d}) ${key}` : key;
        const text = value => value === null ? 'Absent' : JSON.stringify(value, null, 2);
        return `<li><details><summary>${format.esc(`${action} ${label}`)}</summary>
          <h3>Before</h3><pre>${format.esc(text(before))}</pre>
          <h3>After</h3><pre>${format.esc(text(after))}</pre></details></li>`;
      });
      q('draftChanges').innerHTML = items.join('');
      q('draftChanges').hidden = !items.length;
      q('emptyChanges').hidden = !!items.length;
      q('downloadPending').hidden = !pendingBundle;
    }

    function showCurrentBound() {
      const n = Number(q('claimN').value), d = Number(q('claimD').value);
      if (![n, d].every(value => Number.isInteger(value) && value >= 1 && value <= 512)) {
        q('editorBack').href = './index.html';
        q('currentBound').textContent = '';
        return;
      }
      q('editorBack').href = `./index.html#A-${n}-${d}`;
      const engine = Bounds.createEngine({ ...dataset, literature_claims: draft.claims });
      const result = engine.calculate(n, d);
      q('currentBound').innerHTML = `Current draft table: ${format.boundNumber(result.L, result.cs, 'lower')} ≤ A(${n},${d}) ≤ ${format.boundNumber(result.U, result.cs, 'upper')}`;
    }

    function newClaim() {
      editingClaim = null;
      q('claimLower').value = ''; q('claimUpper').value = '';
      for (const side of sides) { q(`${side}Locator`).value = ''; q(`${side}ReferenceSearch`).value = ''; }
      q('claimActive').checked = true; q('claimFeedback').textContent = '';
      refreshClaims(); refreshReferences({ lower: [], upper: [] }); showCurrentBound();
    }

    function loadClaim(id) {
      const row = draft.claims.find(item => item.id === id);
      if (!row) return;
      editingClaim = id;
      q('claimN').value = row.n; q('claimD').value = row.d;
      q('claimLower').value = row.lower || ''; q('claimUpper').value = row.upper || '';
      const selected = {};
      for (const side of sides) {
        q(`${side}Locator`).value = row[side] ? Model.evidence(row, side, 'source_locator') || '' : '';
        q(`${side}ReferenceSearch`).value = '';
        selected[side] = row[side] ? Model.evidence(row, side, 'references') : [];
      }
      q('claimActive').checked = row.active !== false;
      refreshClaims(); refreshReferences(selected); showCurrentBound();
    }

    function newReference() {
      editingReference = null;
      for (const id of ['referenceAuthors', 'referenceYear', 'referenceCitation', 'referenceURL']) q(id).value = '';
      q('referenceKind').value = 'paper'; q('referenceFeedback').textContent = '';
      refreshReferences();
    }

    function loadReference(key) {
      const reference = draft.citations[key];
      if (!reference) return;
      editingReference = key;
      q('referenceAuthors').value = reference.authors.join('\n');
      q('referenceYear').value = reference.year; q('referenceCitation').value = reference.citation;
      q('referenceURL').value = reference.url || ''; q('referenceKind').value = reference.kind || 'paper';
      q('useLowerReference').disabled = q('useUpperReference').disabled = false;
    }

    function feedback(id, action) {
      try { action(); q(id).textContent = 'Saved to draft.'; q(id).classList.remove('editor-error'); }
      catch (error) { q(id).textContent = error.message; q(id).classList.add('editor-error'); }
    }

    function download(filename, value) {
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(new window.Blob([JSON.stringify(value, null, 2)+'\n'], { type: 'application/json' }));
      link.download = filename; document.body.append(link); link.click();
      window.setTimeout(() => { window.URL.revokeObjectURL(link.href); link.remove(); }, 1000);
      status('Download ready.');
    }

    q('claimForm').addEventListener('submit', event => {
      event.preventDefault();
      feedback('claimFeedback', () => {
        const result = Model.saveClaim(dataset, draft, editingClaim, {
          n: Number(q('claimN').value), d: Number(q('claimD').value),
          lower: q('claimLower').value.trim(), upper: q('claimUpper').value.trim(),
          lower_references: selectedReferences('lower'), lower_source_locator: q('lowerLocator').value.trim(),
          upper_references: selectedReferences('upper'), upper_source_locator: q('upperLocator').value.trim(),
          active: q('claimActive').checked,
        });
        draft = result.draft; editingClaim = result.id; refreshClaims(); showCurrentBound(); remember();
      });
    });
    q('referenceForm').addEventListener('submit', event => {
      event.preventDefault();
      feedback('referenceFeedback', () => {
        const result = Model.saveReference(dataset, draft, editingReference, {
          authors: q('referenceAuthors').value.split(/\n/).map(name => name.trim()).filter(Boolean),
          year: q('referenceYear').value.trim(), citation: q('referenceCitation').value.trim(),
          url: q('referenceURL').value.trim(), kind: q('referenceKind').value,
        });
        draft = result.draft; editingReference = result.key;
        refreshReferences(); remember();
      });
    });
    q('claimSelect').addEventListener('change', () => {
      if (q('claimSelect').value) loadClaim(q('claimSelect').value);
      else newClaim();
    });
    q('referenceSelect').addEventListener('change', () => {
      if (q('referenceSelect').value) loadReference(q('referenceSelect').value);
      else newReference();
    });
    q('referenceSearch').addEventListener('input', () => refreshReferences());
    q('newClaim').addEventListener('click', newClaim);
    q('newReference').addEventListener('click', newReference);
    for (const id of ['claimN', 'claimD']) q(id).addEventListener('input', () => { refreshClaims(); showCurrentBound(); });
    q('allClaims').addEventListener('change', refreshClaims);
    for (const side of sides) {
      q(`${side}ReferenceSearch`).addEventListener('input', () => refreshReferences());
      const label = side === 'lower' ? 'Lower' : 'Upper';
      q(`use${label}Reference`).addEventListener('click', () => {
        if (!editingReference) return;
        const selected = Object.fromEntries(sides.map(item => [item, selectedReferences(item)]));
        if (!selected[side].includes(editingReference)) selected[side].push(editingReference);
        refreshReferences(selected);
      });
    }
    q('downloadBundle').addEventListener('click', () => download('bounds-update.json', Model.exportBundle(dataset, draft)));
    q('downloadPending').addEventListener('click', () => {
      if (pendingBundle) download('unresolved-bounds-update.json', pendingBundle);
    });
    q('importBundle').addEventListener('change', async () => {
      try {
        const file = q('importBundle').files[0]; if (!file) return;
        draft = Model.importBundle(dataset, JSON.parse(await file.text()), draft);
        editingClaim = null; editingReference = null; newClaim(); newReference(); remember();
      } catch (error) { status(error.message, true); }
      finally { q('importBundle').value = ''; }
    });
    q('resetDraft').addEventListener('click', () => {
      if (!window.confirm('Discard the current and unresolved drafts?')) return;
      pendingBundle = null; draftError = '';
      draft = Model.createDraft(dataset); editingClaim = null; editingReference = null;
      newClaim(); newReference(); remember();
    });
    const parameter = window.location.hash.match(/^#A-(\d+)-(\d+)$/);
    if (parameter) { q('claimN').value = parameter[1]; q('claimD').value = parameter[2]; }
    newClaim();
    if (parameter && scopedClaims().length === 1) loadClaim(scopedClaims()[0].id);
    refreshChanges(); q('editorContent').hidden = false;
    if (pendingBundle) {
      status(`A saved draft needs review. ${draftError} You can download it below.`, true);
    } else if (!storageAvailable) {
      status('Draft held in memory. Download changes before closing this page.');
    } else {
      status(`Editing ${dataset.metadata.version}.`);
    }
    return { getDraft: () => draft, loadClaim, loadReference, newClaim, newReference, download };
  }

  async function start(document, window) {
    const status = document.getElementById('editorStatus'), retry = document.getElementById('editorRetry');
    try {
      if (window.location.protocol === 'file:') throw new Error('Open the editor through the local server or published website.');
      const config = JSON.parse(document.getElementById('editorConfig').textContent);
      const dataset = await Data.loadDataset(new URL(config.manifest, window.location.href).href, window.fetch.bind(window));
      retry.hidden = true;
      return createEditor(document, window, dataset);
    } catch (error) {
      status.textContent = `Could not load the editor. ${error.message}`;
      retry.hidden = false; retry.onclick = () => { start(document, window).catch(() => {}); };
      throw error;
    }
  }

  const api = { createEditor, start };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.AtlasEditor = api; root.AtlasEditorReady = start(root.document, root); root.AtlasEditorReady.catch(() => {}); }
})(globalThis);
