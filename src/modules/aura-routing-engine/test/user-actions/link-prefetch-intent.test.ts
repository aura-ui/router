import { resolvePrefetchMode } from '../../core/prefetch/prefetch-policy';
import { LinkPrefetchIntentTracker } from '../../core/user-actions/link-prefetch-intent';
import { dispatchAnchorMouseEvent } from '../_helpers/anchor-events';

function createTracker(handlers: {
  scheduleIntent: jest.Mock;
  cancelIntent: jest.Mock;
}) {
  return new LinkPrefetchIntentTracker({
    handlers,
    resolveMode: (anchor, _href, touch) =>
      resolvePrefetchMode({ anchor, routerDefault: 'intent', touch }),
  });
}

describe('LinkPrefetchIntentTracker', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('schedules intent on mouseover', () => {
    const scheduleIntent = jest.fn();
    const cancelIntent = jest.fn();
    const tracker = createTracker({ scheduleIntent, cancelIntent });

    tracker.start();
    dispatchAnchorMouseEvent('mouseover', '<a href="/about" aura-router-link>About</a>');

    expect(scheduleIntent).toHaveBeenCalledWith('/about', 'intent');
  });

  it('respects data-prefetch="false"', () => {
    const scheduleIntent = jest.fn();
    const tracker = createTracker({ scheduleIntent, cancelIntent: jest.fn() });

    tracker.start();
    dispatchAnchorMouseEvent(
      'mouseover',
      '<a href="/about" aura-router-link data-prefetch="false">About</a>',
    );

    expect(scheduleIntent).not.toHaveBeenCalled();
  });

  it('cancels intent on mouseout', () => {
    const cancelIntent = jest.fn();
    const tracker = createTracker({ scheduleIntent: jest.fn(), cancelIntent });

    tracker.start();
    dispatchAnchorMouseEvent('mouseout', '<a href="/about" aura-router-link>About</a>', {
      relatedTarget: document.body,
    });

    expect(cancelIntent).toHaveBeenCalledWith('/about');
  });
});
