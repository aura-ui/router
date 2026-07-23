import { URLPattern } from 'urlpattern-polyfill';

if (typeof globalThis.URLPattern === 'undefined') {
  // Polyfill types omit `hasRegExpGroups` present on DOM lib URLPattern.
  (globalThis as { URLPattern: typeof URLPattern }).URLPattern = URLPattern;
}
