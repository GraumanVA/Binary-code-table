/** Data-only editing and validation shared by the maintenance interface tests. */
(function (root) {
  'use strict';
  const Bounds = root.AtlasBounds || require('./bounds.js');
  const clone = value => JSON.parse(JSON.stringify(value));
  const owns = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const paths = ['data/citations.json', 'data/literature_claims.json'];

  function createDraft(dataset) {
    return { base_version: dataset.metadata.version,
      citations: clone(dataset.citation_metadata), claims: clone(dataset.literature_claims || []) };
  }

  function validateDraft(dataset, draft) {
    if (draft.base_version !== dataset.metadata.version) throw new Error('This draft belongs to another dataset. Reload the current data before editing.');
    if (!draft.citations || Array.isArray(draft.citations) || typeof draft.citations !== 'object') throw new Error('References must be an object.');
    for (const [key, reference] of Object.entries(draft.citations)) {
      if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(key) || ['constructor', 'prototype', '__proto__'].includes(key)) throw new Error('Invalid reference key.');
      if (!reference || !Array.isArray(reference.authors) || !reference.authors.length
          || reference.authors.some(author => typeof author !== 'string' || !author.trim())) throw new Error(`${key}: enter at least one author.`);
      if (typeof reference.year !== 'string' || typeof reference.citation !== 'string' || !reference.citation.trim()) throw new Error(`${key}: enter a year and full citation.`);
      if (reference.url && (typeof reference.url !== 'string' || !/^https?:\/\//.test(reference.url))) throw new Error(`${key}: source links must start with https:// or http://.`);
    }
    for (const [key, original] of Object.entries(dataset.citation_metadata)) {
      if (original.source_sha256 && (!owns(draft.citations, key) || draft.citations[key].source_sha256 !== original.source_sha256)) {
        throw new Error(`${key}: keep the original archive fingerprint.`);
      }
    }
    const required = new Set(dataset.litsyn.flatMap(row => row.refs || []));
    if (dataset.grassl?.length) required.add(dataset.metadata.grassl.reference_id);
    for (const row of dataset.grassl || []) {
      for (const key of row.references || []) required.add(key);
    }
    for (const sides of Object.values(dataset.bound_references)) {
      for (const keys of Object.values(sides)) for (const key of keys) required.add(key);
    }
    for (const key of required) if (!owns(draft.citations, key)) throw new Error(`Reference ${key} is used by a source claim.`);
    if (!Array.isArray(draft.claims)) throw new Error('Bounds must be a list.');
    const identifiers = new Set();
    for (const row of draft.claims) {
      if (!row || typeof row.id !== 'string' || !/^PAPER-[A-Za-z0-9_.:-]+$/.test(row.id)) throw new Error('Invalid bound record ID.');
      if (identifiers.has(row.id)) throw new Error(`Duplicate bound record: ${row.id}`);
      identifiers.add(row.id);
      if (![row.n, row.d].every(value => Number.isInteger(value) && value >= 1 && value <= 512)) throw new Error(`${row.id}: length and distance must be between 1 and 512.`);
      let count = 0;
      for (const side of ['lower', 'upper']) {
        if (row[side] == null) continue;
        if (typeof row[side] !== 'string' || !/^[1-9][0-9]*$/.test(row[side])) throw new Error(`${row.id}: bounds must be positive whole-number strings.`);
        count++;
      }
      if (!count) throw new Error(`${row.id}: enter a lower or upper bound.`);
      if (row.lower && row.upper && BigInt(row.lower) > BigInt(row.upper)) throw new Error(`${row.id}: lower exceeds upper.`);
      if (!Array.isArray(row.references) || !row.references.length || row.references.some(key => typeof key !== 'string' || !owns(draft.citations, key))) throw new Error(`${row.id}: choose at least one known reference.`);
      if (row.active != null && typeof row.active !== 'boolean') throw new Error(`${row.id}: active must be true or false.`);
      if (row.source_locator != null && typeof row.source_locator !== 'string') throw new Error(`${row.id}: the source locator must be text.`);
    }
    const engine = Bounds.createEngine({ ...dataset, literature_claims: draft.claims });
    for (const row of draft.claims) {
      if (row.active === false) continue;
      const result = engine.calculate(row.n, row.d);
      if (result.conflict) throw new Error(`Conflicting bounds at A(${row.n},${row.d}): ${result.L} exceeds ${result.U}.`);
    }
    return draft;
  }

  function uniqueKey(base, occupied) {
    let key = base, suffix = 2;
    while (occupied(key)) key = `${base}-${suffix++}`;
    return key;
  }

  function saveReference(dataset, draft, key, values) {
    const next = clone(draft);
    if (key && !owns(next.citations, key)) throw new Error('Reference no longer exists.');
    const slug = String(values.authors?.[0] || 'author').normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
    key = key || uniqueKey(`ref-${slug || 'author'}-${String(values.year || 'undated').replace(/[^0-9A-Za-z-]/g, '')}`, candidate => owns(next.citations, candidate));
    const entry = { ...(next.citations[key] || {}), ...values };
    if (!entry.url) delete entry.url;
    next.citations[key] = entry;
    return { draft: validateDraft(dataset, next), key };
  }

  function saveClaim(dataset, draft, id, values) {
    const next = clone(draft), index = id ? next.claims.findIndex(row => row.id === id) : -1;
    if (id && index < 0) throw new Error('Bound record no longer exists.');
    const prefix = String(values.references?.[0] || 'source').replace(/[^A-Za-z0-9_.:-]/g, '-');
    id = id || uniqueKey(`PAPER-${prefix}-${values.n}-${values.d}`, candidate => next.claims.some(row => row.id === candidate));
    const entry = { ...(index >= 0 ? next.claims[index] : {}), ...values, id };
    for (const side of ['lower', 'upper']) if (!entry[side]) delete entry[side];
    if (index >= 0) next.claims[index] = entry;
    else next.claims.push(entry);
    return { draft: validateDraft(dataset, next), id };
  }

  function exportBundle(dataset, draft) {
    validateDraft(dataset, draft);
    return { format: 'a-nd-update', schema_version: 1, base_version: draft.base_version,
      files: { 'data/citations.json': clone(draft.citations), 'data/literature_claims.json': clone(draft.claims) } };
  }

  function importBundle(dataset, bundle) {
    if (bundle?.format !== 'a-nd-update' || bundle.schema_version !== 1 || !bundle.files
        || Object.keys(bundle.files).length !== 2 || paths.some(path => !owns(bundle.files, path))) throw new Error('Choose an A(n,d) update bundle.');
    return validateDraft(dataset, { base_version: bundle.base_version,
      citations: clone(bundle.files[paths[0]]), claims: clone(bundle.files[paths[1]]) });
  }

  const api = { createDraft, validateDraft, saveReference, saveClaim, exportBundle, importBundle };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AtlasEditorModel = api;
})(globalThis);
