import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';

const root = dirname(fileURLToPath(import.meta.url));
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function page(rel, wait = 0) {
  if (wait) await delay(wait);
  return readFile(join(root, 'pages', rel), 'utf8');
}

/** [path, file | (params) => file, delayMs?] */
const fragments = [
  ['/fleet', 'fleet.html'],
  ['/fleet/:id', (p) => `fleet/${p.id}.html`, 350],

  ['/chronicle/:eraId', (p) => `chronicle/${p.eraId}.html`],
  ['/chronicle/:eraId/:eventId', (p) => `chronicle/events/${p.eventId}.html`, 280],

  ['/system/:bodyId', (p) => `system/${p.bodyId}.html`],
  ['/system/:bodyId/missions/:id', (p) => `system/missions/${p.id}.html`, 320],

  ['/mir', 'mir.html'],
  ['/mir/modules/:moduleId', (p) => `mir/${p.moduleId}.html`, 450],

  // Static path before :scaleId so "horizon" is not captured as a param.
  ['/deep/horizon', 'deep/horizon.html', 500],
  ['/deep/:scaleId', (p) => `deep/${p.scaleId}.html`],

  ['/briefing', 'briefing.html'],
  ['/about', 'about.html'],
];

const app = Fastify({ logger: true });

await app.register(fastifyStatic, {
  root: join(root, 'static'),
  prefix: '/static/',
});

for (const [path, file, wait = 0] of fragments) {
  app.get(path, async (req, reply) => {
    const rel = typeof file === 'function' ? file(req.params) : file;
    const html = await page(rel, wait);
    return reply.type('text/html').send(html);
  });
}

app.get('/*', async (_req, reply) => {
  const html = await page('index.html');
  return reply.type('text/html').send(html);
});

try {
  await app.listen({ port: 3002 });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
