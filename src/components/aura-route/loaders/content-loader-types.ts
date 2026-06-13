export type BuiltInContentType = 'html' | 'html-src' | 'template' | 'component' | 'component-src';

/** Built-in content types plus any custom loader id registered via `AURARoute.registerLoader`. */
export type AURARouteContentType = BuiltInContentType | (string & {});
