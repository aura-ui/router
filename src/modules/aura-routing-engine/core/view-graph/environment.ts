import type { FetchText, ViewLoaderEnv } from './types';

/** Default `fetch` + `response.text()` for url-loader. */
export const fetchText: FetchText = async (url, signal) => {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
};

function defaultBase(): string | URL {
  const href = globalThis.location?.href;
  if (href) return href;
  throw new Error('resolveRelativeUrl: pass base when location is unavailable (SSR / tests)');
}

/**
 * Resolve a view URL from the site origin (not the current route path).
 * Absolute `https://…` pass through; invalid input returns `path` as-is.
 * Without `location`, callers must pass `base`.
 */
export function resolveRelativeUrl(path: string, base: string | URL = defaultBase()): string {
  try {
    const root = new URL('/', base);
    return new URL(path.trim(), root).href;
  } catch {
    return path;
  }
}

/** Browser {@link ViewLoaderEnv} for {@link LoaderRegistry} / built-in loaders. */
export function createBrowserEnvironment(): ViewLoaderEnv {
  return {
    fetchText,
    resolveUrl: resolveRelativeUrl,
    isSSR: false,
  };
}

export const defaultEnvironment = createBrowserEnvironment();
