/** @jest-environment jsdom */

import { AuraRoute } from '../../aura-route/core/aura-route';
import { ScrollRestoration } from '../core/scroll-restoration';

function matched(path: string, route: AuraRoute) {
  return {
    href: path,
    pathname: path,
    search: '',
    hash: '',
    pattern: path,
    route,
  };
}

describe('ScrollRestoration', () => {
  let container: ScrollContainerMock;

  beforeAll(() => {
    if (!customElements.get(AuraRoute.is)) {
      customElements.define(AuraRoute.is, AuraRoute);
    }
  });

  beforeEach(() => {
    container = new ScrollContainerMock();
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('scrolls to top on push when policy is top', () => {
    const route = createRoute('/checkout', 'top');
    const restoration = new ScrollRestoration(container);

    restoration.handleCommit({
      from: null,
      to: matched('/checkout', route),
      action: 'push',
      hash: '',
    });

    expect(container.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('restores saved scroll on pop when policy is restore', () => {
    const feed = createRoute('/feed', 'restore');
    const checkout = createRoute('/checkout', 'top');
    const restoration = new ScrollRestoration(container);

    container.scrollY = 480;
    restoration.handleCommit({
      from: matched('/feed', feed),
      to: matched('/checkout', checkout),
      action: 'push',
      hash: '',
    });

    container.scrollY = 0;
    restoration.handleCommit({
      from: matched('/checkout', checkout),
      to: matched('/feed', feed),
      action: 'pop',
      hash: '',
    });

    expect(container.scrollTo).toHaveBeenLastCalledWith(0, 480);
  });

  it('does nothing when policy is manual', () => {
    const route = createRoute('/quiet', '');
    const restoration = new ScrollRestoration(container);

    restoration.handleCommit({
      from: null,
      to: matched('/quiet', route),
      action: 'push',
      hash: '',
    });

    expect(container.scrollTo).not.toHaveBeenCalled();
  });

  it('skips auto scroll when hash is present', () => {
    const route = createRoute('/docs', 'top');
    const restoration = new ScrollRestoration(container);

    restoration.handleCommit({
      from: null,
      to: matched('/docs', route),
      action: 'push',
      hash: '#section',
    });

    expect(container.scrollTo).not.toHaveBeenCalled();
  });
});

function createRoute(path: string, scroll: string): AuraRoute {
  const route = document.createElement(AuraRoute.is) as AuraRoute;
  route.setAttribute('path', path);
  route.setAttribute('scroll', scroll);
  return route;
}

class ScrollContainerMock implements Pick<Window, 'scrollY' | 'scrollTo'> {
  scrollY = 0;
  scrollTo = jest.fn((x: number, y: number) => {
    this.scrollY = y;
  });
}
