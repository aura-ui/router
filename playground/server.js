import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Import the framework and instantiate it
import Fastify from 'fastify';

const loadPage = async (pageName) => {
  return await readFile(join(__dirname, 'pages', pageName), 'utf8');
};

// Emulation of view engine work
const adobeRouter = async (html) => {
  const nav = await loadPage('parts/nav.html');
  const router = await loadPage('parts/router.html');
  const header = await loadPage('parts/header.html');
  html = html.replace('@header@', header);
  html = html.replace('@nav@', nav);
  return html.replace('@router@', router);
};

const fastify = Fastify({
  logger: true,
});

fastify.register(fastifyStatic, {
  root: join(__dirname, 'static'),
  prefix: '/static/', // optional: default '/'
});

// Declare a route
fastify.get('/users', async function handler(request, reply) {
  const html = await loadPage('users.html');
  return reply.type('text/html').send(await adobeRouter(html));
});

fastify.get('/users/:id', async function handler(request, reply) {
  await new Promise((r) => setTimeout(r, 3000));
  let html = await loadPage(`user.html`);
  html = html.replace(/{{id}}/g, request.params.id);
  return reply.type('text/html').send(await adobeRouter(html));
});

fastify.get('/contacts', async function handler(request, reply) {
  await new Promise((r) => setTimeout(r, 1000));
  const html = await loadPage('contacts.html');
  return reply.type('text/html').send(await adobeRouter(html));
});

fastify.get('/login', async function handler(request, reply) {
  const html = await loadPage('login.html');
  return reply.type('text/html').send(await adobeRouter(html));
});

fastify.get('/profile/settings', async function handler(request, reply) {
  const html = await loadPage('profile-settings.html');
  return reply.type('text/html').send(await adobeRouter(html));
});

fastify.get('/profile', async function handler(request, reply) {
  const html = await loadPage('profile.html');
  return reply.type('text/html').send(await adobeRouter(html));
});

fastify.get('/*', async function handler(request, reply) {
  const html = await loadPage('index.html');
  return reply.type('text/html').send(await adobeRouter(html));
});

// Run the server!
try {
  await fastify.listen({ port: 3000 });
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
