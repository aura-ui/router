export function parsePath(path: string): { pathname: string; search: string, hash:string } {
  const { pathname, search, hash  } = new URL(path, window.location.origin);
  return { pathname, search , hash};
}

export function parseQuery(search: string): Record<string, string> | undefined {
  if (!search || search === '?') return undefined;

  const params = Object.fromEntries(new URLSearchParams(search));
  return Object.keys(params).length > 0 ? params : undefined;
}