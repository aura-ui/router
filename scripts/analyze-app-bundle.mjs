/**
 * Attribute minified app-bundle bytes to source modules via sourcemap.
 * Usage: node scripts/analyze-app-bundle.mjs
 */
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, '.tmp/bundle-analyze');

await rm(dir, { recursive: true, force: true });
await mkdir(dir, { recursive: true });

const entry = join(dir, 'entry.ts');
await writeFile(
  entry,
  `
import { AuraRouter } from '@aura-ui-web/router';
AuraRouter.configure({ notFoundHandler: () => null });
AuraRouter.install();
export { AuraRouter };
`,
  'utf8',
);

await build({
  configFile: false,
  root: dir,
  logLevel: 'error',
  publicDir: false,
  resolve: {
    alias: { '@aura-ui-web/router': resolve(root, 'dist/index.js') },
  },
  build: {
    outDir: join(dir, 'out'),
    emptyOutDir: true,
    target: 'es2022',
    minify: 'esbuild',
    sourcemap: true,
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

const js = await readFile(join(dir, 'out', 'app.js'), 'utf8');
const map = JSON.parse(await readFile(join(dir, 'out', 'app.js.map'), 'utf8'));

/** @type {Map<number, number>} */
const genToSource = new Map();
const mappings = map.mappings.split(';');
let genCol = 0;
let srcIndex = 0;
let genLine = 0;

function decodeVlq(segment) {
  const result = [];
  let i = 0;
  while (i < segment.length) {
    let resultInt = 0;
    let shift = 0;
    let cont = true;
    while (cont) {
      let c = segment.charCodeAt(i++) - 65;
      if (c >= 26) c -= 6;
      if (c < 0 || c > 63) throw new Error('bad vlq');
      // use standard base64 VLQ
      i -= 1;
      break;
    }
    // proper decode below
    break;
  }
  return result;
}

// Proper VLQ decode
const CHAR = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function decodeSegment(segment) {
  const values = [];
  let value = 0;
  let shift = 0;
  for (let i = 0; i < segment.length; i++) {
    let digit = CHAR.indexOf(segment[i]);
    if (digit < 0) continue;
    const cont = digit & 32;
    digit &= 31;
    value += digit << shift;
    if (cont) {
      shift += 5;
      continue;
    }
    const negate = value & 1;
    value >>= 1;
    values.push(negate ? -value : value);
    value = 0;
    shift = 0;
  }
  return values;
}

const fileBytes = new Map();
const lines = js.split('\n');
let generatedOffset = 0;
const lineOffsets = lines.map((line) => {
  const start = generatedOffset;
  generatedOffset += line.length + 1;
  return start;
});

genCol = 0;
srcIndex = 0;
let srcLine = 0;
let srcCol = 0;
/** @type {{start:number, source:number}[]} */
const spans = [];

for (let lineIdx = 0; lineIdx < mappings.length; lineIdx++) {
  genCol = 0;
  const line = mappings[lineIdx];
  if (!line) continue;
  for (const seg of line.split(',')) {
    if (!seg) continue;
    const v = decodeSegment(seg);
    genCol += v[0] ?? 0;
    if (v.length >= 2) {
      srcIndex += v[1];
      srcLine += v[2] ?? 0;
      srcCol += v[3] ?? 0;
      const abs = (lineOffsets[lineIdx] ?? 0) + genCol;
      spans.push({ start: abs, source: srcIndex });
    }
  }
}

spans.sort((a, b) => a.start - b.start);
const totalLen = Buffer.byteLength(js);
for (let i = 0; i < spans.length; i++) {
  const start = spans[i].start;
  const end = i + 1 < spans.length ? spans[i + 1].start : totalLen;
  const len = Math.max(0, end - start);
  const src = map.sources[spans[i].source] || '(unknown)';
  fileBytes.set(src, (fileBytes.get(src) || 0) + len);
}

function normalize(src) {
  const n = src.replace(/\\/g, '/');
  const d = n.indexOf('/dist/');
  if (d >= 0) return n.slice(d + 1);
  const s = n.indexOf('/modules/');
  if (s >= 0) return 'dist' + n.slice(s);
  if (n.includes('entry.ts')) return '(fixture)';
  return n;
}

function moduleKey(src) {
  const n = normalize(src);
  const m = n.match(/modules\/([^/]+)/);
  return m ? m[1] : n.startsWith('(fixture)') ? '(fixture)' : '(other)';
}

const byFile = [...fileBytes.entries()]
  .map(([src, bytes]) => ({ src: normalize(src), bytes }))
  .sort((a, b) => b.bytes - a.bytes);

const byMod = new Map();
for (const row of byFile) {
  const key = moduleKey(row.src);
  byMod.set(key, (byMod.get(key) || 0) + row.bytes);
}

const bundleGz = gzipSync(Buffer.from(js), { level: 9 }).length;
const scale = bundleGz / totalLen;

console.log('Minified attribution via sourcemap (approx)\n');
console.log(
  `Bundle: ${(totalLen / 1024).toFixed(2)} kB raw · ${(bundleGz / 1024).toFixed(2)} kB gzip\n`,
);
console.log('By package module:');
for (const [k, bytes] of [...byMod.entries()].sort((a, b) => b[1] - a[1])) {
  const pct = ((bytes / totalLen) * 100).toFixed(1);
  console.log(
    `  ${k.padEnd(26)} ${(bytes / 1024).toFixed(2).padStart(7)} kB min  ~${((bytes * scale) / 1024).toFixed(2).padStart(5)} kB gz  (${pct}%)`,
  );
}

console.log('\nTop 20 files:');
for (const row of byFile.slice(0, 20)) {
  const pct = ((row.bytes / totalLen) * 100).toFixed(1);
  console.log(
    `  ${(row.bytes / 1024).toFixed(2).padStart(7)} kB  ${pct.padStart(5)}%  ${row.src}`,
  );
}
