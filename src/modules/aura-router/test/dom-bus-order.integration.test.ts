/** @jest-environment jsdom */

import type { EngineEvent, RouteHookDefinition } from '../../aura-routing-engine/core';
import { AuraRouter } from '../core/aura-router';
import { installAuraRouter } from '../core/install';
import {
  AURA_ROUTER_LOAD_END,
  AURA_ROUTER_LOAD_START,
  AURA_ROUTER_NAVIGATION,
  AURA_ROUTER_NAVIGATION_CANCEL,
  AURA_ROUTER_NAVIGATION_COMPLETE,
  AURA_ROUTER_NAVIGATION_REDIRECT,
  AURA_ROUTER_NAVIGATION_START,
} from '../core/navigation-events';
import { getRouterEngine } from './_helpers/get-router-engine';

const DOM_LIFECYCLE = [
  AURA_ROUTER_NAVIGATION_START,
  AURA_ROUTER_LOAD_START,
  AURA_ROUTER_LOAD_END,
  AURA_ROUTER_NAVIGATION,
  AURA_ROUTER_NAVIGATION_COMPLETE,
  AURA_ROUTER_NAVIGATION_CANCEL,
  AURA_ROUTER_NAVIGATION_REDIRECT,
] as const;

async function flushNavigation(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

async function waitForBus(
  bus: EngineEvent['type'][],
  type: EngineEvent['type'],
  timeoutMs = 1000,
): Promise<void> {
  const started = Date.now();
  while (!bus.includes(type)) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Timed out waiting for bus event "${type}"; saw ${JSON.stringify(bus)}`);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
}

type Collectors = {
  bus: EngineEvent['type'][];
  dom: string[];
  clear: () => void;
};

function attachCollectors(router: AuraRouter): Collectors {
  const bus: EngineEvent['type'][] = [];
  const dom: string[] = [];

  getRouterEngine(router).events.subscribe((event) => {
    bus.push(event.type);
  });

  for (const name of DOM_LIFECYCLE) {
    router.addEventListener(name, () => {
      dom.push(name);
    });
  }

  return {
    bus,
    dom,
    clear: () => {
      bus.length = 0;
      dom.length = 0;
    },
  };
}

describe('AuraRouter DOM + bus order (EB3)', () => {
  beforeAll(() => {
    installAuraRouter();
  });

  beforeEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    document.body.innerHTML = '';
    AuraRouter.unuse('eb3-load');
    AuraRouter.unuse('eb3-slow-load');
  });

  async function mount(html: string): Promise<{ router: AuraRouter; collectors: Collectors }> {
    const router = document.createElement(AuraRouter.is) as AuraRouter;
    router.innerHTML = html;
    document.body.append(router);
    await customElements.whenDefined('aura-route');
    await flushNavigation();
    const collectors = attachCollectors(router);
    return { router, collectors };
  }

  it('happy path (full): prepare/load/commit on bus; DOM start → navigation → complete', async () => {
    AuraRouter.use({
      name: 'eb3-load',
      version: '1.0.0',
      fn: (async (ctx: Parameters<RouteHookDefinition['fn']>[0]) => {
        if (ctx.phase === 'load') return { ok: true };
      }) as unknown as RouteHookDefinition['fn'],
    });

    const { router, collectors } = await mount(`
      <aura-route path="/" view="html::<p>home</p>"></aura-route>
      <aura-route path="/about" view="html::<p>about</p>" load="eb3-load"></aura-route>
    `);
    collectors.clear();

    router.navigate('/about');
    await flushNavigation();

    expect(collectors.bus).toEqual([
      'navigation:start',
      'node:deactivate',
      'navigation:prepare:start',
      'navigation:url-aligned',
      'load:start',
      'load:end',
      'navigation:prepare:end',
      'navigation:commit:start',
      'navigation:commit:end',
      'node:activate',
      'navigation:finish',
    ]);
    expect(collectors.dom).toEqual([
      AURA_ROUTER_NAVIGATION_START,
      AURA_ROUTER_LOAD_START,
      AURA_ROUTER_LOAD_END,
      AURA_ROUTER_NAVIGATION,
      AURA_ROUTER_NAVIGATION_COMPLETE,
    ]);
  });

  it('fast path: no prepare/load; DOM start → navigation → complete', async () => {
    const { router, collectors } = await mount(`
      <aura-route path="/" view="html::<p>home</p>"></aura-route>
      <aura-route path="/about" view="html::<p>about</p>"></aura-route>
    `);
    collectors.clear();

    router.navigate('/about');
    await flushNavigation();

    expect(collectors.bus).toEqual([
      'navigation:start',
      'node:deactivate',
      'navigation:url-aligned',
      'navigation:commit:start',
      'navigation:commit:end',
      'node:activate',
      'navigation:finish',
    ]);
    expect(collectors.dom).toEqual([
      AURA_ROUTER_NAVIGATION_START,
      AURA_ROUTER_NAVIGATION,
      AURA_ROUTER_NAVIGATION_COMPLETE,
    ]);
  });

  it('cancel (supersede): loser cancel after winner url-aligned; winner completes', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    AuraRouter.use({
      name: 'eb3-slow-load',
      version: '1.0.0',
      fn: (async (ctx: Parameters<RouteHookDefinition['fn']>[0]) => {
        if (ctx.phase === 'load') {
          await gate;
          return { ok: true };
        }
      }) as unknown as RouteHookDefinition['fn'],
    });

    const { router, collectors } = await mount(`
      <aura-route path="/" view="html::<p>home</p>"></aura-route>
      <aura-route path="/slow" view="html::<p>slow</p>" load="eb3-slow-load"></aura-route>
      <aura-route path="/about" view="html::<p>about</p>"></aura-route>
    `);
    collectors.clear();

    router.navigate('/slow');
    await waitForBus(collectors.bus, 'load:start');
    expect(collectors.dom).toEqual([
      AURA_ROUTER_NAVIGATION_START,
      AURA_ROUTER_LOAD_START,
    ]);

    router.navigate('/about');
    release();
    await flushNavigation();
    await waitForBus(collectors.bus, 'navigation:finish');

    expect(collectors.bus).toEqual([
      // superseded /slow (full, blocked in load)
      'navigation:start',
      'node:deactivate',
      'navigation:prepare:start',
      'navigation:url-aligned',
      'load:start',
      // winner /about (fast) — url-aligned before loser cancel
      'navigation:start',
      'node:deactivate',
      'navigation:url-aligned',
      'navigation:cancel',
      'navigation:commit:start',
      'navigation:commit:end',
      'node:activate',
      'navigation:finish',
    ]);
    expect(collectors.dom).toEqual([
      AURA_ROUTER_NAVIGATION_START, // /slow
      AURA_ROUTER_LOAD_START,
      AURA_ROUTER_NAVIGATION_START, // /about
      AURA_ROUTER_NAVIGATION_CANCEL,
      AURA_ROUTER_NAVIGATION,
      AURA_ROUTER_NAVIGATION_COMPLETE,
    ]);
    expect(window.location.pathname).toBe('/about');
  });

  it('redirect (collapsed walk): no redirect terminal; final nav completes on target', async () => {
    const { router, collectors } = await mount(`
      <aura-route path="/" view="html::<p>home</p>"></aura-route>
      <aura-route path="/go" redirect="/about"></aura-route>
      <aura-route path="/about" view="html::<p>about</p>"></aura-route>
    `);
    collectors.clear();

    router.navigate('/go');
    await flushNavigation();

    // Client redirect walk collapses before pipeline — no bus/DOM redirect terminal.
    expect(collectors.bus).not.toContain('navigation:redirect');
    expect(collectors.dom).not.toContain(AURA_ROUTER_NAVIGATION_REDIRECT);

    expect(collectors.bus).toEqual([
      'navigation:start',
      'node:deactivate',
      'navigation:url-aligned',
      'navigation:commit:start',
      'navigation:commit:end',
      'node:activate',
      'navigation:finish',
    ]);
    expect(collectors.dom).toEqual([
      AURA_ROUTER_NAVIGATION_START,
      AURA_ROUTER_NAVIGATION,
      AURA_ROUTER_NAVIGATION_COMPLETE,
    ]);
    expect(window.location.pathname).toBe('/about');
  });

  it('redirect bus terminal maps to navigation-redirect DOM', async () => {
    const { router, collectors } = await mount(`
      <aura-route path="/" view="html::<p>home</p>"></aura-route>
    `);
    collectors.clear();

    const listener = jest.fn();
    router.addEventListener(AURA_ROUTER_NAVIGATION_REDIRECT, listener);

    getRouterEngine(router).events.emit({
      type: 'navigation:redirect',
      id: 42,
      url: '/login',
      replace: true,
    });

    expect(collectors.bus).toEqual(['navigation:redirect']);
    expect(collectors.dom).toEqual([AURA_ROUTER_NAVIGATION_REDIRECT]);
    const detail = (listener.mock.calls[0]![0] as CustomEvent).detail;
    expect(detail).toEqual(
      expect.objectContaining({
        id: 42,
        url: '/login',
        replace: true,
        router,
      }),
    );
  });
});
