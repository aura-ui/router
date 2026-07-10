import { isOffKeyword } from './off-keyword';
import { parseCommaSeparated } from '../../../aura-utils/misc/format';

/** Lifecycle hooks: `none`/`off`/`false` → `[]`. */
export function parseHookList(raw: string | null): string[] | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (isOffKeyword(trimmed)) return [];
  return parseCommaSeparated(trimmed);
}

/** Inheritable nullable string (`extract`): off → `null`. */
export function parseInheritableNullableString(raw: string | null): string | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (!trimmed || isOffKeyword(trimmed)) return null;
  return trimmed;
}

/** Inheritable string (`loading-template`, `error-template`): off → `''`. */
export function parseInheritableString(raw: string | null): string {
  if (raw === null) return '';
  const trimmed = raw.trim();
  if (isOffKeyword(trimmed)) return '';
  return trimmed;
}
