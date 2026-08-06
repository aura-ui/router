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

describe('connectRouterEngine same-URL scroll', () => {
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

  it('wires onSameUrlNavigation to apply as a fresh push (no save)', () => {
    const apply = jest.fn();
    const { config } = connectRouterEngine(document.createElement('div'), {
      syncBranchAndActiveLinks: jest.fn(),
      scroller: { apply },
      notFound: { recover: jest.fn(), clear: jest.fn() },
      onHashOnlyNavigation: jest.fn(),
    });
    const to = matchedScrollRoute('/about', createScrollRoute('/about', 'top'));

    config.onSameUrlNavigation?.(to);

    expect(apply).toHaveBeenCalledWith({
      from: null,
      to,
      action: 'push',
      hash: '',
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

    config.onSameUrlNavigation?.(
      matchedScrollRoute('/about', createScrollRoute('/about', 'top')),
    );

    expect(mock.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
  });
});
