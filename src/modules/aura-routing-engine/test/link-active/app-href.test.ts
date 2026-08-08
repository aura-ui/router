/** @jest-environment jsdom */

import { splitAppHref } from '../../../aura-utils/misc/url';
import {
  getCurrentAppHref,
  isHashOnlyChange,
  pathnamesEqual,
  resolveDocumentHref,
  resolveDocumentHrefParts,
  toDocumentResolutionBase,
  resolveInAppHref,
} from '../../core/link-active/app-href';

describe('app-href helpers', () => {
  const base = 'https://example.com/app/settings/';

  beforeEach(() => {
    window.history.replaceState({}, '', '/app/settings/');
  });

  describe('resolveDocumentHref', () => {
    it('resolves path-relative href against location', () => {
      expect(resolveDocumentHref('users', base)).toBe('/app/settings/users');
      expect(resolveDocumentHref('profile', base)).toBe('/app/settings/profile');
    });

    it('resolves . on folder index base', () => {
      expect(resolveDocumentHref('.', 'https://example.com/app/settings/')).toBe('/app/settings/');
    });

    it('leaves absolute in-app paths unchanged', () => {
      expect(resolveDocumentHref('/about', base)).toBe('/about');
      expect(resolveDocumentHref('/about/', base)).toBe('/about/');
    });
  });

  describe('resolveDocumentHrefParts', () => {
    it('splits absolute in-app hrefs via splitAppHref', () => {
      expect(resolveDocumentHrefParts('/app/users?q=1#tab')).toEqual({
        pathname: '/app/users',
        search: '?q=1',
        hash: '#tab',
        href: '/app/users?q=1#tab',
      });
      expect(resolveDocumentHrefParts('/about')).toEqual({
        pathname: '/about',
        search: '',
        hash: '',
        href: '/about',
      });
    });
  });

  describe('getCurrentAppHref', () => {
    it('returns pathname search and hash from location', () => {
      window.history.replaceState({}, '', '/feed?q=1#top');
      expect(getCurrentAppHref()).toBe('/feed?q=1#top');
    });
  });

  describe('toDocumentResolutionBase', () => {
    it('strips hash before resolving path-relative href', () => {
      const linkBase = toDocumentResolutionBase('/app/settings/profile#panel');
      expect(resolveDocumentHref('users', linkBase)).toBe('/app/settings/users');
    });
  });

  describe('pathnamesEqual', () => {
    it('treats trailing slash variants as equal', () => {
      expect(pathnamesEqual('/app/settings', '/app/settings/')).toBe(true);
    });
  });

  describe('resolveDocumentHrefParts encoding', () => {
    it('decodes percent-encoded pathnames at URL ingress', () => {
      expect(
        resolveDocumentHrefParts(
          '/%D0%B3%D0%BB%D0%B0%D0%B2%D0%BD%D0%B0%D1%8F.html',
          'https://example.com/',
        ),
      ).toEqual({
        pathname: '/главная.html',
        search: '',
        hash: '',
        href: '/главная.html',
      });
    });
  });

  describe('resolveInAppHref', () => {
    it('accepts relative and same-origin absolute / protocol-relative hrefs', () => {
      expect(resolveInAppHref('./users', base)).toBe('/app/settings/users');
      expect(resolveInAppHref('/about')).toBe('/about');
      expect(resolveInAppHref(`${window.location.origin}/главная.html`)).toBe('/главная.html');
      expect(resolveInAppHref(`${window.location.origin}/`)).toBe('/');
      expect(resolveInAppHref(window.location.origin)).toBe('/');
      expect(resolveInAppHref(`${window.location.origin}/p?q=1#tab`)).toBe('/p?q=1#tab');
      expect(resolveInAppHref(`//${window.location.host}/p`)).toBe('/p');
    });

    it('rejects external, hash-only, and empty hrefs', () => {
      expect(resolveInAppHref('https://other.test/x')).toBeNull();
      expect(resolveInAppHref('//other.test/x')).toBeNull();
      expect(resolveInAppHref('#section')).toBeNull();
      expect(resolveInAppHref('   ')).toBeNull();
    });
  });

  describe('isHashOnlyChange', () => {
    it('detects hash-only navigation on the same path', () => {
      const current = splitAppHref('/page#old');
      const next = splitAppHref('/page#new');

      expect(isHashOnlyChange(next, current)).toBe(true);
    });

    it('returns false for different paths or missing next hash', () => {
      const current = splitAppHref('/page#old');

      expect(isHashOnlyChange(splitAppHref('/other#new'), current)).toBe(false);
      expect(isHashOnlyChange(splitAppHref('/page'), current)).toBe(false);
      expect(isHashOnlyChange(splitAppHref('/page#old'), current)).toBe(false);
    });

    it('supports requireExistingHash for prefetch policy', () => {
      const withHash = splitAppHref('/page#old');
      const withoutHash = splitAppHref('/page');
      const next = splitAppHref('/page#tab');

      expect(isHashOnlyChange(next, withHash, { requireExistingHash: true })).toBe(true);
      expect(isHashOnlyChange(next, withoutHash, { requireExistingHash: true })).toBe(false);
    });
  });
});
