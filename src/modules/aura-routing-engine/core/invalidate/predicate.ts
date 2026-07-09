import type { RouterInvalidateOptions } from './types';

/** Builds a router cache-key predicate. `null` = all keys. */
export function resolveRouterInvalidatePredicate(
  options?: Pick<RouterInvalidateOptions, 'key' | 'path' | 'match'>,
): ((key: string) => boolean) | null {
  if (!options?.key && !options?.path && !options?.match) return null;

  if (options.key) {
    const key = options.key;
    return (entryKey) => entryKey === key;
  }

  if (options.path) {
    const path = options.path;
    return (entryKey) => entryKey === path || entryKey.startsWith(`${path}|`);
  }

  return options.match!;
}
