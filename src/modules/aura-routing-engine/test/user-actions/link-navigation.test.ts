import { LinkNavigationTracker } from '../../core/user-actions/link-navigation';
import { BUBBLING_MOUSE, clickAnchor } from '../_helpers/anchor-events';
import { DEFAULT_PUSH_NAV_OPTIONS } from '../_helpers/jest/constants';

describe('LinkNavigationTracker', () => {
  let tracker: LinkNavigationTracker;
  let onNavigation: jest.Mock;

  beforeEach(() => {
    document.body.innerHTML = '';
    tracker = new LinkNavigationTracker();
    onNavigation = jest.fn();
    tracker.onNavigation(onNavigation);
  });

  afterEach(() => {
    tracker.destroy();
  });

  function expectNavigation(href: string): void {
    expect(onNavigation).toHaveBeenCalledWith({
      href,
      action: 'push',
      ...DEFAULT_PUSH_NAV_OPTIONS,
    });
  }

  it('emits navigation on click', () => {
    tracker.start();
    const event = clickAnchor('<a href="/about" aura-router-link>About</a>');

    expect(event.defaultPrevented).toBe(true);
    expectNavigation('/about');
  });

  it('ignores external links', () => {
    tracker.start();
    clickAnchor('<a href="https://example.com" aura-router-link>External</a>');
    expect(onNavigation).not.toHaveBeenCalled();
  });

  it('navigates same-origin absolute href as in-app path', () => {
    window.history.replaceState({}, '', '/app/settings/');
    tracker.start();
    clickAnchor(`<a href="${window.location.origin}/главная.html" aura-router-link>Home</a>`);
    expectNavigation('/главная.html');
  });

  it('navigates same-origin origin root as /', () => {
    tracker.start();
    clickAnchor(`<a href="${window.location.origin}" aura-router-link>Root</a>`);
    expectNavigation('/');
  });

  it('resolves path-relative href against current location', () => {
    window.history.replaceState({}, '', '/app/settings/');
    tracker.start();
    clickAnchor('<a href="profile" aura-router-link>Profile</a>');
    expectNavigation('/app/settings/profile');
  });

  it('stop pauses clicks; start resumes with the same handler', () => {
    tracker.start();
    document.body.innerHTML = '<a href="/about" aura-router-link>About</a>';
    const link = document.querySelector('a')!;

    tracker.stop();
    link.dispatchEvent(new MouseEvent('click', BUBBLING_MOUSE));
    expect(onNavigation).not.toHaveBeenCalled();

    tracker.start();
    link.dispatchEvent(new MouseEvent('click', BUBBLING_MOUSE));
    expect(onNavigation).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['ctrlKey', { ctrlKey: true }, '<a href="/about" aura-router-link>About</a>'],
    ['metaKey', { metaKey: true }, '<a href="/about" aura-router-link>About</a>'],
    ['shiftKey', { shiftKey: true }, '<a href="/about" aura-router-link>About</a>'],
    ['altKey', { altKey: true }, '<a href="/about" aura-router-link>About</a>'],
    ['middle button', { button: 1 }, '<a href="/about" aura-router-link>About</a>'],
    ['target=_blank', {}, '<a href="/about" target="_blank" aura-router-link>About</a>'],
    ['download', {}, '<a href="/file.pdf" download aura-router-link>File</a>'],
  ] as const)('lets the browser handle %s', (_label, init, html) => {
    tracker.start();
    const event = clickAnchor(html, init);

    expect(event.defaultPrevented).toBe(false);
    expect(onNavigation).not.toHaveBeenCalled();
  });

  it('skips when defaultPrevented is already set', () => {
    const prevent = (e: Event) => e.preventDefault();
    document.addEventListener('click', prevent, true);
    try {
      tracker.start();
      clickAnchor('<a href="/about" aura-router-link>About</a>');
      expect(onNavigation).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('click', prevent, true);
    }
  });
});
