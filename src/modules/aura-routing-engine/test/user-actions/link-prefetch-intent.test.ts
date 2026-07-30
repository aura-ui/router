import { resolvePrefetchMode } from '../../core/prefetch/prefetch-policy';
import { LinkPrefetchIntentTracker } from '../../core/user-actions/link-prefetch-intent';

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

    document.body.innerHTML = '<a href="/about" aura-router-link>About</a>';
    document.querySelector('a')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    expect(scheduleIntent).toHaveBeenCalledWith('/about', 'intent');
  });

  it('respects data-prefetch="false"', () => {
    const scheduleIntent = jest.fn();
    const tracker = createTracker({ scheduleIntent, cancelIntent: jest.fn() });

    tracker.start();

    document.body.innerHTML = '<a href="/about" aura-router-link data-prefetch="false">About</a>';
    document.querySelector('a')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    expect(scheduleIntent).not.toHaveBeenCalled();
  });

  it('cancels intent on mouseout', () => {
    const cancelIntent = jest.fn();
    const tracker = createTracker({ scheduleIntent: jest.fn(), cancelIntent });

    tracker.start();

    document.body.innerHTML = '<a href="/about" aura-router-link>About</a>';
    const link = document.querySelector('a')!;
    link.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));

    expect(cancelIntent).toHaveBeenCalledWith('/about');
  });
});
