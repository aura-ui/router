/**
 * Blocking phase hook result — normalized from {@link ../hooks/types!HookResultInput}
 * by {@link ../hooks/registry!normalizeHookResult}.
 *
 * Shared guard contract for {@link ../hooks/registry}, {@link ../lifecycle/phase-runner},
 * and {@link ../processor/processor-pipeline} — not the author-facing {@link ../hooks/types!HookResult}.
 *
 * @module guard.types
 */

/** Redirect URL from a blocking phase hook (`enter` / `leave` / `load`). */
export type RedirectTarget =
  | string
  | { url: string; replace?: boolean };

/**
 * Blocking phase hook result after normalization.
 *
 * - `void` / `true` — continue
 * - `false` — cancel navigation
 * - `string` | `{ url, replace? }` — redirect
 */
export type GuardResult = void | boolean | RedirectTarget;
