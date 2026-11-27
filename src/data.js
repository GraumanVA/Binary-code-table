/** Load independently published bounds and references as one versioned dataset. */
(function (root) {
  'use strict';

  async function loadDataset(manifestURL, fetchFile) {
    async function readJSON(url, cache) {
      const response = await fetchFile(url, { cache });
      if (!response.ok) throw new Error(`Data request failed (${response.status}).`);
      try { return await response.json(); }
      catch (_) { throw new Error('A data file does not contain valid JSON.'); }
    }
    const manifest = await readJSON(manifestURL, 'no-store');
    if (manifest.schema_version !== 1 || !manifest.version || manifest.metadata?.version !== manifest.version
        || !manifest.files?.bounds || !manifest.files?.references) throw new Error('Invalid dataset manifest.');
    const boundsURL = new URL(manifest.files.bounds, manifestURL).href;
    const referencesURL = new URL(manifest.files.references, manifestURL).href;
    const [bounds, references] = await Promise.all([
      readJSON(boundsURL, 'force-cache'), readJSON(referencesURL, 'force-cache'),
    ]);
    if (bounds.version !== manifest.version || references.version !== manifest.version) {
      throw new Error('The bounds and references belong to different snapshots. Reload the page.');
    }
    if (!Array.isArray(bounds.litsyn) || !Array.isArray(bounds.brouwer)
        || !Array.isArray(bounds.literature_claims) || !Array.isArray(bounds.editorial_exclusions)
        || !references.citation_metadata || !references.bound_references || !references.bibliography
        || (manifest.metadata.grassl && (!Array.isArray(bounds.grassl)
          || !references.citation_metadata[manifest.metadata.grassl.reference_id]))) {
      throw new Error('Incomplete dataset.');
    }
    const { version: _boundsVersion, ...claimData } = bounds;
    const { version: _referenceVersion, ...referenceData } = references;
    return { ...claimData, ...referenceData, metadata: manifest.metadata };
  }

  const api = { loadDataset };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AtlasData = api;
})(globalThis);
