import { LinkNavigationTracker } from '../../core/user-actions/link-navigation';

describe('LinkNavigationTracker', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('emits navigation on click', () => {
    const onNavigation = jest.fn();
    const tracker = new LinkNavigationTracker();

    tracker.onNavigation(onNavigation);
    tracker.start();

    document.body.innerHTML = '<a href="/about" data-router-link>About</a>';
    const link = document.querySelector('a')!;
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onNavigation).toHaveBeenCalledWith({
      href: '/about',
      action: 'push',
      replace: false,
      syncHistory: true,
    });
  });

  it('ignores external links', () => {
    const onNavigation = jest.fn();
    const tracker = new LinkNavigationTracker();

    tracker.onNavigation(onNavigation);
    tracker.start();

    document.body.innerHTML = '<a href="https://example.com" data-router-link>External</a>';
    document.querySelector('a')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onNavigation).not.toHaveBeenCalled();
  });
});
