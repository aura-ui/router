import { RenderSignal } from '../core/view/render-signal';

describe('RenderSignal', () => {
  it('begin returns a non-aborted local signal', () => {
    const renderSignal = new RenderSignal();
    const signal = renderSignal.begin();

    expect(signal.aborted).toBe(false);
    expect(renderSignal.aborted).toBe(false);
  });

  it('cancel aborts the active signal', () => {
    const renderSignal = new RenderSignal();
    renderSignal.begin();

    renderSignal.cancel();

    expect(renderSignal.aborted).toBe(true);
  });

  it('begin supersedes the previous local signal', () => {
    const renderSignal = new RenderSignal();
    const first = renderSignal.begin();

    renderSignal.begin();

    expect(first.aborted).toBe(true);
    expect(renderSignal.aborted).toBe(false);
  });

  it('aborts when parent navigation signal aborts', () => {
    const renderSignal = new RenderSignal();
    const parent = new AbortController();

    renderSignal.begin(parent.signal);
    parent.abort();

    expect(renderSignal.aborted).toBe(true);
  });
});
