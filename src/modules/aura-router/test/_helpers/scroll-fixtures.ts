import { AuraRoute } from '../../../aura-route/core/aura-route';
import type { ScrollContainer } from '../../core/scroller';

/** Minimal matched leaf for scroll tests. */
export function matchedScrollRoute(path: string, route: AuraRoute) {
  return {
    href: path,
    pathname: path,
    search: '',
    hash: '',
    pattern: path,
    route,
  };
}

export function createScrollRoute(
  path: string,
  scroll: string,
  scrollTarget?: string,
  scrollBehavior?: string,
): AuraRoute {
  const route = document.createElement(AuraRoute.is) as AuraRoute;
  route.setAttribute('path', path);
  route.setAttribute('scroll', scroll);
  if (scrollTarget) route.setAttribute('scroll-target', scrollTarget);
  if (scrollBehavior) route.setAttribute('scroll-behavior', scrollBehavior);
  return route;
}

export class ScrollContainerMock {
  scrollY = 0;
  scrollTo = jest.fn((options: ScrollToOptions = {}) => {
    this.scrollY = options.top ?? 0;
  });
}

export function asScrollContainer(mock: ScrollContainerMock): ScrollContainer {
  return mock as unknown as ScrollContainer;
}

/** Define `<aura-route>` once; mock rAF to run sync. */
export function installScrollTestDom(): void {
  if (!customElements.get(AuraRoute.is)) {
    customElements.define(AuraRoute.is, AuraRoute);
  }
}

export function mockScrollRaf(): void {
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    cb(0);
    return 0;
  });
}
