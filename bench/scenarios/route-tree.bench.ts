/**
 * Bench: buildRouteTree rebuild — full tree allocation on refreshRoutes.
 * Maps to NAVIGATION_PERF_AUDIT §6.
 *
 * Run: npm run bench:route-tree
 */
import { buildRouteTree } from '../../src/modules/aura-routing-engine/core/route-tree/build-route-tree';
import { AuraRoute } from '../../src/modules/aura-route/core/aura-route';
import { AuraRouter } from '../../src/modules/aura-router/core/aura-router';
import { BenchSession, isBenchMain, type SavedReport } from '../lib/report';
const BENCH_ID = 'route-tree';
async function setupJsdom(): Promise<boolean> {
  try {
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    const g = globalThis as typeof globalThis & {
      window?: Window;
      document?: Document;
      HTMLElement?: typeof HTMLElement;
      customElements?: CustomElementRegistry;
    };
    g.window = dom.window as unknown as Window;
    g.document = dom.window.document;
    g.HTMLElement = dom.window.HTMLElement;
    g.customElements = dom.window.customElements;
    if (!customElements.get(AuraRoute.is)) {
      customElements.define(AuraRoute.is, AuraRoute);
    }
    if (!customElements.get(AuraRouter.is)) {
      customElements.define(AuraRouter.is, AuraRouter);
    }
    return true;
  } catch {
    return false;
  }
}
function collectRoutes(router: AuraRouter): AuraRoute[] {
  const routes: AuraRoute[] = [];
  const walk = (el: Element) => {
    if (el instanceof AuraRoute) routes.push(el);
    for (const c of el.querySelectorAll(`:scope > ${AuraRoute.is}`)) walk(c);
  };
  for (const c of router.querySelectorAll(`:scope > ${AuraRoute.is}`)) walk(c);
  return routes;
}
function buildFlatDomRoutes(count: number): AuraRoute[] {
  const router = document.createElement(AuraRouter.is) as AuraRouter;
  document.body.appendChild(router);
  for (let i = 0; i < count; i++) {
    const route = document.createElement(AuraRoute.is) as AuraRoute;
    route.setAttribute('path', `/r-${i}`);
    route.setAttribute('view', 'html::<p/>');
    router.appendChild(route);
  }
  return collectRoutes(router);
}
function buildNestedDomRoutes(sectionCount: number): AuraRoute[] {
  const router = document.createElement(AuraRouter.is) as AuraRouter;
  document.body.appendChild(router);
  const app = document.createElement(AuraRoute.is) as AuraRoute;
  app.setAttribute('path', '/app');
  app.setAttribute('layout', 'shell');
  router.appendChild(app);
  for (let i = 0; i < sectionCount; i++) {
    const child = document.createElement(AuraRoute.is) as AuraRoute;
    child.setAttribute('path', `section-${i}`);
    child.setAttribute('view', 'html::<section/>');
    app.appendChild(child);
  }
  return collectRoutes(router);
}
export async function runRouteTreeBench(): Promise<SavedReport | null> {
  const session = new BenchSession({
    id: BENCH_ID,
    title: 'Route tree build benchmark',
    auditRef: 'NAVIGATION_PERF_AUDIT §6 refreshRoutes rebuild',
    npmScript: 'npm run bench:route-tree',
  });
  session.header();
  const ok = await setupJsdom();
  if (!ok) {
    session.log('  ✗ jsdom not found');
    session.footer();
    session.save();
    process.exitCode = 1;
    return null;
  }
  for (const count of [20, 50, 100] as const) {
    const routes = buildFlatDomRoutes(count);
    session.runScenario(
      `buildRouteTree flat (n=${count})`,
      [{ name: 'buildRouteTree', fn: () => { buildRouteTree(routes); } }],
      { ops: count >= 100 ? 500 : 2_000 },
    );
    document.body.innerHTML = '';
  }
  for (const sections of [5, 20, 50] as const) {
    const routes = buildNestedDomRoutes(sections);
    session.runScenario(
      `buildRouteTree nested /app + ${sections} children`,
      [{ name: 'buildRouteTree', fn: () => { buildRouteTree(routes); } }],
      { ops: 1_000 },
    );
    document.body.innerHTML = '';
  }
  session.footer();
  return session.save();
}
if (isBenchMain(import.meta.url)) {
  runRouteTreeBench();
}