/** Minimal DOM harness for application state/events, not a layout simulator. */
const fs = require('node:fs');
const path = require('node:path');
const { createApp } = require('../src/app.js');

function mount(hash = '', additions = {}, options = {}) {
  const filename = options.edition === 'external' ? '../dist/index.html' : '../build/coding_bounds.html';
  const html = fs.readFileSync(path.join(__dirname, filename), 'utf8');
  const elements = new Map(), downloads = [], objectURLs = new Map();
  let urlCounter = 0;
  class Element {
    constructor(id, attributes = '') {
      this.id = id;
      this.value = (attributes.match(/value="([^"]*)"/) || [])[1] || '';
      this.checked = /\bchecked\b/.test(attributes);
      this.hidden = /\bhidden\b/.test(attributes);
      this.listeners = {};
      this.attributes = {};
      this.style = {};
      this.classList = { toggle() {} };
      this.markup = '';
      this.scrollTop = 0;
      this.scrollLeft = 0;
      this.clientHeight = 600;
    }
    set value(value) { this.inputValue = String(value); }
    get value() { return this.inputValue; }
    set innerHTML(value) {
      this.markup = value;
      for (const match of value.matchAll(/\bid="([^"]+)"/g)) elements.set(match[1], new Element(match[1]));
    }
    get innerHTML() { return this.markup; }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    addEventListener(type, callback) { this.listeners[type] = callback; }
    contains() { return true; }
    querySelector() { return null; }
    focus() {}
    scrollIntoView() {}
    click() {
      this.listeners.click?.();
      if (this.href) downloads.push({ blob: objectURLs.get(this.href), filename: this.download });
    }
    remove() {}
  }
  const staticHTML = html.split('<script id="seed"')[0];
  for (const match of staticHTML.matchAll(/<\w+\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    elements.set(match[2], new Element(match[2], match[1]));
  }
  for (const id of ['seed', 'exportWorker', 'appConfig']) {
    const match = html.match(new RegExp(`<script id="${id}" type="application/json">([\\s\\S]*?)<\\/script>`));
    if (match) elements.set(id, { textContent: match[1] });
  }
  const document = {
    getElementById(id) {
      return elements.get(id) || null;
    },
    addEventListener() {},
    querySelectorAll() {
      return ['nStart', 'nEnd', 'dStart', 'dEnd', 'lookupN', 'lookupD', 'lookupSubmit', 'parity', 'litsyn', 'brouwer', 'grassl', 'literature',
        'theorems', 'export', 'cancelExport', 'retryLoad'].map(id => elements.get(id)).filter(Boolean);
    },
    createElement: () => new Element(''),
    body: { append() {} },
  };
  const window = {
    Blob, setTimeout, location: { hash, href: 'https://bounds.example/index.html' + hash, protocol: 'https:' },
    URL: {
      createObjectURL(blob) { const url = `blob:test-${++urlCounter}`; objectURLs.set(url, blob); return url; },
      revokeObjectURL(url) { objectURLs.delete(url); },
    },
    history: { replaceState(_state, _unused, route) { window.location.hash = route; } },
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: callback => setTimeout(callback, 0),
    addEventListener() {},
    ...additions,
  };
  const app = options.deferStart ? null : createApp(document, window);
  return { app, document, elements, window, downloads, objectURLs,
    data: elements.has('seed') ? JSON.parse(elements.get('seed').textContent) : null };
}

module.exports = { mount };
