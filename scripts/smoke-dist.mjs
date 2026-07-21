import { access, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const distEntry = resolve(dist, 'index.js');

function fail(message) {
  console.error(`smoke-dist: ${message}`);
  process.exit(1);
}

try {
  await access(distEntry);
} catch {
  fail('missing dist/index.js — run `npm run build` first');
}

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
const w = dom.window;
globalThis.window = w;
globalThis.document = w.document;
globalThis.HTMLElement = w.HTMLElement;
globalThis.Element = w.Element;
globalThis.Node = w.Node;
globalThis.Text = w.Text;
globalThis.Comment = w.Comment;
globalThis.DocumentFragment = w.DocumentFragment;
globalThis.DOMParser = w.DOMParser;
globalThis.Document = w.Document;
globalThis.customElements = w.customElements;
globalThis.MutationObserver = w.MutationObserver;
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

const m = await import(pathToFileURL(distEntry).href);

const required = [
  ['AuraRouter', m.AuraRouter],
  ['AuraRoute', m.AuraRoute],
  ['AuraOutlet', m.AuraOutlet],
  ['defineRouteHook', m.defineRouteHook],
];

for (const [name, value] of required) {
  if (value == null) fail(`export missing: ${name}`);
}

if (typeof m.AuraRouter.is !== 'string') fail('AuraRouter.is must be a custom element tag');
if (typeof m.AuraRoute.is !== 'string') fail('AuraRoute.is must be a custom element tag');
if (typeof m.AuraOutlet.is !== 'string') fail('AuraOutlet.is must be a custom element tag');
if (typeof m.defineRouteHook !== 'function') fail('defineRouteHook must be a function');

m.AuraRouter.install();

const tags = [m.AuraRouter.is, m.AuraRoute.is, m.AuraOutlet.is];
for (const tag of tags) {
  if (!customElements.get(tag)) fail(`custom element not registered: ${tag}`);
}

async function walkJs(dir, out = []) {
  for (const name of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, name.name);
    if (name.isDirectory()) await walkJs(path, out);
    else if (name.name.endsWith('.js')) out.push(path);
  }
  return out;
}

const jsFiles = await walkJs(dist);
if (jsFiles.length === 0) fail('dist/ contains no .js files');

console.log('ok', m.AuraRouter.is, m.AuraRoute.is, m.AuraOutlet.is, typeof m.defineRouteHook);
console.log('ce', ...tags.map((tag) => !!customElements.get(tag)));
console.log('js files', jsFiles.length);
console.log(
  'sample',
  jsFiles
    .slice(0, 8)
    .map((p) => relative(root, p))
    .join('\n'),
);
console.log('smoke-dist: passed');
