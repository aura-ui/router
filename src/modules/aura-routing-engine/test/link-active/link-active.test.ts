/** @jest-environment jsdom */

import {
  syncRouterActiveLinks,
  syncRouterHostActiveLinks,
} from '../../core/link-active';

describe('link-active', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/app/settings/');
  });

  describe('syncRouterActiveLinks', () => {
    it('adds active class and aria-current to matching links', () => {
      document.body.innerHTML = `
        <div id="root">
          <a href="/app/settings/" aura-router-link class="nav">Overview</a>
          <a href="profile" aura-router-link class="nav">Profile</a>
        </div>
      `;

      syncRouterActiveLinks({
        root: document.getElementById('root')!,
        linksSelector: '[aura-router-link]',
        linkActiveClass: 'is-active',
        currentHref: '/app/settings/',
      });

      const [overview, profile] = document.querySelectorAll<HTMLAnchorElement>('a');
      expect(overview.classList.contains('is-active')).toBe(true);
      expect(overview.getAttribute('aria-current')).toBe('page');
      expect(profile.classList.contains('is-active')).toBe(false);
      expect(profile.hasAttribute('aria-current')).toBe(false);
    });

    it('resolves path-relative href against current location', () => {
      document.body.innerHTML = `
        <div id="root">
          <a href="profile" aura-router-link>Profile</a>
        </div>
      `;

      syncRouterActiveLinks({
        root: document.getElementById('root')!,
        linksSelector: '[aura-router-link]',
        linkActiveClass: 'is-active',
        currentHref: '/app/settings/profile',
      });

      const link = document.querySelector('a')!;
      expect(link.classList.contains('is-active')).toBe(true);
    });

    it('resolves path-relative href against currentHref instead of window location', () => {
      window.history.replaceState({}, '', '/stale/path');
      document.body.innerHTML = `
        <div id="root">
          <a href="profile" aura-router-link>Profile</a>
        </div>
      `;

      syncRouterActiveLinks({
        root: document.getElementById('root')!,
        linksSelector: '[aura-router-link]',
        linkActiveClass: 'is-active',
        currentHref: '/app/settings/profile',
      });

      expect(document.querySelector('a')!.classList.contains('is-active')).toBe(true);
    });

    it('clears stale active state from previously active links', () => {
      document.body.innerHTML = `
        <div id="root">
          <a href="/one" aura-router-link class="is-active" aria-current="page">One</a>
          <a href="/two" aura-router-link>Two</a>
        </div>
      `;

      syncRouterActiveLinks({
        root: document.getElementById('root')!,
        linksSelector: '[aura-router-link]',
        linkActiveClass: 'is-active',
        currentHref: '/two',
      });

      const [one, two] = document.querySelectorAll<HTMLAnchorElement>('a');
      expect(one.classList.contains('is-active')).toBe(false);
      expect(one.hasAttribute('aria-current')).toBe(false);
      expect(two.classList.contains('is-active')).toBe(true);
    });

    it('ignores external and hash-only links', () => {
      document.body.innerHTML = `
        <div id="root">
          <a href="https://example.com" aura-router-link class="is-active">External</a>
          <a href="#section" aura-router-link class="is-active" aria-current="page">Section</a>
        </div>
      `;

      syncRouterActiveLinks({
        root: document.getElementById('root')!,
        linksSelector: '[aura-router-link]',
        linkActiveClass: 'is-active',
        currentHref: '/app/settings/',
      });

      document.querySelectorAll('a').forEach((anchor) => {
        expect(anchor.classList.contains('is-active')).toBe(false);
        expect(anchor.hasAttribute('aria-current')).toBe(false);
      });
    });

    it('supports multiple space-separated active classes', () => {
      document.body.innerHTML = `
        <div id="root">
          <a href="/about" aura-router-link>About</a>
        </div>
      `;

      syncRouterActiveLinks({
        root: document.getElementById('root')!,
        linksSelector: '[aura-router-link]',
        linkActiveClass: 'is-active nav__link--current',
        currentHref: '/about',
      });

      const link = document.querySelector('a')!;
      expect(link.classList.contains('is-active')).toBe(true);
      expect(link.classList.contains('nav__link--current')).toBe(true);
    });

    it('does not mark path link active when current URL has a hash', () => {
      document.body.innerHTML = `
        <div id="root">
          <a href="/app/settings/profile" aura-router-link>Profile</a>
        </div>
      `;

      syncRouterActiveLinks({
        root: document.getElementById('root')!,
        linksSelector: '[aura-router-link]',
        linkActiveClass: 'is-active',
        currentHref: '/app/settings/profile#panel',
      });

      expect(document.querySelector('a')!.classList.contains('is-active')).toBe(false);
    });

    it('ignores non-anchor elements matched by linksSelector', () => {
      document.body.innerHTML = `
        <div id="root">
          <button type="button" aura-router-link>Button</button>
        </div>
      `;

      expect(() =>
        syncRouterActiveLinks({
          root: document.getElementById('root')!,
          linksSelector: '[aura-router-link]',
          linkActiveClass: 'is-active',
          currentHref: '/',
        }),
      ).not.toThrow();
    });

    it('applies branch-active class for prefix matches', () => {
      document.body.innerHTML = `
        <div id="root">
          <a href="/app/settings" aura-router-link>Settings</a>
          <a href="/app/settings/profile" aura-router-link>Profile</a>
        </div>
      `;

      syncRouterActiveLinks({
        root: document.getElementById('root')!,
        linksSelector: '[aura-router-link]',
        linkActiveClass: 'is-active',
        linkActiveBranchClass: 'is-branch-active',
        currentHref: '/app/settings/profile',
      });

      const [settings, profile] = document.querySelectorAll<HTMLAnchorElement>('a');
      expect(settings.classList.contains('is-active')).toBe(false);
      expect(settings.classList.contains('is-branch-active')).toBe(true);
      expect(profile.classList.contains('is-active')).toBe(true);
      expect(profile.classList.contains('is-branch-active')).toBe(true);
    });
  });

  describe('syncRouterHostActiveLinks', () => {
    it('scans the whole document when links-container-selector is absent', () => {
      document.body.innerHTML = `
        <nav>
          <a href="/about" aura-router-link>About outside</a>
        </nav>
        <aura-router link-active-class="is-active">
          <a href="/about" aura-router-link>About inside</a>
        </aura-router>
      `;

      const host = document.querySelector('aura-router') as HTMLElement;
      syncRouterHostActiveLinks(host, '/about', {
        linksSelector: '[aura-router-link]',
        linkActiveClass: 'is-active',
        linkActiveBranchClass: null,
        linksContainerSelector: null,
      });

      const [outside, inside] = document.querySelectorAll<HTMLAnchorElement>('a');
      expect(outside.classList.contains('is-active')).toBe(true);
      expect(inside.classList.contains('is-active')).toBe(true);
    });

    it('scopes link scan to router-link-root ancestor', () => {
      document.body.innerHTML = `
        <div class="demo-site">
          <nav>
            <a href="/about" aura-router-link>About</a>
          </nav>
          <aura-router links-container-selector=".demo-site" link-active-class="is-active">
            <a href="/about" aura-router-link>About inside</a>
          </aura-router>
        </div>
        <a href="/about" aura-router-link>Outside scope</a>
      `;

      const host = document.querySelector('aura-router') as HTMLElement;
      syncRouterHostActiveLinks(host, '/about', {
        linksSelector: '[aura-router-link]',
        linkActiveClass: 'is-active',
        linkActiveBranchClass: null,
        linksContainerSelector: '.demo-site',
      });

      const [outside, inside, outOfScope] = document.querySelectorAll<HTMLAnchorElement>('a');
      expect(outside.classList.contains('is-active')).toBe(true);
      expect(inside.classList.contains('is-active')).toBe(true);
      expect(outOfScope.classList.contains('is-active')).toBe(false);
    });
  });
});
