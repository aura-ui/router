/** @jest-environment jsdom */

import { resolveNativeScrollBehavior, Scroller } from '../core/scroller';
import {
  asScrollContainer,
  createScrollRoute,
  installScrollTestDom,
  matchedScrollRoute,
  mockScrollRaf,
  ScrollContainerMock,
} from './_helpers/scroll-fixtures';

describe('resolveNativeScrollBehavior', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('defaults null/undefined to auto', () => {
    expect(resolveNativeScrollBehavior(null)).toBe('auto');
    expect(resolveNativeScrollBehavior(undefined)).toBe('auto');
  });

  it('passes through smooth and instant', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: jest.fn().mockReturnValue({ matches: false }),
    });
    expect(resolveNativeScrollBehavior('smooth')).toBe('smooth');
    expect(resolveNativeScrollBehavior('instant')).toBe('instant');
  });

  it('forces instant when prefers-reduced-motion and behavior is smooth', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: jest.fn().mockReturnValue({ matches: true }),
    });
    expect(resolveNativeScrollBehavior('smooth')).toBe('instant');
    expect(resolveNativeScrollBehavior('auto')).toBe('auto');
  });
});

describe('Scroller', () => {
  let mock: ScrollContainerMock;
  let scroller: Scroller;

  beforeAll(() => {
    installScrollTestDom();
  });

  beforeEach(() => {
    mock = new ScrollContainerMock();
    scroller = new Scroller(asScrollContainer(mock));
    document.body.replaceChildren();
    mockScrollRaf();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: jest.fn().mockReturnValue({ matches: false }),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('scrolls to top on push when policy is top', () => {
    scroller.apply({
      from: null,
      to: matchedScrollRoute('/checkout', createScrollRoute('/checkout', 'top')),
      action: 'push',
      hash: '',
    });

    expect(mock.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
  });

  it('restores saved scroll on pop when policy is auto', () => {
    const feed = createScrollRoute('/feed', 'auto');
    const checkout = createScrollRoute('/checkout', 'top');

    mock.scrollY = 480;
    scroller.apply({
      from: matchedScrollRoute('/feed', feed),
      to: matchedScrollRoute('/checkout', checkout),
      action: 'push',
      hash: '',
    });

    mock.scrollY = 0;
    scroller.apply({
      from: matchedScrollRoute('/checkout', checkout),
      to: matchedScrollRoute('/feed', feed),
      action: 'pop',
      hash: '',
    });

    expect(mock.scrollTo).toHaveBeenLastCalledWith({ top: 480, left: 0, behavior: 'auto' });
  });

  it('does nothing when policy is none', () => {
    scroller.apply({
      from: null,
      to: matchedScrollRoute('/quiet', createScrollRoute('/quiet', 'none')),
      action: 'push',
      hash: '',
    });

    expect(mock.scrollTo).not.toHaveBeenCalled();
  });

  it('scrolls to hash with scroll-behavior and skips scroll / scroll-target', () => {
    const section = document.createElement('div');
    section.id = 'section';
    section.scrollIntoView = jest.fn();
    document.body.append(section);

    scroller.apply({
      from: null,
      to: matchedScrollRoute(
        '/docs',
        createScrollRoute('/docs', 'top', '#main', 'smooth'),
      ),
      action: 'push',
      hash: '#section',
    });

    expect(section.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
    expect(mock.scrollTo).not.toHaveBeenCalled();
  });

  it('forces instant on hash scroll when prefers-reduced-motion', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: jest.fn().mockReturnValue({ matches: true }),
    });

    const section = document.createElement('div');
    section.id = 'section';
    section.scrollIntoView = jest.fn();
    document.body.append(section);

    scroller.apply({
      from: null,
      to: matchedScrollRoute(
        '/docs',
        createScrollRoute('/docs', 'top', undefined, 'smooth'),
      ),
      action: 'push',
      hash: '#section',
    });

    expect(section.scrollIntoView).toHaveBeenCalledWith({ behavior: 'instant' });
  });

  it('scrolls into view when scroll-target matches', () => {
    const target = document.createElement('div');
    target.id = 'main';
    target.scrollIntoView = jest.fn();
    document.body.append(target);

    scroller.apply({
      from: null,
      to: matchedScrollRoute('/docs', createScrollRoute('/docs', 'top', '#main')),
      action: 'push',
      hash: '',
    });

    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto' });
    expect(mock.scrollTo).not.toHaveBeenCalled();
  });

  it('falls back to top when scroll-target misses or is invalid', () => {
    scroller.apply({
      from: null,
      to: matchedScrollRoute('/docs', createScrollRoute('/docs', 'top', '#missing')),
      action: 'push',
      hash: '',
    });
    expect(mock.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });

    mock.scrollTo.mockClear();
    scroller.apply({
      from: null,
      to: matchedScrollRoute('/docs', createScrollRoute('/docs', 'top', '##')),
      action: 'push',
      hash: '',
    });
    expect(mock.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
  });

  it('passes scroll-behavior to scrollTo and scrollIntoView', () => {
    scroller.apply({
      from: null,
      to: matchedScrollRoute(
        '/about',
        createScrollRoute('/about', 'top', undefined, 'smooth'),
      ),
      action: 'push',
      hash: '',
    });
    expect(mock.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'smooth' });

    const target = document.createElement('div');
    target.id = 'main';
    target.scrollIntoView = jest.fn();
    document.body.append(target);
    mock.scrollTo.mockClear();

    scroller.apply({
      from: null,
      to: matchedScrollRoute(
        '/docs',
        createScrollRoute('/docs', 'top', '#main', 'smooth'),
      ),
      action: 'push',
      hash: '',
    });
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
    expect(mock.scrollTo).not.toHaveBeenCalled();
  });

  it('forces instant when prefers-reduced-motion and scroll-behavior is smooth', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: jest.fn().mockReturnValue({ matches: true }),
    });

    scroller.apply({
      from: null,
      to: matchedScrollRoute(
        '/about',
        createScrollRoute('/about', 'top', undefined, 'smooth'),
      ),
      action: 'push',
      hash: '',
    });

    expect(mock.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' });
  });

  it('ignores scroll-target on pop restore', () => {
    const feed = createScrollRoute('/feed', 'auto', '#main');
    const checkout = createScrollRoute('/checkout', 'top');

    const target = document.createElement('div');
    target.id = 'main';
    target.scrollIntoView = jest.fn();
    document.body.append(target);

    mock.scrollY = 320;
    scroller.apply({
      from: matchedScrollRoute('/feed', feed),
      to: matchedScrollRoute('/checkout', checkout),
      action: 'push',
      hash: '',
    });

    mock.scrollY = 0;
    scroller.apply({
      from: matchedScrollRoute('/checkout', checkout),
      to: matchedScrollRoute('/feed', feed),
      action: 'pop',
      hash: '',
    });

    expect(mock.scrollTo).toHaveBeenLastCalledWith({ top: 320, left: 0, behavior: 'auto' });
    expect(target.scrollIntoView).not.toHaveBeenCalled();
  });

  it('cancels pending scroll when a newer apply runs', () => {
    jest.restoreAllMocks();
    let nextId = 1;
    const byId = new Map<number, FrameRequestCallback>();
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      const id = nextId++;
      byId.set(id, cb);
      return id;
    });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      byId.delete(id);
    });
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: jest.fn().mockReturnValue({ matches: false }),
    });

    scroller.apply({
      from: null,
      to: matchedScrollRoute('/a', createScrollRoute('/a', 'top')),
      action: 'push',
      hash: '',
    });
    scroller.apply({
      from: null,
      to: matchedScrollRoute('/b', createScrollRoute('/b', 'none')),
      action: 'push',
      hash: '',
    });

    for (const cb of byId.values()) cb(0);
    expect(mock.scrollTo).not.toHaveBeenCalled();
  });
});

