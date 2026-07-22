import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Import the framework and instantiate it
import Fastify from 'fastify';

const fastify = Fastify({
  logger: true,
});

fastify.register(fastifyStatic, {
  root: join(__dirname, 'static'),
  prefix: '/static/', // optional: default '/'
});

// Declare a route
fastify.get('/user', async function handler(request, reply) {
  await new Promise((r) => setTimeout(r, 3000));
  const html = await readFile(join(__dirname, 'pages', 'user.html'), 'utf8');
  return reply.type('text/html').send(html);
});

fastify.get('/contacts', async function handler(request, reply) {
  await new Promise((r) => setTimeout(r, 1000));
  const html = await readFile(join(__dirname, 'pages', 'contacts.html'), 'utf8');
  return reply.type('text/html').send(html);
});

fastify.get('/*', async function handler(request, reply) {
  const html = await readFile(join(__dirname, 'pages', 'index.html'), 'utf8');
  return reply.type('text/html').send(html);
});

// Run the server!
try {
  await fastify.listen({ port: 3000 });
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}