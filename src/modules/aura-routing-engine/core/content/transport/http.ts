import type { FetchText } from '../model/types';

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
