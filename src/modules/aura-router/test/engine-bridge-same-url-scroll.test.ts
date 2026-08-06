/** @jest-environment jsdom */

import { connectRouterEngine } from '../core/engine-bridge';
import { Scroller } from '../core/scroller';
import {
  asScrollContainer,
  createScrollRoute,
  installScrollTestDom,
  matchedScrollRoute,
  mockScrollRaf,
  ScrollContainerMock,
} from './_helpers/scroll-fixtures';

describe('connectRouterEngine onScroll', () => {
  let mock: ScrollContainerMock;

  beforeAll(() => {
    installScrollTestDom();
  });

  beforeEach(() => {
    mock = new ScrollContainerMock();
    document.body.replaceChildren();
    mockScrollRaf();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('wires onScroll to apply as a fresh push (no save)', () => {
    const apply = jest.fn();
    const { config } = connectRouterEngine(document.createElement('div'), {
      syncBranchAndActiveLinks: jest.fn(),
      scroller: { apply },
      notFound: { recover: jest.fn(), clear: jest.fn() },
      onHashOnlyNavigation: jest.fn(),
    });
    const to = matchedScrollRoute('/about', createScrollRoute('/about', 'top'));

    config.onScroll?.({ to, hash: '' });

    expect(apply).toHaveBeenCalledWith({
      from: null,
      to,
      action: 'push',
      hash: '',
    });
  });

  it('passes hash through to Scroller', () => {
    const apply = jest.fn();
    const { config } = connectRouterEngine(document.createElement('div'), {
      syncBranchAndActiveLinks: jest.fn(),
      scroller: { apply },
      notFound: { recover: jest.fn(), clear: jest.fn() },
      onHashOnlyNavigation: jest.fn(),
    });
    const to = matchedScrollRoute('/docs', createScrollRoute('/docs', 'top', undefined, 'smooth'));

    config.onScroll?.({ to, hash: '#intro' });

    expect(apply).toHaveBeenCalledWith({
      from: null,
      to,
      action: 'push',
      hash: '#intro',
    });
  });

  it('scrolls to top through Scroller when policy is top', () => {
    const scroller = new Scroller(asScrollContainer(mock));
    const { config } = connectRouterEngine(document.createElement('div'), {
      syncBranchAndActiveLinks: jest.fn(),
      scroller,
      notFound: { recover: jest.fn(), clear: jest.fn() },
      onHashOnlyNavigation: jest.fn(),
    });

    config.onScroll?.({
      to: matchedScrollRoute('/about', createScrollRoute('/about', 'top')),
      hash: '',
    });

    expect(mock.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
  });
});
