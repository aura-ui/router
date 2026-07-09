import type { FetchText, ViewLoaderEnv } from './types';

export const fetchText: FetchText = async (url, signal) => {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
};

export function resolveRelativeUrl(path: string): string {
  const normalized = path.replace(/^\//, '');
  return `${window.location.origin}/${normalized}`;
}

export function createBrowserEnvironment(): ViewLoaderEnv {
  return {
    fetchText,
    resolveUrl: resolveRelativeUrl,
    isSSR: false,
  };
}

export const defaultEnvironment = createBrowserEnvironment();
