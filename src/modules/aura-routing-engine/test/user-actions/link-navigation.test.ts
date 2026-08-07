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

    document.body.innerHTML = '<a href="/about" aura-router-link>About</a>';
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

    document.body.innerHTML = '<a href="https://example.com" aura-router-link>External</a>';
    document.querySelector('a')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onNavigation).not.toHaveBeenCalled();
  });

  it('navigates same-origin absolute href as in-app path', () => {
    window.history.replaceState({}, '', '/app/settings/');
    const onNavigation = jest.fn();
    const tracker = new LinkNavigationTracker();

    tracker.onNavigation(onNavigation);
    tracker.start();

    document.body.innerHTML =
      `<a href="${window.location.origin}/главная.html" aura-router-link>Home</a>`;
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.querySelector('a')!.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onNavigation).toHaveBeenCalledWith({
      href: '/главная.html',
      action: 'push',
      replace: false,
      syncHistory: true,
    });
  });

  it('navigates same-origin origin root as /', () => {
    const onNavigation = jest.fn();
    const tracker = new LinkNavigationTracker();

    tracker.onNavigation(onNavigation);
    tracker.start();

    document.body.innerHTML =
      `<a href="${window.location.origin}" aura-router-link>Root</a>`;
    document.querySelector('a')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(onNavigation).toHaveBeenCalledWith({
      href: '/',
      action: 'push',
      replace: false,
      syncHistory: true,
    });
  });

  it('resolves path-relative href against current location', () => {
    window.history.replaceState({}, '', '/app/settings/');
    const onNavigation = jest.fn();
    const tracker = new LinkNavigationTracker();

    tracker.onNavigation(onNavigation);
    tracker.start();

    document.body.innerHTML = '<a href="profile" aura-router-link>Profile</a>';
    document.querySelector('a')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(onNavigation).toHaveBeenCalledWith({
      href: '/app/settings/profile',
      action: 'push',
      replace: false,
      syncHistory: true,
    });
  });

  it('stop pauses clicks; start resumes with the same handler', () => {
    const onNavigation = jest.fn();
    const tracker = new LinkNavigationTracker();

    tracker.onNavigation(onNavigation);
    tracker.start();
    document.body.innerHTML = '<a href="/about" aura-router-link>About</a>';
    const link = document.querySelector('a')!;

    tracker.stop();
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onNavigation).not.toHaveBeenCalled();

    tracker.start();
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onNavigation).toHaveBeenCalledTimes(1);
  });
});
