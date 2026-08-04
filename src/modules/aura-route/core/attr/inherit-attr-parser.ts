import { parseCommaSeparated } from '../../../aura-utils/misc/format';

import { isOffKeyword } from './off-keyword';

/** Lifecycle hooks: `none`/`off`/`false` → `[]`. */
export function parseHookList(raw: string | null): string[] | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (isOffKeyword(trimmed)) return [];
  return parseCommaSeparated(trimmed);
}

/** Nullable string with off keywords (`extract`, `loading-*`, `error-template`, `scroll-target`): empty/`none`/`off`/`false` → `null`. */
export function parseOffableString(raw: string | null): string | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (!trimmed || isOffKeyword(trimmed)) return null;
  return trimmed;
}
