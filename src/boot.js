/** Start either the portable edition or the maintained external-data edition. */
(function (root) {
  'use strict';
  const Data = root.AtlasData || require('./data.js');
  const App = root.AtlasApp || require('./app.js');
  const instances = new WeakMap();

  function start(document, window) {
    const previous = instances.get(document);
    if (previous) return previous;
    const q = id => document.getElementById(id);
    const busy = value => {
      for (const control of document.querySelectorAll('input, select, button')) control.disabled = value;
      q('retryLoad').hidden = value;
    };
    const task = (async () => {
      busy(true);
      q('loadStatus').hidden = false;
      q('loadStatus').textContent = 'Loading bounds and references…';
      try {
        let options = {};
        if (!q('seed')) {
          if (window.location.protocol === 'file:') {
            throw new Error('This edition needs a web server. Use the standalone edition for direct file opening.');
          }
          const config = JSON.parse(q('appConfig').textContent);
          const manifestURL = new URL(config.manifest, window.location.href).href;
          const data = await Data.loadDataset(manifestURL, window.fetch.bind(window));
          options = { data, workerURL: new URL(config.worker, window.location.href).href };
        }
        const app = App.createApp(document, window, options);
        busy(false);
        q('retryLoad').hidden = true;
        q('loadStatus').hidden = true;
        q('loadStatus').textContent = '';
        return app;
      } catch (error) {
        instances.delete(document);
        q('loadStatus').textContent = `Could not load the table. ${error.message}`;
        q('retryLoad').hidden = false;
        q('retryLoad').disabled = false;
        q('retryLoad').onclick = () => { start(document, window).catch(() => {}); };
        throw error;
      }
    })();
    instances.set(document, task);
    // Also clear rejected synchronous starts after the promise was registered.
    task.catch(() => { if (instances.get(document) === task) instances.delete(document); });
    return task;
  }

  const api = { start };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.AtlasBoot = api;
    root.AtlasReady = start(root.document, root);
    root.AtlasReady.catch(() => {});
  }
})(globalThis);
