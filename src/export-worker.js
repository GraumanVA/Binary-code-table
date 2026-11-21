/** Bundled with math/bounds/state/export into an inline Blob worker. */
globalThis.onmessage = async function (event) {
  const { data, settings } = event.data;
  try {
    const engine = globalThis.AtlasBounds.createEngine(data);
    const result = await globalThis.AtlasExport.generateCSV(engine, settings, {
      onProgress: progress => globalThis.postMessage({ type: 'progress', ...progress }),
    });
    const blob = new Blob(result.parts, { type: 'text/csv;charset=utf-8' });
    globalThis.postMessage({ type: 'complete', blob, rowCount: result.rowCount });
  } catch (error) {
    globalThis.postMessage({ type: 'error', message: error.message });
  }
};
