import { replaceInner, updateInner } from './patch';
import type { PatchSource, DomUpdateOptions, DomUpdateResult } from './types';

/** Base CE with shared inner DOM update helpers. */
export abstract class AuraDom extends HTMLElement {
  /** Replace `container` children; the container node is kept. */
  protected replaceInner(container: HTMLElement, next: PatchSource): void {
    replaceInner(container, next);
  }

  /** Update `container` children (v1: replace-inner). */
  protected updateInner(
    container: HTMLElement,
    next: PatchSource,
    opts?: DomUpdateOptions,
  ): DomUpdateResult {
    return updateInner(container, next, opts);
  }
}
