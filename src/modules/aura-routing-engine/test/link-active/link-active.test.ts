/** @jest-environment jsdom */

import { syncRouterActiveLinks } from '../../core/link-active';

describe('link-active', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/app/settings/');
  });

  describe('syncRouterActiveLinks', () => {
    it('adds active class and aria-current to matching links', () => {
      document.body.innerHTML = `
        <div id="container">
          <a href="/app/settings/" data-aura-link class="nav">Overview</a>
          <a href="profile" data-aura-link class="nav">Profile</a>
        </div>
      `;

      syncRouterActiveLinks({
        container: document.getElementById('container')!,
        linksSelector: '[data-aura-link]',
        linkActiveClass: 'is-active',
        currentHref: '/app/settings/',
      });

      const [overview, profile] = document.querySelectorAll<HTMLAnchorElement>('a');
      expect(overview!.classList.contains('is-active')).toBe(true);
      expect(overview!.getAttribute('aria-current')).toBe('page');
      expect(profile!.classList.contains('is-active')).toBe(false);
      expect(profile!.hasAttribute('aria-current')).toBe(false);
    });

    it('resolves path-relative href against current location', () => {
      document.body.innerHTML = `
        <div id="container">
          <a href="profile" data-aura-link>Profile</a>
        </div>
      `;

      syncRouterActiveLinks({
        container: document.getElementById('container')!,
        linksSelector: '[data-aura-link]',
        linkActiveClass: 'is-active',
        currentHref: '/app/settings/profile',
      });

      const link = document.querySelector('a')!;
      expect(link.classList.contains('is-active')).toBe(true);
    });

    it('resolves path-relative href against currentHref instead of window location', () => {
      window.history.replaceState({}, '', '/stale/path');
      document.body.innerHTML = `
        <div id="container">
          <a href="profile" data-aura-link>Profile</a>
        </div>
      `;

      syncRouterActiveLinks({
        container: document.getElementById('container')!,
        linksSelector: '[data-aura-link]',
        linkActiveClass: 'is-active',
        currentHref: '/app/settings/profile',
      });

      expect(document.querySelector('a')!.classList.contains('is-active')).toBe(true);
    });

    it('clears stale active state from previously active links', () => {
      document.body.innerHTML = `
        <div id="container">
          <a href="/one" data-aura-link class="is-active" aria-current="page">One</a>
          <a href="/two" data-aura-link>Two</a>
        </div>
      `;

      syncRouterActiveLinks({
        container: document.getElementById('container')!,
        linksSelector: '[data-aura-link]',
        linkActiveClass: 'is-active',
        currentHref: '/two',
      });

      const [one, two] = document.querySelectorAll<HTMLAnchorElement>('a');
      expect(one!.classList.contains('is-active')).toBe(false);
      expect(one!.hasAttribute('aria-current')).toBe(false);
      expect(two!.classList.contains('is-active')).toBe(true);
    });

    it('ignores external and hash-only links', () => {
      document.body.innerHTML = `
        <div id="container">
          <a href="https://example.com" data-aura-link class="is-active">External</a>
          <a href="#section" data-aura-link class="is-active" aria-current="page">Section</a>
        </div>
      `;

      syncRouterActiveLinks({
        container: document.getElementById('container')!,
        linksSelector: '[data-aura-link]',
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
        <div id="container">
          <a href="/about" data-aura-link>About</a>
        </div>
      `;

      syncRouterActiveLinks({
        container: document.getElementById('container')!,
        linksSelector: '[data-aura-link]',
        linkActiveClass: 'is-active nav__link--current',
        currentHref: '/about',
      });

      const link = document.querySelector('a')!;
      expect(link.classList.contains('is-active')).toBe(true);
      expect(link.classList.contains('nav__link--current')).toBe(true);
    });

    it('does not mark path link active when current URL has a hash', () => {
      document.body.innerHTML = `
        <div id="container">
          <a href="/app/settings/profile" data-aura-link>Profile</a>
        </div>
      `;

      syncRouterActiveLinks({
        container: document.getElementById('container')!,
        linksSelector: '[data-aura-link]',
        linkActiveClass: 'is-active',
        currentHref: '/app/settings/profile#panel',
      });

      expect(document.querySelector('a')!.classList.contains('is-active')).toBe(false);
    });

    it('ignores non-anchor elements matched by linksSelector', () => {
      document.body.innerHTML = `
        <div id="container">
          <button type="button" data-aura-link>Button</button>
        </div>
      `;

      expect(() =>
        syncRouterActiveLinks({
          container: document.getElementById('container')!,
          linksSelector: '[data-aura-link]',
          linkActiveClass: 'is-active',
          currentHref: '/',
        }),
      ).not.toThrow();
    });

    it('applies branch-active class for prefix matches', () => {
      document.body.innerHTML = `
        <div id="container">
          <a href="/app/settings" data-aura-link>Settings</a>
          <a href="/app/settings/profile" data-aura-link>Profile</a>
        </div>
      `;

      syncRouterActiveLinks({
        container: document.getElementById('container')!,
        linksSelector: '[data-aura-link]',
        linkActiveClass: 'is-active',
        linkActiveBranchClass: 'is-branch-active',
        currentHref: '/app/settings/profile',
      });

      const [settings, profile] = document.querySelectorAll<HTMLAnchorElement>('a');
      expect(settings!.classList.contains('is-active')).toBe(false);
      expect(settings!.classList.contains('is-branch-active')).toBe(true);
      expect(profile!.classList.contains('is-active')).toBe(true);
      expect(profile!.classList.contains('is-branch-active')).toBe(true);
    });
  });

});
