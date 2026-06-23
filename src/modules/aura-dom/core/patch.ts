import type { DomUpdateOptions, DomUpdateResult, PatchSource } from './types';

/** Replace `container` children; the container node is kept. */
export function replaceInner(container: HTMLElement, next: PatchSource): void {
  container.replaceChildren();
  if (typeof next === 'string') {
    const tpl = document.createElement('template');
    tpl.innerHTML = next;
    container.append(...tpl.content.childNodes);
    return;
  }
  if (next instanceof DocumentFragment) {
    container.append(...next.childNodes);
    return;
  }
  container.appendChild(next);
}

/** Update `container` children (v1: replace-inner). */
export function updateInner(
  container: HTMLElement,
  next: PatchSource,
  opts?: DomUpdateOptions,
): DomUpdateResult {
  if (opts?.signal?.aborted) return { incremental: false };

  replaceInner(container, next);

  if (opts?.key) container.dataset.auraKey = opts.key;
  return { incremental: false };
}
