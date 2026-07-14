import { onAbort } from '../../async/on-abort';

describe('onAbort', () => {
  it('invokes callback immediately when signal is already aborted', () => {
    const controller = new AbortController();
    controller.abort();
    const callback = jest.fn();

    const clear = onAbort(controller.signal, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    clear();
  });

  it('invokes callback when signal aborts after subscription', () => {
    const controller = new AbortController();
    const callback = jest.fn();

    onAbort(controller.signal, callback);
    expect(callback).not.toHaveBeenCalled();

    controller.abort();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('dispose removes the listener before abort', () => {
    const controller = new AbortController();
    const callback = jest.fn();

    const clear = onAbort(controller.signal, callback);
    clear();
    controller.abort();

    expect(callback).not.toHaveBeenCalled();
  });
});
