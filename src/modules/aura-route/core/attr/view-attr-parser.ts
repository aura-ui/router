export type LoaderType =
  | 'template'
  | 'html'
  | 'html-src'
  | 'component'
  | 'component-src'
  | (string & {});

export type ViewAttrDescriptor = {
  type: LoaderType;
  content: string;
};

const DEFAULT_VIEW_LOADER: LoaderType = 'html-src';

export function parseViewAttr(value: string | null): ViewAttrDescriptor | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const sep = trimmed.indexOf('::');
  if (sep <= 0) {
    return { type: DEFAULT_VIEW_LOADER, content: trimmed };
  }

  // todo add checks with registered types in service
  return {
    type: trimmed.slice(0, sep),
    content: trimmed.slice(sep + 2),
  };
}