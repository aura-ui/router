import { applyCommitGate } from '../../core/navigation/commit-gate';
import { createTestRoute } from '../helpers/create-test-route';

describe('navigation/commit-gate', () => {
  const provider = { commit: jest.fn(), rollback: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('commits history and prev on success', () => {
    const to = {
      href: '/to',
      pathname: '/to',
      search: '',
      hash: '',
      pattern: '/to',
      route: createTestRoute('/to'),
    };
    const onNavigationCommitted = jest.fn();

    const effects = applyCommitGate({
      from: null,
      to,
      action: 'push',
      href: '/to',
      hash: '',
      options: { replace: false, syncHistory: true },
      provider,
      onNavigationCommitted,
    });

    expect(effects).toEqual({ setPrev: to });
    expect(provider.commit).toHaveBeenCalledWith('/to', { replace: false, syncHistory: true });
    expect(onNavigationCommitted).toHaveBeenCalledWith({
      from: null,
      to,
      action: 'push',
      hash: '',
    });
  });

  it('preserves history on reenter (same target)', () => {
    const route = createTestRoute('/about');
    const matched = {
      href: '/about',
      pathname: '/about',
      search: '',
      hash: '',
      pattern: '/about',
      route,
    };
    const onNavigationCommitted = jest.fn();

    const effects = applyCommitGate({
      from: matched,
      to: matched,
      action: 'push',
      href: '/about',
      hash: '',
      options: { replace: false, syncHistory: true },
      provider,
      onNavigationCommitted,
    });

    expect(effects).toEqual({ setPrev: matched });
    expect(onNavigationCommitted).toHaveBeenCalledWith({
      from: matched,
      to: matched,
      action: 'push',
      hash: '',
    });
    expect(provider.commit).not.toHaveBeenCalled();
  });

  it('calls onNavigationCommitted before hash scroll', () => {
    const to = {
      href: '/to#tab',
      pathname: '/to',
      search: '',
      hash: '#tab',
      pattern: '/to',
      route: createTestRoute('/to'),
    };
    const onNavigationCommitted = jest.fn();
    const scrollToHash = jest.fn();

    applyCommitGate({
      from: null,
      to,
      action: 'push',
      href: '/to#tab',
      hash: '#tab',
      options: { replace: false, syncHistory: true },
      provider,
      onNavigationCommitted,
      scrollToHash,
    });

    expect(onNavigationCommitted).toHaveBeenCalledWith({
      from: null,
      to,
      action: 'push',
      hash: '#tab',
    });
    expect(scrollToHash).toHaveBeenCalledWith('#tab');
  });
});
