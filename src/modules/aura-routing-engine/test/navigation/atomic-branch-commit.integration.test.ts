/** @jest-environment jsdom */

import { AuraRouter } from '../../../aura-router/core/aura-router';
import { registerAuraRouterComponents } from '../../../aura-router/core/aura-router-setup';
import { AuraRoute } from '../../../aura-route/core/aura-route';
import { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import { AuraRoutingEngine } from '../../core/aura-routing-engine';
import { AuraRoutingUrlMatcher } from '../../core/match/url-matcher';
import { NavigationTransaction } from '../../core/navigation/navigation-transaction';
import { NavigationTransactionPipeline } from '../../core/navigation/navigation-transaction-pipeline';
import { buildRouteTree } from '../../core/route-tree/build-route-tree';
import { buildTransitionPlan } from '../../core/route-tree/transition-plan';
import { createDomRoute } from '../helpers/test-route-dom';

const SLOW_CHILD_LOADER = 'branch-slow-child';
const FAIL_CHILD_LOADER = 'branch-fail-child';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function raceAbort(wait: Promise<void>, signal?: AbortSignal): Promise<void> {
  if (!signal) return wait;
  if (signal.aborted) {
    return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
  }
  return Promise.race([
    wait,
    new Promise<void>((_, reject) => {
      signal.addEventListener(
        'abort',
        () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError')),
        { once: true },
      );
    }),
  ]);
}

function createGatedLoader<T>(payload: T): { loader: (ctx: { signal?: AbortSignal }) => Promise<T>; release: () => void } {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    loader: async (ctx) => {
      await raceAbort(gate, ctx.signal);
      return payload;
    },
    release,
  };
}

async function waitForText(outlet: AuraOutlet, text: string, timeout = 3000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (outlet.textContent?.includes(text)) return;
    await sleep(10);
  }
  throw new Error(`Timed out waiting for "${text}" in outlet`);
}

type Fixture = {
  router: AuraRouter;
  childGate: { release: () => void };
};

function registerSlowChildLoader(gate: { loader: (ctx: { signal?: AbortSignal }) => Promise<string> }): void {
  AuraRouter.registerLoader(SLOW_CHILD_LOADER, (ctx) => gate.loader(ctx));
}

async function mountBranchFixture(routerAttrs: Record<string, string> = {}): Promise<Fixture> {
  const childGate = createGatedLoader('<span data-child-marker>CHILD</span>');
  registerSlowChildLoader(childGate);

  document.body.innerHTML = `
    <template id="users-layout">
      <header data-layout-marker>LAYOUT</header>
      <aura-outlet></aura-outlet>
    </template>
    <template id="intro-view">INTRO PAGE</template>
  `;

  const child = createDomRoute('list');
  child.setAttribute('view', `${SLOW_CHILD_LOADER}::x`);
  const users = createDomRoute('/users', [child]);
  users.setAttribute('layout', 'users-layout');
  const home = createDomRoute('/');
  home.setAttribute('view', 'template::intro-view');
  const gallery = createDomRoute('/gallery');
  gallery.setAttribute('view', 'html::<span data-gallery>GALLERY</span>');

  registerAuraRouterComponents();
  const router = document.createElement(AuraRouter.is) as AuraRouter;
  for (const [name, value] of Object.entries(routerAttrs)) {
    router.setAttribute(name, value);
  }
  router.append(
    document.createElement(AuraOutlet.is),
    home,
    users,
    gallery,
  );
  document.body.append(router);

  await customElements.whenDefined(AuraRoute.is);
  await Promise.resolve();
  router.refreshRoutes();

  router.navigate('/', { replace: true, syncHistory: false });
  await waitForText(router.appOutlet, 'INTRO');

  return { router, childGate };
}

function createEngine(router: AuraRouter): AuraRoutingEngine {
  const engine = new AuraRoutingEngine(router, {
    contentLoad: router.contentLoad,
  });
  engine.replaceRoutes(Array.from(router.routes));
  return engine;
}

function matchAt(router: AuraRouter, pathname: string) {
  const matcher = new AuraRoutingUrlMatcher();
  const tree = buildRouteTree(Array.from(router.routes));
  const hit = matcher.matchPath(pathname, tree.matchableNodes);
  if (!hit) throw new Error(`No match for ${pathname}`);
  return matcher.toRouteInfo(pathname, pathname, '', '', hit.node, hit.params);
}

async function runRenderStep(
  router: AuraRouter,
  fromPath: string,
  toPath: string,
  options?: { cancelAfterMs?: number },
): Promise<{ outcome: Awaited<ReturnType<NavigationTransactionPipeline['runRender']>>; transaction: NavigationTransaction }> {
  const engine = createEngine(router);
  const from = matchAt(router, fromPath);
  const to = matchAt(router, toPath);

  const transaction = new NavigationTransaction(
    1,
    0,
    {
      from,
      to,
      action: 'push',
      href: toPath,
      hash: '',
      options: { replace: false, syncHistory: false },
    },
    () => false,
    engine,
  );
  transaction.transitionPlan = buildTransitionPlan(from, to);
  transaction.transitionOrder = null;

  const pipeline = new NavigationTransactionPipeline(transaction);
  const renderPromise = pipeline.runRender();

  if (options?.cancelAfterMs != null) {
    await sleep(options.cancelAfterMs);
    transaction.cancel();
  }

  const outcome = await renderPromise;
  return { outcome, transaction };
}

function isLayoutOnlyGap(text: string): boolean {
  return text.includes('LAYOUT') && !text.includes('CHILD') && !text.includes('INTRO');
}

describe('atomic branch commit integration', () => {
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
    AuraRouter.registerLoader(SLOW_CHILD_LOADER, async () => {
      loads++;
      return '<span data-child-marker>CACHED-CHILD</span>';
    });

    document.body.innerHTML = `
      <template id="users-layout">
        <header data-layout-marker>LAYOUT</header>
        <aura-outlet></aura-outlet>
      </template>
      <template id="intro-view">INTRO PAGE</template>
    `;

    const child = createDomRoute('list');
    child.setAttribute('view', `${SLOW_CHILD_LOADER}::x`);
    const users = createDomRoute('/users', [child]);
    users.setAttribute('layout', 'users-layout');
    const home = createDomRoute('/');
    home.setAttribute('view', 'template::intro-view');

    registerAuraRouterComponents();
    const router = document.createElement(AuraRouter.is) as AuraRouter;
    router.append(document.createElement(AuraOutlet.is), home, users);
    document.body.append(router);

    await customElements.whenDefined(AuraRoute.is);
    await Promise.resolve();
    router.refreshRoutes();
    router.navigate('/', { replace: true, syncHistory: false });
    await waitForText(router.appOutlet, 'INTRO');

    await router.prefetch('/users/list');
    expect(loads).toBe(1);

    router.navigate('/users/list', { replace: false, syncHistory: false });
    await waitForText(router.appOutlet, 'CACHED-CHILD');

    expect(router.appOutlet.textContent).toContain('LAYOUT');
    expect(router.appOutlet.textContent).toContain('CACHED-CHILD');
  });

  it('mount-strategy="per-route" mounts layout before async child resolves', async () => {
    const { router, childGate } = await mountBranchFixture({ 'mount-strategy': 'per-route' });
    const outlet = router.appOutlet;

    router.navigate('/users/list', { replace: false, syncHistory: false });
    await sleep(40);

    expect(outlet.textContent).toContain('LAYOUT');
    expect(outlet.textContent).not.toContain('CHILD');

    childGate.release();
    await waitForText(outlet, 'CHILD');
  });

  it('render error during branch resolve leaves outgoing DOM intact', async () => {
    AuraRouter.registerLoader(FAIL_CHILD_LOADER, async () => {
      throw new Error('branch resolve failed');
    });

    document.body.innerHTML = `
      <template id="users-layout">
        <header data-layout-marker>LAYOUT</header>
        <aura-outlet></aura-outlet>
      </template>
      <template id="intro-view">INTRO PAGE</template>
    `;

    const child = createDomRoute('list');
    child.setAttribute('view', `${FAIL_CHILD_LOADER}::x`);
    const users = createDomRoute('/users', [child]);
    users.setAttribute('layout', 'users-layout');
    const home = createDomRoute('/');
    home.setAttribute('view', 'template::intro-view');

    registerAuraRouterComponents();
    const router = document.createElement(AuraRouter.is) as AuraRouter;
    router.append(document.createElement(AuraOutlet.is), home, users);
    document.body.append(router);

    await customElements.whenDefined(AuraRoute.is);
    await Promise.resolve();
    router.refreshRoutes();
    router.navigate('/', { replace: true, syncHistory: false });
    await waitForText(router.appOutlet, 'INTRO');

    const { outcome } = await runRenderStep(router, '/', '/users/list');

    expect(outcome?.status).toBe('error');
    expect(router.appOutlet.textContent).not.toContain('LAYOUT');
  });

  it('preserve.view keeps outgoing visible during branch resolve', async () => {
    document.body.innerHTML = `
      <template id="users-layout">
        <header data-layout-marker>LAYOUT</header>
        <aura-outlet></aura-outlet>
      </template>
      <template id="intro-view">INTRO PAGE</template>
    `;

    const childGate = createGatedLoader('<span data-child-marker>CHILD</span>');
    registerSlowChildLoader(childGate);

    const child = createDomRoute('list');
    child.setAttribute('view', `${SLOW_CHILD_LOADER}::x`);
    const users = createDomRoute('/users', [child]);
    users.setAttribute('layout', 'users-layout');
    const home = createDomRoute('/');
    home.setAttribute('view', 'template::intro-view');
    home.setAttribute('preserve', 'view');

    registerAuraRouterComponents();
    const router = document.createElement(AuraRouter.is) as AuraRouter;
    router.append(document.createElement(AuraOutlet.is), home, users);
    document.body.append(router);

    await customElements.whenDefined(AuraRoute.is);
    await Promise.resolve();
    router.refreshRoutes();
    router.navigate('/', { replace: true, syncHistory: false });
    await waitForText(router.appOutlet, 'INTRO');

    router.navigate('/users/list', { replace: false, syncHistory: false });
    await sleep(40);

    expect(router.appOutlet.textContent).toContain('INTRO');

    childGate.release();
    await waitForText(router.appOutlet, 'CHILD');
  });
});
