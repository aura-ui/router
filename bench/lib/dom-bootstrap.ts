/**
 * Side-effect bootstrap: browser/DOM globals required before engine modules load in Node.
 * Import this file FIRST in bench scenarios that pull aura-dom / aura-route / url-matcher.
 */
import { URLPattern } from 'urlpattern-polyfill';
import { setupMinimalWindow } from './env';

if (typeof globalThis.URLPattern === 'undefined') {
  (globalThis as typeof globalThis & { URLPattern: typeof URLPattern }).URLPattern = URLPattern;
}

setupMinimalWindow();

if (typeof globalThis.HTMLElement === 'undefined') {
  globalThis.HTMLElement = class HTMLElement {} as typeof HTMLElement;
}

if (typeof globalThis.customElements === 'undefined') {
  globalThis.customElements = {
    get: () => undefined,
    define: () => {},
    whenDefined: async () => {},
  } as unknown as CustomElementRegistry;
}
