/** Data-only editing and validation shared by the maintenance interface tests. */
(function (root) {
  'use strict';
  const Bounds = root.AtlasBounds || require('./bounds.js');
  const MathRules = root.AtlasMath || require('./math.js');
  const clone = value => JSON.parse(JSON.stringify(value));
  const owns = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const paths = ['data/citations.json', 'data/literature_claims.json'];
  const sides = ['lower', 'upper'];
  const fields = ['citations', 'claims'];
  const canonical = value => JSON.stringify(value, (_, item) => {
    if (!item || Array.isArray(item) || typeof item !== 'object') return item;
    return Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]));
  });
  const equal = (left, right) => canonical(left) === canonical(right);
  const evidence = (row, side, field) => owns(row, `${side}_${field}`) ? row[`${side}_${field}`] : row[field];

  function createDraft(dataset) {
    const citations = Object.fromEntries(Object.entries(dataset.citation_metadata)
      .filter(([, reference]) => !reference.needs_review));
    return { base_version: dataset.metadata.version,
      citations: clone(citations), claims: clone(dataset.literature_claims || []) };
  }

  function validateDraft(dataset, draft) {
    if (draft.base_version !== dataset.metadata.version) throw new Error('This draft belongs to another dataset. Reload the current data before editing.');
    if (!draft.citations || Array.isArray(draft.citations) || typeof draft.citations !== 'object') throw new Error('References must be an object.');
    for (const [key, reference] of Object.entries(draft.citations)) {
      if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(key) || ['constructor', 'prototype', '__proto__'].includes(key)) throw new Error('Invalid reference key.');
      if (!reference || !Array.isArray(reference.authors) || !reference.authors.length
          || reference.authors.some(author => typeof author !== 'string' || !author.trim())) throw new Error(`${key}: enter at least one author.`);
      if (typeof reference.year !== 'string' || typeof reference.citation !== 'string' || !reference.citation.trim()) throw new Error(`${key}: enter a full citation and a year if known.`);
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
    for (const key of required) {
      if (!dataset.citation_metadata[key]?.needs_review && !owns(draft.citations, key)) {
        throw new Error(`Reference ${key} is used by a source claim.`);
      }
    }
    if (!Array.isArray(draft.claims)) throw new Error('Bounds must be a list.');
    const identifiers = new Set();
    for (const row of draft.claims) {
      if (!row || typeof row.id !== 'string' || !/^PAPER-[A-Za-z0-9_.:-]+$/.test(row.id)) throw new Error('Invalid bound record ID.');
      if (identifiers.has(row.id)) throw new Error(`Duplicate bound record: ${row.id}`);
      identifiers.add(row.id);
      if (![row.n, row.d].every(value => Number.isInteger(value) && value >= 1 && value <= 512)) throw new Error(`${row.id}: length and distance must be between 1 and 512.`);
      let count = 0;
      for (const side of sides) {
        if (row[side] == null) {
          if (owns(row, `${side}_references`) || owns(row, `${side}_source_locator`)) {
            throw new Error(`${row.id}: supply a ${side} bound with its evidence.`);
          }
          continue;
        }
        if (typeof row[side] !== 'string' || !/^[1-9][0-9]*$/.test(row[side])) throw new Error(`${row.id}: bounds must be positive whole-number strings.`);
        const references = evidence(row, side, 'references');
        if (!Array.isArray(references) || !references.length
          || references.some(key => typeof key !== 'string' || !owns(draft.citations, key))) {
          throw new Error(`${row.id}: choose a known reference for the ${side} bound.`);
        }
        if (owns(row, `${side}_source_locator`) && typeof row[`${side}_source_locator`] !== 'string') {
          throw new Error(`${row.id}: ${side} source locator must be text.`);
        }
        count++;
      }
      if (!count) throw new Error(`${row.id}: enter a lower or upper bound.`);
      if (row.lower && row.upper && BigInt(row.lower) > BigInt(row.upper)) throw new Error(`${row.id}: lower exceeds upper.`);
      if (owns(row, 'active') && typeof row.active !== 'boolean') throw new Error(`${row.id}: active must be true or false.`);
      if (owns(row, 'source_locator') && typeof row.source_locator !== 'string') throw new Error(`${row.id}: the source locator must be text.`);
    }
    const engine = Bounds.createEngine({ ...dataset, literature_claims: draft.claims });
    const active = draft.claims.filter(row => row.active !== false);
    const padded = active.filter(row => row.lower).map(row => MathRules.oddPartner(row.n, row.d));
    const neighboring = dataset.brouwer.filter(row => {
      const pair = MathRules.oddPartner(row.n, row.d);
      return padded.some(origin => origin.d === pair.d && origin.n <= pair.n);
    });
    for (const row of [...active, ...neighboring]) {
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
    const prefix = String(values.lower_references?.[0] || values.upper_references?.[0]
      || values.references?.[0] || 'source').replace(/[^A-Za-z0-9_.:-]/g, '-');
    id = id || uniqueKey(`PAPER-${prefix}-${values.n}-${values.d}`, candidate => next.claims.some(row => row.id === candidate));
    const entry = { ...(index >= 0 ? next.claims[index] : {}), ...values, id };
    if (sides.some(side => owns(values, `${side}_references`))) {
      delete entry.references;
      delete entry.source_locator;
    }
    for (const side of sides) {
      if (!entry[side]) {
        delete entry[side];
        delete entry[`${side}_references`];
        delete entry[`${side}_source_locator`];
      } else if (entry[`${side}_source_locator`] === '') {
        delete entry[`${side}_source_locator`];
      }
    }
    if (index >= 0) next.claims[index] = entry;
    else next.claims.push(entry);
    return { draft: validateDraft(dataset, next), id };
  }

  function diff(dataset, draft) {
    const changes = {};
    const current = createDraft(dataset);
    for (const field of fields) {
      const before = records(current, field), after = records(draft, field);
      changes[field] = [...new Set([...before.keys(), ...after.keys()])].flatMap(key => {
        const old = before.get(key) ?? null, next = after.get(key) ?? null;
        return equal(old, next) ? [] : [{ key, before: clone(old), after: clone(next) }];
      });
    }
    return changes;
  }

  function records(draft, field) {
    return new Map(field === 'citations' ? Object.entries(draft.citations) : draft.claims.map(row => [row.id, row]));
  }

  function exportBundle(dataset, draft) {
    validateDraft(dataset, draft);
    return { format: 'a-nd-update', schema_version: 2, base_version: draft.base_version, changes: diff(dataset, draft) };
  }

  function importBundle(dataset, bundle, draft = createDraft(dataset)) {
    const invalid = () => new Error('Choose an A(n,d) update bundle.');
    if (bundle?.format !== 'a-nd-update') throw invalid();
    if (bundle.schema_version === 1) {
      if (!bundle.files || Object.keys(bundle.files).length !== 2 || paths.some(path => !owns(bundle.files, path))) throw invalid();
      const imported = validateDraft(dataset, { base_version: bundle.base_version,
        citations: clone(bundle.files[paths[0]]), claims: clone(bundle.files[paths[1]]) });
      if (Object.values(diff(dataset, draft)).some(changes => changes.length) && !equal(imported, draft)) {
        throw new Error('A full-file bundle would replace this draft. Download your changes and discard the draft first.');
      }
      return imported;
    }
    if (bundle.schema_version !== 2 || !bundle.changes || Object.keys(bundle.changes).length !== fields.length
      || fields.some(field => !Array.isArray(bundle.changes[field]))) throw invalid();
    const next = { base_version: dataset.metadata.version }, conflicts = [];
    const validRecord = value => value === null || (typeof value === 'object' && value !== null && !Array.isArray(value));
    for (const field of fields) {
      const entries = records(draft, field), seen = new Set();
      for (const change of bundle.changes[field]) {
        if (!change || typeof change.key !== 'string' || !change.key || seen.has(change.key)
          || !validRecord(change.before) || !validRecord(change.after)
          || (field === 'claims' && [change.before, change.after].some(row => row && row.id !== change.key))) throw invalid();
        const { key, before, after } = change;
        seen.add(key);
        const current = entries.get(key) ?? null;
        if (equal(current, after)) continue;
        if (!equal(current, before)) { conflicts.push(key); continue; }
        if (after === null) entries.delete(key);
        else entries.set(key, clone(after));
      }
      next[field] = field === 'citations' ? Object.fromEntries(entries) : [...entries.values()];
    }
    if (conflicts.length) throw new Error(`Conflicting update records: ${conflicts.join(', ')}.`);
    return validateDraft(dataset, next);
  }

  const api = { createDraft, validateDraft, saveReference, saveClaim, evidence, diff, exportBundle, importBundle };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AtlasEditorModel = api;
})(globalThis);
