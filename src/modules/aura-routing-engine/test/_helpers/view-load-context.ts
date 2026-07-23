import type { ViewLoadContext, ViewLoaderEnv } from '../../core/view-graph/types';

/** Minimal {@link ViewLoadContext} for loader / markup unit tests. */
export function createViewLoadContext(
  overrides: Partial<ViewLoadContext> = {},
): ViewLoadContext {
  return {
    content: 'x',
    kind: 'view',
    signal: new AbortController().signal,
    route: { href: '/x', pattern: '/x' },
    ...overrides,
  };
}

/** Stub {@link ViewLoaderEnv} for registry / loader isolation tests. */
export function createTestLoaderEnv(
  overrides: Partial<ViewLoaderEnv> = {},
): ViewLoaderEnv {
  return {
    fetchText: async () => '',
    resolveUrl: (content) => content,
    isSSR: false,
    ...overrides,
  };
}
