import { AuraRoutingUrlMatcher } from '../../core/match/url-matcher';
import {
  buildTreeFromDom,
  createDomPathGroup,
  createDomRoute,
  matchDomPath,
} from '../_helpers/test-route-dom';

describe('path group (folder without layout)', () => {
  it('joins :lang, matches child only, substitutes view params', () => {
    const page = createDomRoute('page.html');
    page.setAttribute('view', ':lang/page.html');
    const group = createDomPathGroup(':lang', [page]);

    expect(() => group.validateAttrs()).not.toThrow();
    expect(group.type).toBe('folder');
    expect(group.hasLayout).toBe(false);
    expect(group.hasViewContent).toBe(false);
    expect(
      group.mountResolvedView(
        { href: '/укр/page.html', pathname: '/укр/page.html', search: '', hash: '', pattern: '/:lang', route: group },
        { preResolvedView: null },
      ),
    ).toEqual({ status: 'ok' });

    const { matchableNodes } = buildTreeFromDom(group);
    expect(matchableNodes.map((node) => node.pattern)).toEqual(['/:lang/page.html']);

    const matcher = new AuraRoutingUrlMatcher();
    expect(matcher.matchPath('/укр', matchableNodes)).toBeNull();

    const leaf = matchDomPath(matcher, '/укр/page.html', group);
    expect(leaf.params).toEqual({ lang: 'укр' });
    expect(leaf.resolvedView).toEqual({
      loader: 'url',
      content: 'укр/page.html',
      viewKey: 'url:укр/page.html',
    });
    expect(leaf.chain?.map((entry) => entry.pattern)).toEqual(['/:lang', '/:lang/page.html']);
  });

  it('keeps layout parents matchable when they have no index child', () => {
    const profile = createDomRoute('profile');
    const settings = createDomRoute('/settings', [profile]);
    const { matchableNodes } = buildTreeFromDom(settings);

    expect(matchableNodes.map((node) => node.pattern)).toEqual([
      '/settings/profile',
      '/settings',
    ]);
  });
});
