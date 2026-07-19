import { JSDOM } from 'jsdom';
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

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

const m = await import('../dist/index.js');
console.log('ok', m.AuraRouter.is, m.AuraRoute.is, m.AuraOutlet.is, typeof m.defineRouteHook);
m.AuraRouter.install();
console.log(
  'ce',
  !!customElements.get('aura-router'),
  !!customElements.get('aura-route'),
  !!customElements.get('aura-outlet'),
);

async function walk(dir, out = []) {
  for (const name of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, name.name);
    if (name.isDirectory()) await walk(path, out);
    else if (name.name.endsWith('.js')) out.push(path);
  }
  return out;
}

const jsFiles = await walk(join(process.cwd(), 'dist'));
console.log('js files', jsFiles.length);
console.log(
  'sample',
  jsFiles
    .slice(0, 8)
    .map((p) => relative(process.cwd(), p))
    .join('\n'),
);
