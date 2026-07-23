import { loadingBodyClass, loadingEvent } from '../../core/plugins/view-loading-plugins';
import { createRenderPass } from '../_helpers';

describe('loadingBodyClass', () => {
  afterEach(() => {
    document.body.className = '';
  });

  it('adds and removes body class around loading', () => {
    const plugin = loadingBodyClass('test-loading');

    plugin.onLoadingStart?.(createRenderPass({ pathname: '/' }));
    expect(document.body.classList.contains('test-loading')).toBe(true);

    plugin.onLoadingEnd?.(createRenderPass({ pathname: '/' }));
    expect(document.body.classList.contains('test-loading')).toBe(false);
  });
});

describe('loadingEvent', () => {
  it('dispatches aura-route-loading on start', () => {
    const target = document.createElement('div');
    const handler = jest.fn();
    target.addEventListener('aura-route-loading', handler);

    const pass = createRenderPass({ pathname: '/' });
    loadingEvent(target).onLoadingStart?.(pass);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]).toBeInstanceOf(CustomEvent);
    expect((handler.mock.calls[0]![0] as CustomEvent).detail).toEqual({ pass });
  });
});
