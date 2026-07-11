/** @jest-environment jsdom */

import {
  isRouterLinkActive,
  isRouterLinkBranchActive,
  syncRouterActiveLinks,
  toRouteTrail,
} from '../../core/user-actions/router-link';
import { createMatchedRoute } from '../helpers/create-mock-transaction';

describe('router-link active state', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/app/settings/');
  });

  describe('isRouterLinkActive', () => {
    it('returns true for matching pathname and search', () => {
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

    it('returns false for prefix-only matches', () => {
      expect(isRouterLinkActive('/app/settings', '/app/settings/profile')).toBe(false);
      expect(isRouterLinkActive('/app/settings/', '/app/settings/profile')).toBe(false);
    });

    it('returns true for the leaf path', () => {
      expect(isRouterLinkActive('/app/settings/profile', '/app/settings/profile')).toBe(true);
    });

    it('returns false for sibling paths under the same parent', () => {
      expect(isRouterLinkActive('/app/settings/users', '/app/settings/profile')).toBe(false);
    });

    it('does not treat root as active for every URL', () => {
      expect(isRouterLinkActive('/', '/app/settings/profile')).toBe(false);
      expect(isRouterLinkActive('/', '/')).toBe(true);
    });
  });

  describe('isRouterLinkBranchActive', () => {
    it('returns true when current URL is under the link path', () => {
      expect(isRouterLinkBranchActive('/app/settings', '/app/settings/profile')).toBe(true);
      expect(isRouterLinkBranchActive('/app/settings/', '/app/settings/profile')).toBe(true);
    });

    it('returns true for the leaf path', () => {
      expect(isRouterLinkBranchActive('/app/settings/profile', '/app/settings/profile')).toBe(true);
    });

    it('returns false for sibling paths under the same parent', () => {
      expect(isRouterLinkBranchActive('/app/settings/users', '/app/settings/profile')).toBe(false);
    });

    it('does not treat root as a prefix of every URL', () => {
      expect(isRouterLinkBranchActive('/', '/app/settings/profile')).toBe(false);
      expect(isRouterLinkBranchActive('/', '/')).toBe(true);
    });

    it('ignores hash URLs for branch matching', () => {
      expect(isRouterLinkBranchActive('/docs#intro', '/docs/profile')).toBe(false);
      expect(isRouterLinkBranchActive('/docs', '/docs#intro')).toBe(false);
    });
  });

  describe('toRouteTrail', () => {
    it('maps active chain from a leaf match', () => {
      const parent = createMatchedRoute('/app/settings');
      const leaf = createMatchedRoute('/app/settings/profile');
      leaf.chain = [parent, leaf];
      parent.chain = leaf.chain;

      expect(toRouteTrail(leaf.chain)).toEqual([
        { pattern: '/app/settings', href: '/app/settings' },
        { pattern: '/app/settings/profile', href: '/app/settings/profile' },
      ]);
    });

    it('maps an explicit chain array', () => {
      const parent = createMatchedRoute('/app/settings');
      const leaf = createMatchedRoute('/app/settings/profile');
      leaf.chain = [parent, leaf];
      parent.chain = leaf.chain;

      expect(toRouteTrail([parent, leaf])).toEqual([
        { pattern: '/app/settings', href: '/app/settings' },
        { pattern: '/app/settings/profile', href: '/app/settings/profile' },
      ]);
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

    it('resolves path-relative href against currentHref instead of window location', () => {
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
          <a href="https://example.com" data-router-link class="is-active">External</a>
          <a href="#section" data-router-link class="is-active" aria-current="page">Section</a>
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
        expect(anchor.hasAttribute('aria-current')).toBe(false);
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

    it('applies branch-active class for prefix matches', () => {
      document.body.innerHTML = `
        <div id="root">
          <a href="/app/settings" data-router-link>Settings</a>
          <a href="/app/settings/profile" data-router-link>Profile</a>
        </div>
      `;

      syncRouterActiveLinks({
        root: document.getElementById('root')!,
        linksSelector: '[data-router-link]',
        activeClass: 'is-active',
        branchActiveClass: 'is-branch-active',
        currentHref: '/app/settings/profile',
      });

      const [settings, profile] = document.querySelectorAll<HTMLAnchorElement>('a');
      expect(settings.classList.contains('is-active')).toBe(false);
      expect(settings.classList.contains('is-branch-active')).toBe(true);
      expect(profile.classList.contains('is-active')).toBe(true);
      expect(profile.classList.contains('is-branch-active')).toBe(true);
    });
  });
});
