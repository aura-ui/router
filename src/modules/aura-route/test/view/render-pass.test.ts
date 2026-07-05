import { NO_PRESERVE, type MatchedRouteInfo } from '../../../aura-routing-engine/core';
import { NO_TRANSITION } from '../../core/attr/transition-attr-parser';
import { createRenderPass } from '../../core/view/render-pass';
import type { AuraRouteInterface } from '../../core/types';

function matched(pathname: string): MatchedRouteInfo {
  return {
    href: pathname,
    pathname,
    search: '',
    hash: '',
    pattern: pathname,
  } as MatchedRouteInfo;
}

function route(overrides: Partial<AuraRouteInterface> = {}): AuraRouteInterface {
  return {
    path: 'user/:id',
    layout: '',
    view: null,
    loadingTemplate: '',
    errorTemplate: '',
    scrollPolicy: null,
    preserve: NO_PRESERVE,
    transition: NO_TRANSITION,
    hasLayout: false,
    hasGuard: false,
    hasLeave: false,
    hasLoad: false,
    hasTransitionIn: false,
    hasReady: false,
    hasAsyncContent: false,
    hasSyncContent: false,
    ...overrides,
  };
}

describe('createRenderPass useStagedMount', () => {
  const signal = new AbortController().signal;

  it('stages when route declares transition order', () => {
    const pass = createRenderPass(
      1,
      route({ transition: { order: 'parallel', in: ['fade'], out: ['fade'] } }),
      matched('/users/1'),
      signal,
    );

    expect(pass.useStagedMount).toBe(true);
  });

  it('stages on param-change remount with preserve.view', () => {
    const pass = createRenderPass(
      1,
      route({ preserve: { view: true, data: false } }),
      matched('/users/2'),
      signal,
      undefined,
      true,
    );

    expect(pass.useStagedMount).toBe(true);
  });

  it('replaces on param-change remount without preserve.view', () => {
    const pass = createRenderPass(
      1,
      route({ preserve: NO_PRESERVE }),
      matched('/users/2'),
      signal,
      undefined,
      true,
    );

    expect(pass.useStagedMount).toBe(false);
  });

  it('replaces on ordinary navigation without transition', () => {
    const pass = createRenderPass(
      1,
      route({ preserve: { view: true, data: false } }),
      matched('/users/2'),
      signal,
    );

    expect(pass.useStagedMount).toBe(false);
  });
});
