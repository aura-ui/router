/** @jest-environment jsdom */

import { AuraRoute } from '../../../aura-route/core/aura-route';
import { AuraRouter } from '../../../aura-router/core/aura-router';
import { AuraRoutingEngine } from '../../core/aura-routing-engine';
import type { LoaderFn } from '../../core';
import { NavigationTransaction } from '../../core/navigation/navigation-transaction';
import { NavigationTransactionPipeline } from '../../core/navigation/navigation-transaction-pipeline';
import { buildTransitionPlan } from '../../core/route-tree/transition-plan';
import {
  createNavigationTransaction,
  withPlanTransitionOrder,
} from '../_helpers/create-mock-transaction';
import { mountDomRouter, matchRouterPath } from '../_helpers/dom-router-harness';
import { createGatedLoader } from '../_helpers/gated-loader';
import { sleep, waitForText } from '../_helpers/jsdom-async';
import { createDomRoute } from '../_helpers/test-route-dom';

const SLOW_CHILD_LOADER = 'branch-slow-child';
const FAIL_CHILD_LOADER = 'branch-fail-child';

const BRANCH_TEMPLATES = `
  <template id="users-layout">
    <header data-layout-marker>LAYOUT</header>
    <aura-outlet></aura-outlet>
  </template>
  <template id="intro-view">INTRO PAGE</template>
`;

  type SlowChildFn = (ctx: { signal?: AbortSignal }) => Promise<string>;

type Fixture = {
  router: AuraRouter;
  childGate: { release: () => void };
};

/** Process-wide registry: register once, swap impl per test (avoids overwrite warn). */
let slowChildFn: SlowChildFn = async () => {
  throw new Error(`${SLOW_CHILD_LOADER} not configured`);
};

function useSlowChild(fn: SlowChildFn): void {
  slowChildFn = fn;
}

function registerSlowChildLoader(gate: { loader: SlowChildFn }): void {
  useSlowChild((ctx) => gate.loader(ctx));
}

function buildBranchRoutes(options: {
  childLoader?: string;
  includeGallery?: boolean;
  homeCacheDom?: boolean;
} = {}): AuraRoute[] {
  const childLoader = options.childLoader ?? SLOW_CHILD_LOADER;
  const child = createDomRoute('list');
  child.setAttribute('view', `${childLoader}::x`);
  const users = createDomRoute('/users', [child]);
  users.setAttribute('layout', 'users-layout');
  const home = createDomRoute('/');
  home.setAttribute('view', 'template::intro-view');
  if (options.homeCacheDom) home.setAttribute('cache', 'dom');

  const routes = [home, users];
  if (options.includeGallery !== false) {
    const gallery = createDomRoute('/gallery');
    gallery.setAttribute('view', 'html::<span data-gallery>GALLERY</span>');
    routes.push(gallery);
  }
  return routes;
}

async function mountBranchFixture(routerAttrs: Record<string, string> = {}): Promise<Fixture> {
  const childGate = createGatedLoader('<span data-child-marker>CHILD</span>');
  registerSlowChildLoader(childGate);

  const { router } = await mountDomRouter({
    templates: BRANCH_TEMPLATES,
    routes: buildBranchRoutes(),
    routerAttrs,
    bootPath: '/',
    bootText: 'INTRO',
  });

  return { router, childGate };
}

function createEngine(router: AuraRouter): AuraRoutingEngine {
  const engine = new AuraRoutingEngine(router);
  engine.replaceRoutes(Array.from(router.routes));
  return engine;
}

async function runRenderStep(
  router: AuraRouter,
  fromPath: string,
  toPath: string,
  options?: { cancelAfterMs?: number; transitionOrder?: 'out-in' | 'in-out' | 'parallel' | null },
): Promise<{ outcome: Awaited<ReturnType<NavigationTransactionPipeline['runRender']>>; transaction: NavigationTransaction }> {
  const engine = createEngine(router);
  const from = matchRouterPath(router, fromPath);
  const to = matchRouterPath(router, toPath);

  let plan = buildTransitionPlan(from, to);
  if (options?.transitionOrder !== undefined) {
    plan = withPlanTransitionOrder(plan, options.transitionOrder);
  }
  const transaction = createNavigationTransaction({
    engine,
    from,
    to,
    href: toPath,
    options: { replace: false, syncHistory: false },
    plan,
  });

  const pipeline = new NavigationTransactionPipeline(transaction);
  const preparePromise = pipeline.runLoads();

  if (options?.cancelAfterMs != null) {
    await sleep(options.cancelAfterMs);
    transaction.cancel();
  }

  const prepareOutcome = await preparePromise;
  if (prepareOutcome) {
    return { outcome: prepareOutcome, transaction };
  }

  const outcome = options?.transitionOrder
    ? await pipeline.runRenderWithTransition()
    : await pipeline.runRender();

  return { outcome, transaction };
}

async function mountBranchFixtureWithTransition(
  transitionOrder: 'out-in' | 'in-out' | 'parallel' = 'out-in',
): Promise<Fixture> {
  const fixture = await mountBranchFixture();
  const users = fixture.router.querySelector('aura-route[path="/users"]') as AuraRoute;
  const child = users.querySelector(':scope > aura-route') as AuraRoute;
  child.setAttribute('transition-order', transitionOrder);
  child.setAttribute('transition', 'fade');
  fixture.router.refreshRoutes();
  return fixture;
}

function isLayoutOnlyGap(text: string): boolean {
  return text.includes('LAYOUT') && !text.includes('CHILD') && !text.includes('INTRO');
}

describe('atomic branch commit integration', () => {
  beforeAll(() => {
    AuraRouter.registerLoader(
      SLOW_CHILD_LOADER,
      ((ctx: { signal?: AbortSignal }) => slowChildFn(ctx)) as unknown as LoaderFn,
    );
    AuraRouter.registerLoader(FAIL_CHILD_LOADER, async () => {
      throw new Error('branch resolve failed');
    });
  });

  beforeEach(() => {
    slowChildFn = async () => {
      throw new Error(`${SLOW_CHILD_LOADER} not configured`);
    };
  });

  afterEach(() => {
    document.body.replaceChildren();
    history.replaceState(null, '', '/');
  });

  it('intro → nested async child never shows layout-only gap', async () => {
    const { router, childGate } = await mountBranchFixture();
    const outlet = router.appOutlet;
    const violations: string[] = [];

    const poll = setInterval(() => {
      const text = outlet.textContent ?? '';
      if (isLayoutOnlyGap(text)) violations.push(text);
    }, 5);

    router.navigate('/users/list', { replace: false, syncHistory: false });
    await sleep(40);
    childGate.release();
    await waitForText(outlet, 'CHILD');

    clearInterval(poll);

    expect(violations).toEqual([]);
    expect(outlet.textContent).toContain('LAYOUT');
    expect(outlet.textContent).toContain('CHILD');
  });

  it('keeps outgoing visible until the full branch resolves', async () => {
    const { router, childGate } = await mountBranchFixture();
    const outlet = router.appOutlet;

    router.navigate('/users/list', { replace: false, syncHistory: false });
    await sleep(40);

    expect(outlet.textContent).toContain('INTRO');
    expect(outlet.textContent).not.toContain('LAYOUT');

    childGate.release();
    await waitForText(outlet, 'CHILD');
  });

  it('cancels mid-resolve without touching DOM', async () => {
    const { router } = await mountBranchFixture();
    const outlet = router.appOutlet;

    const { outcome } = await runRenderStep(router, '/', '/users/list', { cancelAfterMs: 30 });

    expect(outcome).toEqual({ status: 'cancelled' });
    expect(outlet.textContent).toContain('INTRO');
    expect(outlet.textContent).not.toContain('LAYOUT');
  });

  it('supersedes A→B mid-resolve and discards A payloads', async () => {
    const { router, childGate } = await mountBranchFixture();
    const outlet = router.appOutlet;

    router.navigate('/users/list', { replace: false, syncHistory: false });
    await sleep(20);
    router.navigate('/gallery', { replace: false, syncHistory: false });

    await waitForText(outlet, 'GALLERY');

    expect(outlet.textContent).toContain('GALLERY');
    expect(outlet.textContent).not.toContain('LAYOUT');
    expect(outlet.textContent).not.toContain('INTRO');

    childGate.release();
    await sleep(50);
    expect(outlet.textContent).toContain('GALLERY');
  });

  it('prefetch resolves child content before navigate', async () => {
    let loads = 0;
    useSlowChild(async () => {
      loads++;
      return '<span data-child-marker>CACHED-CHILD</span>';
    });

    const { router } = await mountDomRouter({
      templates: BRANCH_TEMPLATES,
      routes: buildBranchRoutes({ includeGallery: false }),
      bootPath: '/',
      bootText: 'INTRO',
    });

    await router.prefetch('/users/list');
    expect(loads).toBe(1);

    router.navigate('/users/list', { replace: false, syncHistory: false });
    await waitForText(router.appOutlet, 'CACHED-CHILD');

    expect(router.appOutlet.textContent).toContain('LAYOUT');
    expect(router.appOutlet.textContent).toContain('CACHED-CHILD');
  });

  it('branch mount waits for async child then applies layout+child together', async () => {
    const { router, childGate } = await mountBranchFixture({ 'mount-strategy': 'branch' });
    const outlet = router.appOutlet;

    router.navigate('/users/list', { replace: false, syncHistory: false });
    await sleep(40);

    // prepare holds render until child resolves — layout not painted alone
    expect(outlet.textContent).not.toContain('CHILD');
    expect(outlet.textContent).not.toContain('LAYOUT');

    childGate.release();
    await waitForText(outlet, 'CHILD');
    expect(outlet.textContent).toContain('LAYOUT');
  });

  it('render error during branch resolve leaves outgoing DOM intact', async () => {
    const { router } = await mountDomRouter({
      templates: BRANCH_TEMPLATES,
      routes: buildBranchRoutes({ childLoader: FAIL_CHILD_LOADER, includeGallery: false }),
      bootPath: '/',
      bootText: 'INTRO',
    });

    const { outcome } = await runRenderStep(router, '/', '/users/list');

    expect(outcome?.status).toBe('error');
    expect(router.appOutlet.textContent).not.toContain('LAYOUT');
  });

  it('cache.dom keeps outgoing visible during branch resolve', async () => {
    const childGate = createGatedLoader('<span data-child-marker>CHILD</span>');
    registerSlowChildLoader(childGate);

    const { router } = await mountDomRouter({
      templates: BRANCH_TEMPLATES,
      routes: buildBranchRoutes({ includeGallery: false, homeCacheDom: true }),
      bootPath: '/',
      bootText: 'INTRO',
    });

    router.navigate('/users/list', { replace: false, syncHistory: false });
    await sleep(40);

    expect(router.appOutlet.textContent).toContain('INTRO');

    childGate.release();
    await waitForText(router.appOutlet, 'CHILD');
  });

  it('out-in transition + nested async child never shows layout-only gap', async () => {
    const { router, childGate } = await mountBranchFixtureWithTransition('out-in');
    const outlet = router.appOutlet;
    const violations: string[] = [];

    const poll = setInterval(() => {
      const text = outlet.textContent ?? '';
      if (isLayoutOnlyGap(text)) violations.push(text);
    }, 5);

    router.navigate('/users/list', { replace: false, syncHistory: false });
    await sleep(40);
    childGate.release();
    await waitForText(outlet, 'CHILD');

    clearInterval(poll);

    expect(violations).toEqual([]);
    expect(outlet.textContent).toContain('LAYOUT');
    expect(outlet.textContent).toContain('CHILD');
  });

  it('out-in transition keeps outgoing visible during branch resolve', async () => {
    const { router, childGate } = await mountBranchFixtureWithTransition('out-in');
    const outlet = router.appOutlet;

    router.navigate('/users/list', { replace: false, syncHistory: false });
    await sleep(40);

    expect(outlet.textContent).toContain('INTRO');
    expect(outlet.textContent).not.toContain('LAYOUT');

    childGate.release();
    await waitForText(outlet, 'CHILD');
  });

  it('cancels mid-resolve with out-in transition without touching DOM', async () => {
    const { router } = await mountBranchFixtureWithTransition('out-in');
    const outlet = router.appOutlet;

    const { outcome } = await runRenderStep(router, '/', '/users/list', {
      cancelAfterMs: 30,
      transitionOrder: 'out-in',
    });

    expect(outcome).toEqual({ status: 'cancelled' });
    expect(outlet.textContent).toContain('INTRO');
    expect(outlet.textContent).not.toContain('LAYOUT');
  });
});
