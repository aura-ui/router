/** @jest-environment jsdom */

import { AuraRoute } from '../../aura-route/core/aura-route';
import { ScrollRestoration, type ScrollContainer } from '../core/scroll-restoration';

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
  let mock: ScrollContainerMock;
  let container: ScrollContainer;

  beforeAll(() => {
    if (!customElements.get(AuraRoute.is)) {
      customElements.define(AuraRoute.is, AuraRoute);
    }
  });

  beforeEach(() => {
    mock = new ScrollContainerMock();
    container = mock as unknown as ScrollContainer;
    document.body.replaceChildren();
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('scrolls to top on push when policy is top', () => {
    const route = createRoute('/checkout', 'top');
    const restoration = new ScrollRestoration(container);

    restoration.apply({
      from: null,
      to: matched('/checkout', route),
      action: 'push',
      hash: '',
    });

    expect(mock.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('restores saved scroll on pop when policy is auto', () => {
    const feed = createRoute('/feed', 'auto');
    const checkout = createRoute('/checkout', 'top');
    const restoration = new ScrollRestoration(container);

    mock.scrollY = 480;
    restoration.apply({
      from: matched('/feed', feed),
      to: matched('/checkout', checkout),
      action: 'push',
      hash: '',
    });

    mock.scrollY = 0;
    restoration.apply({
      from: matched('/checkout', checkout),
      to: matched('/feed', feed),
      action: 'pop',
      hash: '',
    });

    expect(mock.scrollTo).toHaveBeenLastCalledWith(0, 480);
  });

  it('does nothing when policy is none', () => {
    const route = createRoute('/quiet', 'none');
    const restoration = new ScrollRestoration(container);

    restoration.apply({
      from: null,
      to: matched('/quiet', route),
      action: 'push',
      hash: '',
    });

    expect(mock.scrollTo).not.toHaveBeenCalled();
  });

  it('skips auto scroll when hash is present', () => {
    const route = createRoute('/docs', 'top');
    const restoration = new ScrollRestoration(container);

    restoration.apply({
      from: null,
      to: matched('/docs', route),
      action: 'push',
      hash: '#section',
    });

    expect(mock.scrollTo).not.toHaveBeenCalled();
  });

  it('scrolls into view when scroll-target matches', () => {
    const target = document.createElement('div');
    target.id = 'main';
    target.scrollIntoView = jest.fn();
    document.body.append(target);

    const route = createRoute('/docs', 'top', '#main');
    new ScrollRestoration(container).apply({
      from: null,
      to: matched('/docs', route),
      action: 'push',
      hash: '',
    });

    expect(target.scrollIntoView).toHaveBeenCalled();
    expect(mock.scrollTo).not.toHaveBeenCalled();
  });

  it('falls back to top when scroll-target misses or is invalid', () => {
    const restoration = new ScrollRestoration(container);

    restoration.apply({
      from: null,
      to: matched('/docs', createRoute('/docs', 'top', '#missing')),
      action: 'push',
      hash: '',
    });
    expect(mock.scrollTo).toHaveBeenCalledWith(0, 0);

    mock.scrollTo.mockClear();
    restoration.apply({
      from: null,
      to: matched('/docs', createRoute('/docs', 'top', '##')),
      action: 'push',
      hash: '',
    });
    expect(mock.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('ignores scroll-target on pop restore', () => {
    const feed = createRoute('/feed', 'auto', '#main');
    const checkout = createRoute('/checkout', 'top');
    const restoration = new ScrollRestoration(container);

    const target = document.createElement('div');
    target.id = 'main';
    target.scrollIntoView = jest.fn();
    document.body.append(target);

    mock.scrollY = 320;
    restoration.apply({
      from: matched('/feed', feed),
      to: matched('/checkout', checkout),
      action: 'push',
      hash: '',
    });

    mock.scrollY = 0;
    restoration.apply({
      from: matched('/checkout', checkout),
      to: matched('/feed', feed),
      action: 'pop',
      hash: '',
    });

    expect(mock.scrollTo).toHaveBeenLastCalledWith(0, 320);
    expect(target.scrollIntoView).not.toHaveBeenCalled();
  });
});

function createRoute(path: string, scroll: string, scrollTarget?: string): AuraRoute {
  const route = document.createElement(AuraRoute.is) as AuraRoute;
  route.setAttribute('path', path);
  route.setAttribute('scroll', scroll);
  if (scrollTarget) route.setAttribute('scroll-target', scrollTarget);
  return route;
}

class ScrollContainerMock {
  scrollY = 0;
  scrollTo = jest.fn((x: number | ScrollToOptions = 0, y = 0) => {
    this.scrollY = typeof x === 'number' ? y : (x.top ?? 0);
  });
}
