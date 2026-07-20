/**
 * App-bundle size fixture for the public package entry.
 *
 * Measures what a consumer app would pay after Vite minify + single-chunk rollup,
 * not the sum of unminified preserveModules files in dist/.
 *
 * Usage: node scripts/measure-app-bundle.mjs
 */
import { mkdir, rm, writeFile, readFile, stat } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, brotliCompressSync, constants as zlibConstants } from 'node:zlib';
import { build } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = resolve(root, '.tmp/bundle-size');

const scenarios = [
  {
    id: 'full-entry',
    label: 'Full public entry (AuraRouter + Route + Outlet + defineRouteHook)',
    code: `
import {
  AuraRouter,
  AuraRoute,
  AuraOutlet,
  defineRouteHook,
  AURA_ROUTER_NAVIGATION_COMPLETE,
} from '@aura-ui-web/router';

const hook = defineRouteHook({
  async load() {
    return { ok: true };
  },
});

AuraRouter.configure({ notFoundHandler: () => null });
AuraRouter.install();

void AuraRoute;
void AuraOutlet;

window.addEventListener(AURA_ROUTER_NAVIGATION_COMPLETE, () => {
  void hook;
});

export { AuraRouter, AuraRoute, AuraOutlet, defineRouteHook };
`,
  },
  {
    id: 'router-only',
    label: 'AuraRouter only (install + configure)',
    code: `
import { AuraRouter } from '@aura-ui-web/router';

AuraRouter.configure({ notFoundHandler: () => null });
AuraRouter.install();

export { AuraRouter };
`,
  },
];

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(2)} kB`;
}

async function measureScenario(scenario) {
  const dir = join(outRoot, scenario.id);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const entry = join(dir, 'entry.ts');
  await writeFile(entry, scenario.code, 'utf8');

  await build({
    configFile: false,
    root: dir,
    logLevel: 'error',
    publicDir: false,
    resolve: {
      alias: {
        '@aura-ui-web/router': resolve(root, 'dist/index.js'),
      },
    },
    build: {
      outDir: join(dir, 'out'),
      emptyOutDir: true,
      target: 'es2022',
      minify: 'esbuild',
      sourcemap: false,
      cssCodeSplit: false,
      lib: false,
      rollupOptions: {
        input: entry,
        output: {
          entryFileNames: 'app.js',
          format: 'es',
          codeSplitting: false,
        },
      },
    },
  });

  const bundlePath = join(dir, 'out', 'app.js');
  const buf = await readFile(bundlePath);
  const raw = buf.length;
  const gzip = gzipSync(buf, { level: 9 }).length;
  const brotli = brotliCompressSync(buf, {
    params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
  }).length;
  const fileStat = await stat(bundlePath);

  return { raw, gzip, brotli, path: bundlePath, mtime: fileStat.mtime };
}

await mkdir(outRoot, { recursive: true });

console.log('App bundle size (minified single chunk from public entry)\n');
console.log('Alias: @aura-ui-web/router → dist/index.js');
console.log('Tooling: Vite + esbuild minify, single chunk\n');

const rows = [];
for (const scenario of scenarios) {
  const m = await measureScenario(scenario);
  rows.push({ scenario, ...m });
  console.log(scenario.label);
  console.log(`  id:     ${scenario.id}`);
  console.log(`  raw:    ${formatKb(m.raw)}`);
  console.log(`  gzip:   ${formatKb(m.gzip)}`);
  console.log(`  brotli: ${formatKb(m.brotli)}`);
  console.log('');
}

const full = rows.find((r) => r.scenario.id === 'full-entry');
const only = rows.find((r) => r.scenario.id === 'router-only');
if (full && only) {
  console.log('Delta (full-entry − router-only)');
  console.log(`  raw:    ${formatKb(full.raw - only.raw)}`);
  console.log(`  gzip:   ${formatKb(full.gzip - only.gzip)}`);
  console.log(`  brotli: ${formatKb(full.brotli - only.brotli)}`);
}
