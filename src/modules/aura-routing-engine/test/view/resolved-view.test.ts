import { attachResolvedView } from '../../core/route-tree/resolved-view';
import { createMatchedRoute } from '../_helpers/create-mock-transaction';

function matchFixture(
  overrides: {
    params?: Record<string, string>;
    query?: Record<string, string>;
    search?: string;
    view?: { loader: string; content: string } | null;
    layout?: string;
  } = {},
) {
  return createMatchedRoute('/users/1', {
    pattern: '/users/:id',
    params: overrides.params ?? { id: '1' },
    query: overrides.query,
    search: overrides.search ?? '',
    view: 'view' in overrides ? overrides.view : { loader: 'url', content: 'shell.html' },
    layout: overrides.layout ?? '',
  });
}

describe('attachResolvedView', () => {
  it('builds resolvedView from leaf params/query/search', () => {
    const info = matchFixture({
      view: { loader: 'url', content: 'content/user/:id.html' },
    });
    attachResolvedView(info);
    expect(info.resolvedView).toEqual({
      loader: 'url',
      content: 'content/user/1.html',
      viewKey: 'url:content/user/1.html',
    });

    // Smoke: search / query reach resolveViewContent (full matrix is unit-tested there).
    const withSearch = matchFixture({
      params: {},
      search: '?id=1',
      view: { loader: 'url', content: '/item.html?*' },
    });
    attachResolvedView(withSearch);
    expect(withSearch.resolvedView?.content).toBe('/item.html?id=1');
  });

  it('sets null for layout routes and routes without view', () => {
    const layoutRoute = matchFixture({
      layout: 'app-shell',
      view: { loader: 'url', content: 'x.html' },
    });
    attachResolvedView(layoutRoute);
    expect(layoutRoute.resolvedView).toBeNull();

    const noView = matchFixture({ view: null });
    attachResolvedView(noView);
    expect(noView.resolvedView).toBeNull();
  });

  it('runs once per match', () => {
    const info = matchFixture();
    attachResolvedView(info);
    const cached = info.resolvedView;
    attachResolvedView(info);
    expect(info.resolvedView).toBe(cached);
  });
});
