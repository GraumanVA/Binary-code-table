/** Static maintenance forms: local drafts and exported source files, no credentials. */
(function (root) {
  'use strict';
  const Model = root.AtlasEditorModel || require('./editor-model.js');
  const Data = root.AtlasData || require('./data.js');
  const Bounds = root.AtlasBounds || require('./bounds.js');
  const Format = root.AtlasFormat || require('./format.js');

  function createEditor(document, window, dataset) {
    const q = id => document.getElementById(id), format = Format.createFormatters(dataset);
    const storageKey = `atlas-editor:${window.location.pathname}:${dataset.metadata.version}`;
    let draft = Model.createDraft(dataset), editingClaim = null, editingReference = null;
    let storageAvailable = true;
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) draft = Model.validateDraft(dataset, JSON.parse(saved));
    } catch (_) { storageAvailable = false; }

    function status(text, error = false) {
      q('editorStatus').textContent = text;
      q('editorStatus').classList.toggle('editor-error', error);
    }

    function remember() {
      try { window.localStorage.setItem(storageKey, JSON.stringify(draft)); }
      catch (_) { storageAvailable = false; }
      status(storageAvailable ? 'Draft saved in this browser. Download the changes when ready.'
        : 'Draft held in memory. Download the changes before closing this page.');
    }

    function selectedReferences() { return Array.from(q('claimReferences').selectedOptions).map(option => option.value); }
    function option(value, text, selected = false) {
      return `<option value="${format.esc(value)}"${selected ? ' selected' : ''}>${format.esc(text)}</option>`;
    }
    function referenceLabel(key) {
      const reference = draft.citations[key];
      return `${reference.authors.join(', ')}${reference.year ? ' ('+reference.year+')' : ''} — ${key}`;
    }

    function refreshLists(selected = selectedReferences()) {
      q('claimSelect').innerHTML = draft.claims.map(row => option(row.id,
        `A(${row.n},${row.d}): ${row.lower || '…'}–${row.upper || '…'}${row.active === false ? ' (inactive)' : ''}`,
        row.id === editingClaim)).join('');
      const keys = Object.keys(draft.citations).sort((a, b) => referenceLabel(a).localeCompare(referenceLabel(b)));
      q('claimReferences').innerHTML = keys.map(key => option(key, referenceLabel(key), selected.includes(key))).join('');
      const search = q('referenceSearch').value.toLowerCase().trim();
      q('referenceSelect').innerHTML = keys.filter(key => `${referenceLabel(key)} ${draft.citations[key].citation}`.toLowerCase().includes(search))
        .map(key => option(key, referenceLabel(key), key === editingReference)).join('');
    }

    function showCurrentBound() {
      const n = Number(q('claimN').value), d = Number(q('claimD').value);
      if (![n, d].every(value => Number.isInteger(value) && value >= 1 && value <= 512)) { q('currentBound').textContent = ''; return; }
      const engine = Bounds.createEngine({ ...dataset, literature_claims: draft.claims });
      const result = engine.calculate(n, d);
      q('currentBound').innerHTML = `Current draft table: ${format.boundNumber(result.L, result.cs, 'lower')} ≤ A(${n},${d}) ≤ ${format.boundNumber(result.U, result.cs, 'upper')}`;
    }

    function newClaim() {
      editingClaim = null;
      q('claimLower').value = ''; q('claimUpper').value = ''; q('claimLocator').value = '';
      q('claimActive').checked = true; q('claimFeedback').textContent = '';
      refreshLists([]); showCurrentBound();
    }

    function loadClaim(id) {
      const row = draft.claims.find(item => item.id === id);
      if (!row) return;
      editingClaim = id;
      q('claimN').value = row.n; q('claimD').value = row.d;
      q('claimLower').value = row.lower || ''; q('claimUpper').value = row.upper || '';
      q('claimLocator').value = row.source_locator || ''; q('claimActive').checked = row.active !== false;
      refreshLists(row.references); showCurrentBound();
    }

    function newReference() {
      editingReference = null;
      for (const id of ['referenceAuthors', 'referenceYear', 'referenceCitation', 'referenceURL']) q(id).value = '';
      q('referenceKind').value = 'paper'; q('referenceFeedback').textContent = '';
    }

    function loadReference(key) {
      const reference = draft.citations[key];
      if (!reference) return;
      editingReference = key;
      q('referenceAuthors').value = reference.authors.join('\n');
      q('referenceYear').value = reference.year; q('referenceCitation').value = reference.citation;
      q('referenceURL').value = reference.url || ''; q('referenceKind').value = reference.kind || 'paper';
    }

    function feedback(id, action) {
      try { action(); q(id).textContent = 'Saved to draft.'; q(id).classList.remove('editor-error'); }
      catch (error) { q(id).textContent = error.message; q(id).classList.add('editor-error'); }
    }

    function download(filename, value) {
      Model.validateDraft(dataset, draft);
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(new window.Blob([JSON.stringify(value, null, 2)+'\n'], { type: 'application/json' }));
      link.download = filename; document.body.append(link); link.click();
      window.setTimeout(() => { window.URL.revokeObjectURL(link.href); link.remove(); }, 1000);
      status('Download ready. Commit the updated data files to publish the changes.');
    }

    q('claimForm').addEventListener('submit', event => {
      event.preventDefault();
      feedback('claimFeedback', () => {
        const result = Model.saveClaim(dataset, draft, editingClaim, {
          n: Number(q('claimN').value), d: Number(q('claimD').value),
          lower: q('claimLower').value.trim(), upper: q('claimUpper').value.trim(),
          references: selectedReferences(), source_locator: q('claimLocator').value.trim(), active: q('claimActive').checked,
        });
        draft = result.draft; editingClaim = result.id; refreshLists(); showCurrentBound(); remember();
      });
    });
    q('referenceForm').addEventListener('submit', event => {
      event.preventDefault();
      feedback('referenceFeedback', () => {
        const selected = selectedReferences();
        const result = Model.saveReference(dataset, draft, editingReference, {
          authors: q('referenceAuthors').value.split(/\n/).map(name => name.trim()).filter(Boolean),
          year: q('referenceYear').value.trim(), citation: q('referenceCitation').value.trim(),
          url: q('referenceURL').value.trim(), kind: q('referenceKind').value,
        });
        draft = result.draft; editingReference = result.key;
        refreshLists([...new Set([...selected, result.key])]); remember();
      });
    });
    q('claimSelect').addEventListener('change', () => loadClaim(q('claimSelect').value));
    q('referenceSelect').addEventListener('change', () => loadReference(q('referenceSelect').value));
    q('referenceSearch').addEventListener('input', () => refreshLists());
    q('newClaim').addEventListener('click', newClaim);
    q('newReference').addEventListener('click', newReference);
    for (const id of ['claimN', 'claimD']) q(id).addEventListener('input', showCurrentBound);
    q('downloadClaims').addEventListener('click', () => download('literature_claims.json', draft.claims));
    q('downloadReferences').addEventListener('click', () => download('citations.json', draft.citations));
    q('downloadBundle').addEventListener('click', () => download('bounds-update.json', Model.exportBundle(dataset, draft)));
    q('importBundle').addEventListener('change', async () => {
      try {
        const file = q('importBundle').files[0]; if (!file) return;
        draft = Model.importBundle(dataset, JSON.parse(await file.text()));
        editingClaim = null; editingReference = null; newClaim(); newReference(); remember();
      } catch (error) { status(error.message, true); }
    });
    q('resetDraft').addEventListener('click', () => {
      if (!window.confirm('Discard this browser draft and reload the published records?')) return;
      draft = Model.createDraft(dataset); editingClaim = null; editingReference = null;
      newClaim(); newReference(); remember();
    });
    const parameter = window.location.hash.match(/^#A-(\d+)-(\d+)$/);
    if (parameter) { q('claimN').value = parameter[1]; q('claimD').value = parameter[2]; }
    refreshLists([]); showCurrentBound(); q('editorContent').hidden = false;
    status(`Editing ${dataset.metadata.version}. Saved changes are drafts until committed to the repository.`);
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
