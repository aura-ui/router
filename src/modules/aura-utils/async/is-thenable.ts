/**
 * Runtime check for thenable values (Promise or Promise-like).
 *
 * Used by pipeline runners that accept sync returns or Promises and only
 * `await` when the step actually suspended.
 */
export function isThenable<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  return value != null && typeof (value as PromiseLike<T>).then === 'function';
}
