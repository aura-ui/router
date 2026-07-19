import { rm, mkdir, readdir, unlink, lstat, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');

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

async function printBuildSummary() {
  const files = await walkFiles(dist);
  let jsBytes = 0;
  let jsGzipBytes = 0;
  let jsCount = 0;
  let mapBytes = 0;
  let dtsBytes = 0;
  let otherBytes = 0;

  for (const path of files) {
    const size = (await stat(path)).size;
    if (path.endsWith('.js') && !path.endsWith('.js.map')) {
      jsCount += 1;
      jsBytes += size;
      jsGzipBytes += gzipSync(readFileSync(path)).length;
    } else if (path.endsWith('.map')) {
      mapBytes += size;
    } else if (path.endsWith('.d.ts') || path.endsWith('.d.ts.map')) {
      dtsBytes += size;
    } else {
      otherBytes += size;
    }
  }

  const total = jsBytes + mapBytes + dtsBytes + otherBytes;
  console.log('');
  console.log('Build summary (dist/)');
  console.log(`  JS:     ${formatKb(jsBytes)} raw · ${formatKb(jsGzipBytes)} gzip  (${jsCount} files)`);
  console.log(`  maps:   ${formatKb(mapBytes)}`);
  console.log(`  dts:    ${formatKb(dtsBytes)}`);
  if (otherBytes) console.log(`  other:  ${formatKb(otherBytes)}`);
  console.log(`  TOTAL:  ${formatKb(total)}`);
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
        const stat = await lstat(path);
        if (stat.isDirectory()) {
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
