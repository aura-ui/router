import { loadingBodyClass, loadingEvent } from '../../core/plugins/view-loading-plugins';
import type { RenderPass } from '../../core/view/types';

function renderPass(): RenderPass {
  return {
    id: 1,
    routeInfo: {
      href: '/',
      pathname: '/',
      search: '',
      hash: '',
      pattern: '/',
    } as RenderPass['routeInfo'],
    signal: new AbortController().signal,
    cacheKey: '/',
    viewKind: 'content',
    useStagedMount: false,
  };
}

describe('loadingBodyClass', () => {
  afterEach(() => {
    document.body.className = '';
  });

  it('adds and removes body class around loading', () => {
    const plugin = loadingBodyClass('test-loading');

    plugin.onLoadingStart?.(renderPass());
    expect(document.body.classList.contains('test-loading')).toBe(true);

    plugin.onLoadingEnd?.(renderPass());
    expect(document.body.classList.contains('test-loading')).toBe(false);
  });
});

describe('loadingEvent', () => {
  it('dispatches aura-route-loading on start', () => {
    const target = document.createElement('div');
    const handler = jest.fn();
    target.addEventListener('aura-route-loading', handler);

    const pass = renderPass();
    loadingEvent(target).onLoadingStart?.(pass);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]).toBeInstanceOf(CustomEvent);
    expect((handler.mock.calls[0]![0] as CustomEvent).detail).toEqual({ pass });
  });
});
