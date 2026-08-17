/**
 * Resolve `view` content before loaders run.
 *
 * - `:name` → `params ∪ query` (path wins on collision)
 * - `…?*` → pathname + raw match `search`
 * - `…?id=:id&tag=:tag` → allowlist/remap; omit missing/empty
 */

const TOKEN = /:(\w+)/g;

export type ResolveViewContentInput = {
  params?: Record<string, string>;
  query?: Record<string, string>;
  /** Raw search including `?`, or `''`. Used by `?*` only. */
  search?: string;
};

/** Replace `:name` from `vars`. Missing tokens stay. Also used by document head attrs. */
export function substituteTokens(template: string, vars: Record<string, string>): string {
  if (!template.includes(':')) return template;
  return template.replace(TOKEN, (token, name: string) => vars[name] ?? token);
}

/** Allowlist `key=:token` only; encode; omit missing/empty/non-tokens. */
function resolveAllowlist(searchTpl: string, vars: Record<string, string>): string {
  const pairs: string[] = [];

  for (const part of searchTpl.split('&')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;

    const val = part.slice(eq + 1);
    if (!/^:\w+$/.test(val)) continue;

    const value = vars[val.slice(1)];
    if (!value) continue;

    pairs.push(`${encodeURIComponent(part.slice(0, eq))}=${encodeURIComponent(value)}`);
  }

  return pairs.length ? `?${pairs.join('&')}` : '';
}

/** Pure resolve for {@link attachResolvedView} / tests. */
export function resolveViewContent(content: string, input: ResolveViewContentInput = {}): string {
  const vars = { ...input.query, ...input.params };
  const q = content.indexOf('?');
  if (q === -1) return substituteTokens(content, vars);

  const path = substituteTokens(content.slice(0, q), vars);
  const searchTpl = content.slice(q + 1);

  if (searchTpl === '*') {
    const { search } = input;
    return search && search !== '?' ? path + search : path;
  }

  return path + resolveAllowlist(searchTpl, vars);
}
