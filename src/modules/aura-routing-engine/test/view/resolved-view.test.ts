import { attachResolvedView } from '../../core/route-tree/resolved-view';
import { createMatchedRoute } from '../_helpers/create-mock-transaction';

function matchFixture(
  overrides: {
    params?: Record<string, string>;
    view?: { loader: string; content: string } | null;
    layout?: string;
  } = {},
) {
  return createMatchedRoute('/users/1', {
    pattern: '/users/:id',
    params: overrides.params ?? { id: '1' },
    view: 'view' in overrides ? overrides.view : { loader: 'url', content: 'shell.html' },
    layout: overrides.layout ?? '',
  });
}

describe('attachResolvedView', () => {
  it('sets resolved view from route attrs and params', () => {
    const info = matchFixture({
      view: { loader: 'url', content: 'content/user/:id.html' },
    });

    attachResolvedView(info);

    expect(info.resolvedView).toEqual({
      loader: 'url',
      content: 'content/user/1.html',
      viewKey: 'url:content/user/1.html',
    });
  });

  it('leaves unknown :param tokens intact', () => {
    const info = matchFixture({
      view: { loader: 'url', content: ':lang/page.html' },
    });

    attachResolvedView(info);

    expect(info.resolvedView?.content).toBe(':lang/page.html');
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
