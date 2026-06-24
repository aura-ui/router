export type BuiltInContentType = 'html' | 'html-src' | 'template' | 'component' | 'component-src';

/** Built-in content types plus any custom loader id registered via `AuraRouter.registerLoader`. */
export type AuraRouteContentType = BuiltInContentType | (string & {});

export interface LoaderOptions {
  signal?: AbortSignal;
  componentOptions?: Record<string, unknown>;
}
