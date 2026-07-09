export type BuiltinLoaderType =
  | 'template'
  | 'html'
  | 'url'
  | 'component'
  | 'import'
  | 'iframe';

export type LoaderType = BuiltinLoaderType | string;

export type ViewAttrDescriptor = {
  loader: LoaderType;
  content: string;
};

/** Default loader for bare `view="content"` (README: `url`). */
export const DEFAULT_VIEW_LOADER = 'url' as const satisfies LoaderType;

/** Canonical built-in loader ids (README order). */
export const BUILTIN_LOADER_TYPES = [
  'template',
  'html',
  'url',
  'component',
  'import',
  'iframe',
] as const satisfies readonly LoaderType[];

/** Subset of {@link BUILTIN_LOADER_TYPES} that require async resolve. */
export const ASYNC_LOADER_TYPES = ['url', 'import', 'iframe'] as const satisfies readonly LoaderType[];

const knownLoaders = new Set<string>(BUILTIN_LOADER_TYPES);
const asyncLoaders = new Set<string>(ASYNC_LOADER_TYPES);

export function isKnownViewLoader(loader: string): boolean {
  return knownLoaders.has(loader);
}

export function isAsyncLoader(loader: string | undefined): boolean {
  return loader !== undefined && asyncLoaders.has(loader);
}

function urlView(content: string): ViewAttrDescriptor {
  warnIfContentLooksLikeModule(content);
  return { loader: DEFAULT_VIEW_LOADER, content };
}

/**
 * Parse `view` attr: bare content → `url`; known loader → `loader::content`;
 * else custom loader (`markdown::…`). Fragment extract — separate `extract` attr.
 */
export function parseViewAttr(value: string | null): ViewAttrDescriptor | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const sep = trimmed.indexOf('::');
  if (sep <= 0) return urlView(trimmed);

  const loader = trimmed.slice(0, sep);
  const content = trimmed.slice(sep + 2);

  if (isKnownViewLoader(loader)) {
    if (loader === DEFAULT_VIEW_LOADER) warnIfContentLooksLikeModule(content);
    return { loader, content };
  }

  return { loader, content };
}

const warnedImportExtension = new Set<string>();
const SCRIPT_PATH_RE = /\.(?:mjs|cjs|jsx|tsx|js|ts)(?:$|[?#])/i;

/** Dev hint when a script path is used with the default `url` loader. */
export function warnIfContentLooksLikeModule(content: string): void {
  if (!SCRIPT_PATH_RE.test(content)) return;
  if (warnedImportExtension.has(content)) return;
  warnedImportExtension.add(content);
  console.warn(
    `view content "${content}" looks like a module path — use import::${content} instead of url`,
  );
}
