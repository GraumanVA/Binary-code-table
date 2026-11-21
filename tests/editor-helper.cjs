/** Form-event harness; layout and browser-native form validation are not simulated. */
const fs = require('node:fs');
const path = require('node:path');
const { createEditor } = require('../src/editor.js');

function mountEditor(options = {}) {
  const html = fs.readFileSync(path.join(__dirname, '../dist/editor.html'), 'utf8');
  const standalone = fs.readFileSync(path.join(__dirname, '../coding_bounds.html'), 'utf8');
  const data = JSON.parse(standalone.match(/<script id="seed" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  const elements = new Map(), downloads = [], objectURLs = new Map(), stored = options.stored || new Map();
  class Element {
    constructor(attributes = '') {
      this.value = (attributes.match(/value="([^"]*)"/) || [])[1] || '';
      this.checked = /\bchecked\b/.test(attributes); this.hidden = /\bhidden\b/.test(attributes);
      this.listeners = {}; this.options = []; this.classes = new Set();
      this.classList = {
        add: name => this.classes.add(name), remove: name => this.classes.delete(name),
        toggle: (name, force) => force ? this.classes.add(name) : this.classes.delete(name),
      };
    }
    set value(value) { this.inputValue = String(value); }
    get value() { return this.inputValue; }
    set innerHTML(value) {
      this.markup = value;
      this.options = Array.from(value.matchAll(/<option value="([^"]*)"([^>]*)>(.*?)<\/option>/g),
        match => ({ value: match[1], selected: /selected/.test(match[2]) }));
    }
    get innerHTML() { return this.markup; }
    get selectedOptions() { return this.options.filter(option => option.selected); }
    addEventListener(type, callback) { this.listeners[type] = callback; }
    click() {
      this.listeners.click?.();
      if (this.href) downloads.push({ filename: this.download, blob: objectURLs.get(this.href) });
    }
    remove() {}
    submit() { return this.listeners.submit({ preventDefault() {} }); }
  }
  for (const match of html.matchAll(/<\w+\b([^>]*\bid="([^"]+)"[^>]*)>/g)) elements.set(match[2], new Element(match[1]));
  elements.get('editorConfig').textContent = html.match(/<script id="editorConfig" type="application\/json">([\s\S]*?)<\/script>/)[1];
  const document = { getElementById: id => elements.get(id), createElement: () => new Element(), body: { append() {} } };
  const window = {
    location: { protocol: 'https:', pathname: '/repository/editor.html', href: 'https://bounds.example/repository/editor.html', hash: options.hash || '' },
    localStorage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) },
    Blob, confirm: () => true, setTimeout: callback => callback(),
    URL: { createObjectURL(blob) { const key = `blob:editor-${objectURLs.size}`; objectURLs.set(key, blob); return key; }, revokeObjectURL() {} },
    ...options.window,
  };
  const app = options.deferStart ? null : createEditor(document, window, data);
  return { app, document, window, elements, downloads, stored, data };
}
module.exports = { mountEditor };
