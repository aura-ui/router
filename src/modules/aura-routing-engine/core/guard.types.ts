/**
 * Blocking phase hook result — normalized from {@link ../hooks/types!HookResultInput}
 * by {@link ../hooks/registry!normalizeHookResult}.
 *
 * Shared guard contract for {@link ../hooks/registry}, {@link ../navigation/types!NavigationShortCircuit},
 * and {@link ./navigation/navigation-transaction-pipeline-phase}.
 *
 * **Redirect placement (client navigation):**
 * - **`leave` / `guard` during redirect resolve** — {@link ./redirect/redirect-resolver!followRedirectsWithGuardWalk}
 *   runs full `runGuards()` per blocking hop (`leave` before `guard`); hook redirect collapses into one `navigateTo`.
 * - **`guard` / `leave` / `load` in full pipeline** — {@link ./navigation/navigation-transaction-pipeline!NavigationTransactionPipeline.runFullPipeline}
 *   when `skipBlockingPhases` is false; load redirect triggers a new `navigateTo` via
 *   {@link ./aura-routing-engine!AuraRoutingEngine.applyRedirect}.
 * Prefer auth/role redirects in **`guard`**, not **`load`**, for client-first apps.
 *
 * @module guard.types
 */

/** Redirect URL from a blocking phase hook (`guard` / `leave` / `load`). */
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
