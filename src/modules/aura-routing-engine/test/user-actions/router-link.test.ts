/** @jest-environment jsdom */

import { resolveLinkState, syncRouterActiveLinks, toActiveChain } from '../../core/user-actions/router-link';
import { createMatchedRoute } from '../helpers/create-mock-transaction';

function presentation(currentHref: string) {
  return { currentHref };
}

describe('router-link active state', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/app/settings/');
  });

  describe('resolveLinkState', () => {
    it('returns exact for matching pathname and search', () => {
      expect(resolveLinkState('/about', presentation('/about'))).toBe('exact');
      expect(resolveLinkState('/about?q=1', presentation('/about?q=1'))).toBe('exact');
    });

    it('ignores trailing slash differences', () => {
      expect(resolveLinkState('/app/settings/', presentation('/app/settings'))).toBe('exact');
    });

    it('requires hash when link declares hash', () => {
      expect(resolveLinkState('/docs#intro', presentation('/docs'))).toBe('inactive');
      expect(resolveLinkState('/docs#intro', presentation('/docs#intro'))).toBe('exact');
    });

    it('treats links without hash as inactive when current URL has hash', () => {
      expect(resolveLinkState('/docs', presentation('/docs#intro'))).toBe('inactive');
    });

    it('returns ancestor when current URL is under the link path', () => {
      expect(resolveLinkState('/app/settings', presentation('/app/settings/profile'))).toBe('ancestor');
      expect(resolveLinkState('/app/settings/', presentation('/app/settings/profile'))).toBe('ancestor');
    });

    it('returns exact for the leaf path in an ancestor match', () => {
      expect(resolveLinkState('/app/settings/profile', presentation('/app/settings/profile'))).toBe('exact');
    });

    it('returns inactive for sibling paths under the same parent', () => {
      expect(resolveLinkState('/app/settings/users', presentation('/app/settings/profile'))).toBe('inactive');
    });

    it('does not treat root as a prefix of every URL', () => {
      expect(resolveLinkState('/', presentation('/app/settings/profile'))).toBe('inactive');
      expect(resolveLinkState('/', presentation('/'))).toBe('exact');
    });

    it('ignores hash URLs for ancestor matching', () => {
      expect(resolveLinkState('/docs#intro', presentation('/docs/profile'))).toBe('inactive');
      expect(resolveLinkState('/docs', presentation('/docs#intro'))).toBe('inactive');
    });
  });

  describe('toActiveChain', () => {
    it('maps active chain from a leaf match', () => {
      const parent = createMatchedRoute('/app/settings');
      const leaf = createMatchedRoute('/app/settings/profile');
      leaf.chain = [parent, leaf];
      parent.chain = leaf.chain;

      expect(toActiveChain(leaf)).toEqual([
        { pattern: '/app/settings', href: '/app/settings' },
        { pattern: '/app/settings/profile', href: '/app/settings/profile' },
      ]);
    });

    it('maps an explicit chain array', () => {
      const parent = createMatchedRoute('/app/settings');
      const leaf = createMatchedRoute('/app/settings/profile');
      leaf.chain = [parent, leaf];
      parent.chain = leaf.chain;

      expect(toActiveChain([parent, leaf])).toEqual([
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
        presentation: presentation('/app/settings/'),
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
        presentation: presentation('/app/settings/profile'),
      });

      const link = document.querySelector('a')!;
      expect(link.classList.contains('is-active')).toBe(true);
    });

    it('resolves path-relative href against presentation currentHref', () => {
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
        presentation: presentation('/app/settings/profile'),
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
        presentation: presentation('/two'),
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
        presentation: presentation('/app/settings/'),
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
        presentation: presentation('/about'),
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
        presentation: presentation('/app/settings/profile#panel'),
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
          presentation: presentation('/'),
        }),
      ).not.toThrow();
    });

    it('applies ancestor-active class for prefix matches', () => {
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
        ancestorActiveClass: 'is-ancestor-active',
        presentation: presentation('/app/settings/profile'),
      });

      const [settings, profile] = document.querySelectorAll<HTMLAnchorElement>('a');
      expect(settings.classList.contains('is-active')).toBe(false);
      expect(settings.classList.contains('is-ancestor-active')).toBe(true);
      expect(profile.classList.contains('is-active')).toBe(true);
      expect(profile.classList.contains('is-ancestor-active')).toBe(true);
    });
  });
});
