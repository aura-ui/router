import { componentMarkup, routeSnapshot } from '../../core/view-graph/markup';
import type { ViewLoadContext } from '../../core/view-graph/types';
import { createViewLoadContext } from '../_helpers/view-load-context';

function ctx(overrides: Partial<ViewLoadContext> = {}): ViewLoadContext {
  return createViewLoadContext({
    content: 'my-widget',
    route: {
      href: '/users/1?q=1',
      pattern: '/users/:id',
      params: { id: '1' },
      query: { q: '1' },
    },
    data: { userId: '1' },
    ...overrides,
  });
}

describe('routeSnapshot', () => {
  it('collects route fields and load-hook data', () => {
    expect(routeSnapshot(ctx())).toEqual({
      href: '/users/1?q=1',
      pattern: '/users/:id',
      params: { id: '1' },
      query: { q: '1' },
      data: { userId: '1' },
    });
  });

  it('omits optional fields when absent', () => {
    expect(
      routeSnapshot(
        ctx({
          route: { href: '/about', pattern: '/about' },
          data: undefined,
        }),
      ),
    ).toEqual({
      href: '/about',
      pattern: '/about',
    });
  });
});

describe('componentMarkup', () => {
  it('builds aura-data markup for a custom element tag', () => {
    const markup = componentMarkup('my-widget', ctx());
    expect(markup).toMatch(/^<my-widget aura-data='/);
    expect(markup).toContain('&quot;href&quot;:&quot;/users/1?q=1&quot;');
    expect(markup).toContain('&quot;userId&quot;:&quot;1&quot;');
    expect(markup).toContain('></my-widget>');
  });

  it('escapes quotes in serialized route data', () => {
    const markup = componentMarkup('x-widget', ctx({ data: { note: `he said "hi"` } }));
    expect(markup).toContain('\\&quot;hi\\&quot;');
    expect(markup).toMatch(/^<x-widget aura-data='/);
  });

  it('throws for unsafe tag names', () => {
    expect(() => componentMarkup('img src=x onerror=alert(1)', ctx())).toThrow(
      'Invalid custom element tag name',
    );
    expect(() => componentMarkup('SCRIPT', ctx())).toThrow('Invalid custom element tag name');
  });
});
