import { rm, mkdir, readdir, unlink, lstat, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import * as esbuild from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const distEntry = resolve(dist, 'index.js');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(2)} kB`;
}

async function walkFiles(dir, out = []) {
  for (const name of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, name.name);
    if (name.isDirectory()) await walkFiles(path, out);
    else out.push(path);
  }
  return out;
}

/** Package layout sizes (raw only — per-file gzip overstates a real app chunk). */
async function summarizeDistLayout() {
  const files = await walkFiles(dist);
  let jsBytes = 0;
  let jsCount = 0;
  let mapBytes = 0;
  let dtsBytes = 0;
  let otherBytes = 0;

  for (const path of files) {
    const size = (await stat(path)).size;
    if (path.endsWith('.js') && !path.endsWith('.js.map')) {
      jsCount += 1;
      jsBytes += size;
    } else if (path.endsWith('.map')) {
      mapBytes += size;
    } else if (path.endsWith('.d.ts') || path.endsWith('.d.ts.map')) {
      dtsBytes += size;
    } else {
      otherBytes += size;
    }
  }

  return {
    jsBytes,
    jsCount,
    mapBytes,
    dtsBytes,
    otherBytes,
    total: jsBytes + mapBytes + dtsBytes + otherBytes,
  };
}

/**
 * Consumer-facing estimate: minify + bundle public entry (same idea as size:vite / size-limit).
 * Not identical to Vite rollup output, but comparable and honest vs per-file gzip sums.
 */
async function measureAppEntry() {
  const result = await esbuild.build({
    entryPoints: [distEntry],
    bundle: true,
    minify: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    logLevel: 'silent',
  });
  const buf = Buffer.from(result.outputFiles[0].contents);
  return {
    raw: buf.length,
    gzip: gzipSync(buf, { level: 9 }).length,
  };
}

async function printBuildSummary() {
  const layout = await summarizeDistLayout();
  const app = await measureAppEntry();

  console.log('');
  console.log('Build summary');
  console.log('  dist/ layout (publish package, unminified preserveModules)');
  console.log(`    JS:     ${formatKb(layout.jsBytes)} raw  (${layout.jsCount} files)`);
  console.log(`    maps:   ${formatKb(layout.mapBytes)}`);
  console.log(`    dts:    ${formatKb(layout.dtsBytes)}`);
  if (layout.otherBytes) console.log(`    other:  ${formatKb(layout.otherBytes)}`);
  console.log(`    TOTAL:  ${formatKb(layout.total)}`);
  console.log('  app entry (esbuild minify + bundle of dist/index.js)');
  console.log(`    raw:    ${formatKb(app.raw)}`);
  console.log(`    gzip:   ${formatKb(app.gzip)}`);
  console.log('  tip: npm run size | size:vite for budgets / Vite fixture');
}

/** Windows-friendly clean: retries, then wipe contents if rmdir stays locked. */
async function cleanDist() {
  try {
    await rm(dist, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    return;
  } catch {
    // fall through
  }

  try {
    const entries = await readdir(dist);
    await Promise.all(
      entries.map(async (name) => {
        const path = join(dist, name);
        const entryStat = await lstat(path);
        if (entryStat.isDirectory()) {
          await rm(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
        } else {
          await unlink(path);
        }
      }),
    );
  } catch {
    await mkdir(dist, { recursive: true });
  }
}

await cleanDist();
await mkdir(dist, { recursive: true });

// 1) Declarations mirroring src/ → dist/**/*.d.ts
run('npx', ['tsc', '-p', 'tsconfig.build.json', '--emitDeclarationOnly']);

// 2) ESM JS with preserveModules (folder layout + .js import paths for Node)
run('npx', ['vite', 'build', '--config', 'vite.lib.config.ts']);

await printBuildSummary();
