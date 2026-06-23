import { replaceInner, updateInner } from './patch';
import type { DomUpdateOptions, DomUpdateResult, PatchSource } from './types';

/** Base CE with shared inner DOM update helpers. */
export abstract class AuraDom extends HTMLElement {
  protected replaceInner(container: HTMLElement, next: PatchSource): void {
    replaceInner(container, next);
  }

  protected updateInner(
    container: HTMLElement,
    next: PatchSource,
    opts?: DomUpdateOptions,
  ): DomUpdateResult {
    return updateInner(container, next, opts);
  }
}
