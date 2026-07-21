/**
 * App-bundle budgets for the public package entry (esbuild minify).
 *
 * size-limit shows one compression mode per check:
 * - default → brotli (CI anchor)
 * - gzip: true → gzip
 * - brotli: false → minified only (raw)
 *
 * Analyze: `npm run size:analyze`
 */

const scenarios = [
  {
    id: 'full',
    name: 'Full public entry',
    import: '{ AuraRouter, AuraRoute, AuraOutlet, defineRouteHook }',
  },
  {
    id: 'router',
    name: 'AuraRouter only',
    import: '{ AuraRouter }',
  },
];

/** @type {import('size-limit').SizeLimitConfig} */
module.exports = scenarios.flatMap((s) => [
  {
    name: `${s.name} (brotli)`,
    path: 'dist/index.js',
    import: s.import,
    limit: '32 kB',
  },
  {
    name: `${s.name} (gzip)`,
    path: 'dist/index.js',
    import: s.import,
    gzip: true,
    limit: '36 kB',
  },
  {
    name: `${s.name} (min)`,
    path: 'dist/index.js',
    import: s.import,
    brotli: false,
    limit: '120 kB',
  },
]);
