/** @jest-environment jsdom */

import { Scroller } from '../core/scroller';
import {
  asScrollContainer,
  createScrollRoute,
  installScrollTestDom,
  matchedScrollRoute,
  mockScrollRaf,
  ScrollContainerMock,
} from './_helpers/scroll-fixtures';

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

  it('skips auto scroll when hash is present', () => {
    scroller.apply({
      from: null,
      to: matchedScrollRoute('/docs', createScrollRoute('/docs', 'top')),
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
});
