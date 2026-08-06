/** @jest-environment jsdom */

import { ScrollBehavior } from '../core/scroll-behavior';
import {
  asScrollContainer,
  createScrollRoute,
  installScrollTestDom,
  matchedScrollRoute,
  mockScrollRaf,
  ScrollContainerMock,
} from './_helpers/scroll-fixtures';

describe('ScrollBehavior', () => {
  let mock: ScrollContainerMock;
  let scroll: ScrollBehavior;

  beforeAll(() => {
    installScrollTestDom();
  });

  beforeEach(() => {
    mock = new ScrollContainerMock();
    scroll = new ScrollBehavior(asScrollContainer(mock));
    document.body.replaceChildren();
    mockScrollRaf();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('scrolls to top on push when policy is top', () => {
    scroll.apply({
      from: null,
      to: matchedScrollRoute('/checkout', createScrollRoute('/checkout', 'top')),
      action: 'push',
      hash: '',
    });

    expect(mock.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('restores saved scroll on pop when policy is auto', () => {
    const feed = createScrollRoute('/feed', 'auto');
    const checkout = createScrollRoute('/checkout', 'top');

    mock.scrollY = 480;
    scroll.apply({
      from: matchedScrollRoute('/feed', feed),
      to: matchedScrollRoute('/checkout', checkout),
      action: 'push',
      hash: '',
    });

    mock.scrollY = 0;
    scroll.apply({
      from: matchedScrollRoute('/checkout', checkout),
      to: matchedScrollRoute('/feed', feed),
      action: 'pop',
      hash: '',
    });

    expect(mock.scrollTo).toHaveBeenLastCalledWith(0, 480);
  });

  it('does nothing when policy is none', () => {
    scroll.apply({
      from: null,
      to: matchedScrollRoute('/quiet', createScrollRoute('/quiet', 'none')),
      action: 'push',
      hash: '',
    });

    expect(mock.scrollTo).not.toHaveBeenCalled();
  });

  it('skips auto scroll when hash is present', () => {
    scroll.apply({
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

    scroll.apply({
      from: null,
      to: matchedScrollRoute('/docs', createScrollRoute('/docs', 'top', '#main')),
      action: 'push',
      hash: '',
    });

    expect(target.scrollIntoView).toHaveBeenCalled();
    expect(mock.scrollTo).not.toHaveBeenCalled();
  });

  it('falls back to top when scroll-target misses or is invalid', () => {
    scroll.apply({
      from: null,
      to: matchedScrollRoute('/docs', createScrollRoute('/docs', 'top', '#missing')),
      action: 'push',
      hash: '',
    });
    expect(mock.scrollTo).toHaveBeenCalledWith(0, 0);

    mock.scrollTo.mockClear();
    scroll.apply({
      from: null,
      to: matchedScrollRoute('/docs', createScrollRoute('/docs', 'top', '##')),
      action: 'push',
      hash: '',
    });
    expect(mock.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('ignores scroll-target on pop restore', () => {
    const feed = createScrollRoute('/feed', 'auto', '#main');
    const checkout = createScrollRoute('/checkout', 'top');

    const target = document.createElement('div');
    target.id = 'main';
    target.scrollIntoView = jest.fn();
    document.body.append(target);

    mock.scrollY = 320;
    scroll.apply({
      from: matchedScrollRoute('/feed', feed),
      to: matchedScrollRoute('/checkout', checkout),
      action: 'push',
      hash: '',
    });

    mock.scrollY = 0;
    scroll.apply({
      from: matchedScrollRoute('/checkout', checkout),
      to: matchedScrollRoute('/feed', feed),
      action: 'pop',
      hash: '',
    });

    expect(mock.scrollTo).toHaveBeenLastCalledWith(0, 320);
    expect(target.scrollIntoView).not.toHaveBeenCalled();
  });
});
