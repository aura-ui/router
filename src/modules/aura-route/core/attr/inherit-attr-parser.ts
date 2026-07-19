import { parseCommaSeparated } from '../../../aura-utils/misc/format';

import { isOffKeyword } from './off-keyword';

/** Lifecycle hooks: `none`/`off`/`false` → `[]`. */
export function parseHookList(raw: string | null): string[] | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (isOffKeyword(trimmed)) return [];
  return parseCommaSeparated(trimmed);
}

/** Inheritable nullable string (`extract`, `loading-template`, `error-template`): off → `null`. */
export function parseInheritableNullableString(raw: string | null): string | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (!trimmed || isOffKeyword(trimmed)) return null;
  return trimmed;
}
