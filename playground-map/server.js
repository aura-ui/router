import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';

const __dirname = dirname(fileURLToPath(import.meta.url));

const loadPage = async (pageName) => {
  return await readFile(join(__dirname, 'pages', pageName), 'utf8');
};

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const fastify = Fastify({
  logger: true,
});

fastify.register(fastifyStatic, {
  root: join(__dirname, 'static'),
  prefix: '/static/',
});

fastify.get('/bestiary', async (_request, reply) => {
  const html = await loadPage('bestiary.html');
  return reply.type('text/html').send(html);
});

fastify.get('/bestiary/:id', async (request, reply) => {
  await delay(400);
  const html = await loadPage(`creatures/${request.params.id}.html`);
  return reply.type('text/html').send(html);
});

fastify.get('/regions/:regionId', async (request, reply) => {
  const html = await loadPage(`regions/${request.params.regionId}.html`);
  return reply.type('text/html').send(html);
});

fastify.get('/regions/:regionId/trails/:trailId', async (request, reply) => {
  await delay(350);
  const html = await loadPage(
    `trails/${request.params.regionId}-${request.params.trailId}.html`,
  );
  return reply.type('text/html').send(html);
});

fastify.get('/regions/:regionId/trails/:trailId/sights/:id', async (request, reply) => {
  await delay(300);
  const html = await loadPage(`sights/${request.params.id}.html`);
  return reply.type('text/html').send(html);
});

fastify.get('/regions/:regionId/journal', async (request, reply) => {
  await delay(600);
  const html = await loadPage(`journals/${request.params.regionId}.html`);
  return reply.type('text/html').send(html);
});

fastify.get('/wall', async (_request, reply) => {
  const html = await loadPage('wall.html');
  return reply.type('text/html').send(html);
});

fastify.get('/wall/gates/:gateId', async (request, reply) => {
  await delay(400);
  const html = await loadPage(`gates/${request.params.gateId}.html`);
  return reply.type('text/html').send(html);
});

fastify.get('/wall/beyond', async (_request, reply) => {
  await delay(500);
  const html = await loadPage('beyond.html');
  return reply.type('text/html').send(html);
});

fastify.get('/start-journey', async (_request, reply) => {
  const html = await loadPage('start-journey.html');
  return reply.type('text/html').send(html);
});

fastify.get('/seasons', async (_request, reply) => {
  const html = await loadPage('seasons.html');
  return reply.type('text/html').send(html);
});

fastify.get('/*', async (_request, reply) => {
  const html = await loadPage('index.html');
  return reply.type('text/html').send(html);
});

try {
  await fastify.listen({ port: 3001 });
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
