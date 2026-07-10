import { isOffKeyword } from './off-keyword';

export type ParamChangePolicy = 'update' | 'navigate';

const MODES = new Set<string>(['update', 'navigate']);

export function parseParamChangeAttr(value: string | null): ParamChangePolicy | null {
  if (value === null) return null;

  const trimmed = value.trim().toLowerCase();
  if (!trimmed || isOffKeyword(trimmed)) return null;
  if (MODES.has(trimmed)) return trimmed as ParamChangePolicy;

  return null;
}
