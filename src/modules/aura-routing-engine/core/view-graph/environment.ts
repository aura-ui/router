import type { FetchText, ViewLoaderEnv } from './types';

/** Default `fetch` + `response.text()` for url-loader. */
export const fetchText: FetchText = async (url, signal) => {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
};

/** `pages/foo.html` → `{origin}/pages/foo.html` */
export function resolveRelativeUrl(path: string): string {
  const normalized = path.replace(/^\//, '');
  return `${window.location.origin}/${normalized}`;
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
