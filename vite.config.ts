import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from 'vite';
import type { Connect } from 'vite';

const DEMO_SHELLS: Record<string, string> = {
  '/features/routing-basics': '/features/routing-basics/index.html',
  '/features/routing-nested': '/features/routing-nested/index.html',
  '/features/routing-advanced': '/features/routing-advanced/index.html',
  '/features/phase-update': '/features/phase-update/index.html',
  '/features/animations': '/features/animations/index.html',
};

function rewriteDemoShell(req: Connect.IncomingMessage): void {
  const url = req.url ?? '';
  const pathname = url.split('?')[0]?.split('#')[0] ?? '';

  if (pathname.includes('.')) return;

  for (const [prefix, shell] of Object.entries(DEMO_SHELLS)) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) {
      req.url = shell + (url.includes('?') ? '?' + url.split('?')[1] : '');
      return;
    }
  }
}

function installDemoShellMiddleware(server: Pick<ViteDevServer | PreviewServer, 'middlewares'>): void {
  const handler: Connect.NextHandleFunction = (req, _res, next) => {
    rewriteDemoShell(req);
    next();
  };

  const stack = (server.middlewares as Connect.Server & { stack: { route: string; handle: Connect.NextHandleFunction }[] }).stack;
  stack.unshift({ route: '', handle: handler });
}

function demoShellFallback(): Plugin {
  return {
    name: 'demo-shell-fallback',
    enforce: 'pre',
    configureServer(server) {
      installDemoShellMiddleware(server);
    },
    configurePreviewServer(server) {
      installDemoShellMiddleware(server);
    },
  };
}

export default defineConfig({
  appType: 'mpa',
  build: {
    target: 'es2022',
  },
  plugins: [demoShellFallback()],
});
