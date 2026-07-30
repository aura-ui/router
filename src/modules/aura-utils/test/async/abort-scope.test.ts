import { AbortScope } from '../../async/abort-scope';

describe('AbortScope', () => {
  it('begin returns a non-aborted local signal', () => {
    const scope = new AbortScope();
    const signal = scope.begin();

    expect(signal.aborted).toBe(false);
    expect(scope.aborted).toBe(false);
  });

  it('cancel aborts the active signal', () => {
    const scope = new AbortScope();
    scope.begin();

    scope.cancel();

    expect(scope.aborted).toBe(true);
  });

  it('begin supersedes the previous local signal', () => {
    const scope = new AbortScope();
    const first = scope.begin();

    scope.begin();

    expect(first.aborted).toBe(true);
    expect(scope.aborted).toBe(false);
  });

  it('aborts when parent navigation signal aborts', () => {
    const scope = new AbortScope();
    const parent = new AbortController();

    scope.begin(parent.signal);
    parent.abort();

    expect(scope.aborted).toBe(true);
  });
});
