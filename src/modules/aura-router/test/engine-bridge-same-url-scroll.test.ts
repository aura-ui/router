/** @jest-environment jsdom */

import { connectRouterEngine } from '../core/engine-bridge';
import { ScrollBehavior } from '../core/scroll-behavior';
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
      scrollBehavior: { apply },
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

  it('scrolls to top through ScrollBehavior when policy is top', () => {
    const scrollBehavior = new ScrollBehavior(asScrollContainer(mock));
    const { config } = connectRouterEngine(document.createElement('div'), {
      syncBranchAndActiveLinks: jest.fn(),
      scrollBehavior,
      notFound: { recover: jest.fn(), clear: jest.fn() },
      onHashOnlyNavigation: jest.fn(),
    });

    config.onSameUrlNavigation?.(
      matchedScrollRoute('/about', createScrollRoute('/about', 'top')),
    );

    expect(mock.scrollTo).toHaveBeenCalledWith(0, 0);
  });
});
