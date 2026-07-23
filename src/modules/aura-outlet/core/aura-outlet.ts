import { AuraDom } from '../../aura-dom/core/aura-dom';
import type { PatchSource } from '../../aura-dom/core/types';

/** `replace` — swap view root; `patch` — update inner content; `stage` — append next root for transitions. */
export type OutletStrategy = 'replace' | 'patch' | 'stage';

/** Marks auto-created or adopted view wrapper elements. */
export const AURA_VIEW_ROOT_ATTR = 'data-aura-view-root';

/** Mounted view wrapper (`[data-aura-view-root]`). */
export type ViewRoot = HTMLElement;

/** Inner content for `patch` (not a view root). */
export type ViewContent = Exclude<PatchSource, HTMLElement>;

/** Payload for `replace` / `stage`; inner content for `patch`. */
export type OutletApplyInput = ViewRoot | ViewContent;

export type OutletReplaceOptions = {
  strategy?: Extract<OutletStrategy, 'replace' | 'stage'>;
  /** Route/view id; omitted → `data-aura-key` is cleared. */
  key?: string;
  signal?: AbortSignal;
};

export type OutletPatchOptions = {
  strategy: Extract<OutletStrategy, 'patch'>;
  /** Route/view id; omitted → `data-aura-key` is cleared. */
  key?: string;
  signal?: AbortSignal;
};

export type OutletApplyOptions = OutletReplaceOptions | OutletPatchOptions;

/** Handle to a mounted view; used for transitions and teardown. */
export type ViewHandle = {
  /** DOM wrapper mounted inside the outlet (`[data-aura-view-root]`). */
  viewRoot: ViewRoot;
  /** Outlet that owns this view. */
  mountOutlet: AuraOutlet;
  /** Snapshot of `data-aura-key` at handle creation. */
  key?: string;
  /** First nested `<aura-outlet>` inside this view root (layout shell). */
  findChildOutlet(): AuraOutlet | null;
  /** Remove from outlet; keep subtree. Idempotent. */
  detach(): ViewRoot;
  /** Remove from DOM and clear children. Idempotent. */
  destroy(): void;
};

/**
 * DOM slot for routed views.
 * Strategies: `replace`, `patch`, `stage` + `commitStage` / `cancelStage`.
 */
export class AuraOutlet extends AuraDom {
  static is = 'aura-outlet';

  private activeRoot?: ViewRoot;
  private stagedRoot?: ViewRoot;

  /** Clears internal refs; DOM children stay on the element. */
  disconnectedCallback(): void {
    this.stagedRoot = undefined;
    this.activeRoot = undefined;
  }

  /**
   * Mount or update a view.
   * @returns `null` if `signal` is already aborted.
   */
  apply(content: ViewContent, opts: OutletPatchOptions): ViewHandle | null;
  apply(payload: OutletApplyInput, opts?: OutletReplaceOptions): ViewHandle | null;
  apply(payload: OutletApplyInput, opts: OutletApplyOptions = {}): ViewHandle | null {
    const { key, signal } = opts;
    const strategy = opts.strategy ?? 'replace';

    if (signal?.aborted) {
      return null;
    }

    switch (strategy) {
      case 'patch':
        return this.applyPatch(payload as ViewContent, key, signal);
      case 'stage':
        return this.applyStage(payload, key);
      case 'replace':
      default:
        return this.applyReplace(this.asRoot(payload), key);
    }
  }

  /** Finish transition: remove sibling roots, keep `root` (must be a direct child). */
  commitStage(root: ViewRoot): void {
    if (root.parentElement !== this) {
      throw new DOMException(
        'commitStage root must be a direct child of this outlet',
        'InvalidStateError',
      );
    }

    for (const child of [...this.children]) {
      if (child !== root) child.remove();
    }
    this.activeRoot = root;
    this.stagedRoot = undefined;
  }

  /** Abort transition: remove staged root, keep active view. */
  cancelStage(): void {
    if (!this.stagedRoot) return;
    this.stagedRoot.remove();
    this.stagedRoot = undefined;
    this.activeRoot && (this.activeRoot.hidden = false);
  }

  /** Hide the committed active root (e.g. while a loading skeleton is staged). */
  hideActive(): void {
    if (this.activeRoot) this.activeRoot.hidden = true;
  }

  /** First nested `<aura-outlet>` in staged, active, or this element. */
  findNestedOutlet(root: ParentNode = this.stagedRoot ?? this.activeRoot ?? this): AuraOutlet | null {
    return root.querySelector(AuraOutlet.is) as AuraOutlet | null;
  }

  /** Replace outlet content with a single view root. */
  private applyReplace(root: ViewRoot, key?: string): ViewHandle {
    this.stagedRoot = undefined;
    this.replaceChildren(root);
    this.activeRoot = root;
    this.applyKey(root, key);
    return this.makeHandle(root);
  }

  /** Update inner content of the active root (or bootstrap one). */
  private applyPatch(content: ViewContent, key?: string, signal?: AbortSignal): ViewHandle {
    if (!this.activeRoot) {
      const root = this.createViewRoot();
      this.updateInner(root, content, { signal });
      return this.applyReplace(root, key);
    }

    this.updateInner(this.activeRoot, content, { signal });
    this.applyKey(this.activeRoot, key);
    return this.makeHandle(this.activeRoot);
  }

  /** Append next root; active root stays until `commitStage`. */
  private applyStage(payload: OutletApplyInput, key?: string): ViewHandle {
    const root = this.asRoot(payload);
    if (!this.activeRoot) {
      return this.applyReplace(root, key);
    }

    if (this.stagedRoot) this.stagedRoot.remove();
    this.applyKey(root, key);
    this.stagedRoot = root;
    this.appendChild(root);
    return this.makeHandle(root);
  }

  /** Resolve mount payload to a view root (wrap content when needed). */
  private asRoot(payload: ViewRoot | ViewContent): ViewRoot {
    if (payload instanceof HTMLElement) {
      if (!payload.hasAttribute(AURA_VIEW_ROOT_ATTR)) {
        payload.setAttribute(AURA_VIEW_ROOT_ATTR, '');
      }
      return payload;
    }

    const root = this.createViewRoot();
    this.replaceInner(root, payload);
    return root;
  }

  private createViewRoot(): HTMLDivElement {
    const root = document.createElement('div');
    root.setAttribute(AURA_VIEW_ROOT_ATTR, '');
    return root;
  }

  private makeHandle(viewRoot: ViewRoot): ViewHandle {
    let destroyed = false;
    let detached = false;

    return {
      viewRoot,
      mountOutlet: this,
      key: viewRoot.dataset.auraKey || undefined,
      findChildOutlet: () => this.findNestedOutlet(viewRoot),
      detach: () => {
        if (detached || destroyed) return viewRoot;
        detached = true;
        viewRoot.remove();
        this.syncStateAfterRootRemoved(viewRoot);
        return viewRoot;
      },
      destroy: () => {
        if (destroyed) return;
        destroyed = true;
        viewRoot.replaceChildren();
        viewRoot.remove();
        this.syncStateAfterRootRemoved(viewRoot);
      },
    };
  }

  private applyKey(root: ViewRoot, key?: string): void {
    if (key) this.setRootKey(root, key);
    else delete root.dataset.auraKey;
  }

  private setRootKey(root: ViewRoot, key: string): void {
    root.dataset.auraKey = key;
  }

  /** Sync refs after handle teardown; promotes staged root if active was removed mid-transition. */
  private syncStateAfterRootRemoved(root: ViewRoot): void {
    if (this.stagedRoot === root) {
      this.stagedRoot = undefined;
      return;
    }

    if (this.activeRoot !== root) return;

    this.activeRoot = undefined;
    if (this.stagedRoot) {
      this.activeRoot = this.stagedRoot;
      this.stagedRoot = undefined;
    }
  }
}
