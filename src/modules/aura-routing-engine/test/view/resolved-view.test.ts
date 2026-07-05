import { attachResolvedView } from '../../core/route-tree/resolved-view';

function matchFixture(
  overrides: {
    params?: Record<string, string>;
    view?: { type: string; content: string } | null;
    layout?: string;
  } = {},
) {
  return {
    href: '/users/1',
    pathname: '/users/1',
    search: '',
    hash: '',
    pattern: '/users/:id',
    params: overrides.params ?? { id: '1' },
    route: {
      view: 'view' in overrides ? overrides.view : { type: 'html-src', content: 'shell.html' },
      layout: overrides.layout ?? '',
    },
  } as never;
}

describe('attachResolvedView', () => {
  it('sets resolved view from route attrs and params', () => {
    const info = matchFixture({
      view: { type: 'html-src', content: 'content/user/{{id}}.html' },
    });

    attachResolvedView(info);

    expect(info.resolvedView).toEqual({
      type: 'html-src',
      ref: 'content/user/1.html',
      viewKey: 'html-src:content/user/1.html',
    });
  });

  it('leaves unknown placeholders intact', () => {
    const info = matchFixture({
      view: { type: 'html-src', content: 'content/{{missing}}.html' },
    });

    attachResolvedView(info);

    expect(info.resolvedView?.ref).toBe('content/{{missing}}.html');
  });

  it('sets null for layout routes and routes without view', () => {
    const layoutRoute = matchFixture({
      layout: 'app-shell',
      view: { type: 'html-src', content: 'x.html' },
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
