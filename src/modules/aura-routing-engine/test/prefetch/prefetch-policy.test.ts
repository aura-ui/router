import { parsePrefetchAttr } from '../../../aura-route/core/attr/prefetch-attr-parser';
import {
  DEFAULT_ROUTER_PREFETCH_MODE,
  readLinkPrefetchOverride,
  resolvePrefetchEngineConfig,
  resolvePrefetchMode,
} from '../../core/prefetch/prefetch-policy';

describe('parsePrefetchAttr', () => {
  it('returns null when attr is absent', () => {
    expect(parsePrefetchAttr(null)).toBeNull();
  });

  it('treats empty attr as disabled', () => {
    expect(parsePrefetchAttr('')).toBe(false);
  });

  it('treats boolean true attr as intent', () => {
    expect(parsePrefetchAttr('true')).toBe('intent');
  });

  it('parses supported prefetch modes', () => {
    expect(parsePrefetchAttr('intent')).toBe('intent');
    expect(parsePrefetchAttr('tap')).toBe('tap');
  });

  it('disables prefetch for false/none/off', () => {
    expect(parsePrefetchAttr('false')).toBe(false);
    expect(parsePrefetchAttr('none')).toBe(false);
    expect(parsePrefetchAttr('off')).toBe(false);
  });

  it('returns null for unknown values', () => {
    expect(parsePrefetchAttr('hover')).toBeNull();
  });
});

describe('resolvePrefetchEngineConfig', () => {
  it('omits config when router attr is absent', () => {
    expect(resolvePrefetchEngineConfig(null)).toBeUndefined();
    expect(resolvePrefetchEngineConfig(undefined)).toBeUndefined();
  });

  it('disables prefetch pipeline when policy is false', () => {
    expect(resolvePrefetchEngineConfig(false)).toBe(false);
  });

  it('maps mode to defaultMode', () => {
    expect(resolvePrefetchEngineConfig('tap')).toEqual({ defaultMode: 'tap' });
    expect(resolvePrefetchEngineConfig(DEFAULT_ROUTER_PREFETCH_MODE)).toEqual({
      defaultMode: 'intent',
    });
  });
});

describe('readLinkPrefetchOverride', () => {
  it('returns undefined when data-prefetch is absent', () => {
    expect(readLinkPrefetchOverride(document.createElement('a'))).toBeUndefined();
  });

  it('returns false for data-prefetch="none"', () => {
    const anchor = document.createElement('a');
    anchor.setAttribute('data-prefetch', 'none');
    expect(readLinkPrefetchOverride(anchor)).toBe(false);
  });
});

describe('resolvePrefetchMode', () => {
  it('prefers link override over route and router', () => {
    const anchor = document.createElement('a');
    anchor.setAttribute('data-prefetch', 'tap');

    expect(
      resolvePrefetchMode({
        anchor,
        route: { prefetch: 'intent' } as never,
        routerDefault: 'intent',
      }),
    ).toBe('tap');
  });

  it('disables when link sets false', () => {
    const anchor = document.createElement('a');
    anchor.setAttribute('data-prefetch', 'false');

    expect(
      resolvePrefetchMode({
        anchor,
        route: { prefetch: 'intent' } as never,
        routerDefault: 'intent',
      }),
    ).toBeNull();
  });

  it('uses route policy when link has no override', () => {
    const anchor = document.createElement('a');

    expect(
      resolvePrefetchMode({
        anchor,
        route: { prefetch: 'tap' } as never,
        routerDefault: 'intent',
      }),
    ).toBe('tap');
  });

  it('disables when route sets false', () => {
    const anchor = document.createElement('a');

    expect(
      resolvePrefetchMode({
        anchor,
        route: { prefetch: false } as never,
        routerDefault: 'intent',
      }),
    ).toBeNull();
  });

  it('uses router default on hover', () => {
    expect(resolvePrefetchMode({ anchor: document.createElement('a'), routerDefault: 'intent' })).toBe(
      'intent',
    );
  });

  it('uses tap on touch when nothing else decided', () => {
    expect(resolvePrefetchMode({ anchor: document.createElement('a'), touch: true })).toBe('tap');
  });
});
