/** Redirect URL from a blocking phase hook (`enter` / `leave` / `load`). */
export type RedirectTarget =
  | string
  | { url: string; replace?: boolean };

/**
 * Blocking phase hook result.
 *
 * - `void` / `true` — continue
 * - `false` — cancel navigation
 * - `string` | `{ url, replace? }` — redirect
 */
export type GuardResult = void | boolean | RedirectTarget;
