import { URLPattern } from 'urlpattern-polyfill';

if (typeof globalThis.URLPattern === 'undefined') {
  (globalThis as typeof globalThis & { URLPattern: typeof URLPattern }).URLPattern = URLPattern;
}
