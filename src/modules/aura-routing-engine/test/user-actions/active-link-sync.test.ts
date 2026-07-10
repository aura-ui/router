/** @jest-environment jsdom */

import {
  isRouterLinkActive,
  syncRouterActiveLinks,
} from '../../core/user-actions/active-link-sync';

describe('active-link-sync', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/app/settings/');
  });

  describe('isRouterLinkActive', () => {
    it('matches exact pathname and search', () => {
      expect(isRouterLinkActive('/about', '/about')).toBe(true);
      expect(isRouterLinkActive('/about?q=1', '/about?q=1')).toBe(true);
    });

    it('ignores trailing slash differences', () => {
      expect(isRouterLinkActive('/app/settings/', '/app/settings')).toBe(true);
    });

    it('requires hash when link declares hash', () => {
      expect(isRouterLinkActive('/docs#intro', '/docs')).toBe(false);
      expect(isRouterLinkActive('/docs#intro', '/docs#intro')).toBe(true);
    });

    it('treats links without hash as inactive when current URL has hash', () => {
      expect(isRouterLinkActive('/docs', '/docs#intro')).toBe(false);
    });
  });

  describe('syncRouterActiveLinks', () => {
    it('adds active class and aria-current to matching links', () => {
      document.body.innerHTML = `
        <div id="root">
          <a href="/app/settings/" data-router-link class="nav">Overview</a>
          <a href="profile" data-router-link class="nav">Profile</a>
        </div>
      `;

      syncRouterActiveLinks({
        root: document.getElementById('root')!,
        linksSelector: '[data-router-link]',
        activeClass: 'is-active',
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
          <a href="profile" data-router-link>Profile</a>
        </div>
      `;

      syncRouterActiveLinks({
        root: document.getElementById('root')!,
        linksSelector: '[data-router-link]',
        activeClass: 'is-active',
        currentHref: '/app/settings/profile',
      });

      const link = document.querySelector('a')!;
      expect(link.classList.contains('is-active')).toBe(true);
    });

    it('resolves path-relative href against currentHref base', () => {
      window.history.replaceState({}, '', '/stale/path');
      document.body.innerHTML = `
        <div id="root">
          <a href="profile" data-router-link>Profile</a>
        </div>
      `;

      syncRouterActiveLinks({
        root: document.getElementById('root')!,
        linksSelector: '[data-router-link]',
        activeClass: 'is-active',
        currentHref: '/app/settings/profile',
      });

      expect(document.querySelector('a')!.classList.contains('is-active')).toBe(true);
    });

    it('clears stale active state from previously active links', () => {
      document.body.innerHTML = `
        <div id="root">
          <a href="/one" data-router-link class="is-active" aria-current="page">One</a>
          <a href="/two" data-router-link>Two</a>
        </div>
      `;

      syncRouterActiveLinks({
        root: document.getElementById('root')!,
        linksSelector: '[data-router-link]',
        activeClass: 'is-active',
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
          <a href="https://example.com" data-router-link>External</a>
          <a href="#section" data-router-link>Section</a>
        </div>
      `;

      syncRouterActiveLinks({
        root: document.getElementById('root')!,
        linksSelector: '[data-router-link]',
        activeClass: 'is-active',
        currentHref: '/app/settings/',
      });

      document.querySelectorAll('a').forEach((anchor) => {
        expect(anchor.classList.contains('is-active')).toBe(false);
      });
    });

    it('supports multiple space-separated active classes', () => {
      document.body.innerHTML = `
        <div id="root">
          <a href="/about" data-router-link>About</a>
        </div>
      `;

      syncRouterActiveLinks({
        root: document.getElementById('root')!,
        linksSelector: '[data-router-link]',
        activeClass: 'is-active nav__link--current',
        currentHref: '/about',
      });

      const link = document.querySelector('a')!;
      expect(link.classList.contains('is-active')).toBe(true);
      expect(link.classList.contains('nav__link--current')).toBe(true);
    });

    it('does not mark path link active when current URL has a hash', () => {
      document.body.innerHTML = `
        <div id="root">
          <a href="/app/settings/profile" data-router-link>Profile</a>
        </div>
      `;

      syncRouterActiveLinks({
        root: document.getElementById('root')!,
        linksSelector: '[data-router-link]',
        activeClass: 'is-active',
        currentHref: '/app/settings/profile#panel',
      });

      expect(document.querySelector('a')!.classList.contains('is-active')).toBe(false);
    });

    it('ignores non-anchor elements matched by linksSelector', () => {
      document.body.innerHTML = `
        <div id="root">
          <button type="button" data-router-link>Button</button>
        </div>
      `;

      expect(() =>
        syncRouterActiveLinks({
          root: document.getElementById('root')!,
          linksSelector: '[data-router-link]',
          activeClass: 'is-active',
          currentHref: '/',
        }),
      ).not.toThrow();
    });
  });
});
