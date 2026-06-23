import { AuraDom } from '../../aura-dom/core/aura-dom';
import type { PatchSource } from '../../aura-dom/core/types';

/** Outlet DOM update strategy. */
export type OutletStrategy = 'replace' | 'patch' | 'stage';

/** Attribute on auto-created view wrapper (`[data-aura-view-root]`). */
export const AURA_VIEW_ROOT_ATTR = 'data-aura-view-root';

/** Wrapper element for a mounted view (`[data-aura-view-root]`). */
export type ViewRoot = HTMLElement;

/**
 * Inner content for patch updates (not a view root wrapper).
 * `string` | `DocumentFragment` | non-`HTMLElement` `Node` (e.g. `Text`, `SVGElement`).
 */
export type ViewContent = Exclude<PatchSource, HTMLElement>;

/** `replace` / `stage`: mount payload; `patch`: inner content only. */
export type OutletApplyInput = ViewRoot | ViewContent;

export type OutletReplaceOptions = {
  strategy?: Extract<OutletStrategy, 'replace' | 'stage'>;
  key?: string;
  signal?: AbortSignal;
};

export type OutletPatchOptions = {
  strategy: Extract<OutletStrategy, 'patch'>;
  key?: string;
  signal?: AbortSignal;
};

export type OutletApplyOptions = OutletReplaceOptions | OutletPatchOptions;

/** Programmatic handle to a mounted view subtree. */
export type ViewHandle = {
  /** Animation / morph target. */
  root: ViewRoot;
  outlet: AuraOutlet;
  key?: string;
  /** Remove root from DOM and clear its children. Idempotent. */
  destroy(): void;
  /** Remove root from outlet; keep subtree for reattach. Idempotent. */
  detach(): ViewRoot;
};

/** DOM mount slot; executes replace / patch / stage strategies. */
export class AuraOutlet extends AuraDom {
  static is = 'aura-outlet';

  private activeRoot?: ViewRoot;
  private stagedRoot?: ViewRoot;

  disconnectedCallback(): void {
    this.stagedRoot = undefined;
    this.activeRoot = undefined;
  }

  /** Mount or update view; `null` when `signal` is already aborted. */
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

  /**
   * After transition: drop other children, keep `root`.
   * Active key is taken from `root` only (`data-aura-key`).
   */
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

  /** Drop staged root without changing the active view. */
  cancelStage(): void {
    if (!this.stagedRoot) return;
    this.stagedRoot.remove();
    this.stagedRoot = undefined;
  }

  /** Nested `<aura-outlet>` inside a layout view root. */
  findNestedOutlet(root: ParentNode = this.stagedRoot ?? this.activeRoot ?? this): AuraOutlet | null {
    return root.querySelector(AuraOutlet.is) as AuraOutlet | null;
  }

  private applyReplace(root: ViewRoot, key?: string): ViewHandle {
    this.stagedRoot = undefined;
    this.replaceChildren(root);
    this.activeRoot = root;
    this.applyKey(root, key);
    return this.makeHandle(root);
  }

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

  /**
   * Append next root while keeping the current one visible until {@link commitStage}.
   * Key is stored on the staged root only until commit.
   */
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

  private asRoot(payload: ViewRoot | ViewContent): ViewRoot {
    if (payload instanceof HTMLElement) {
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

  private makeHandle(root: ViewRoot): ViewHandle {
    let destroyed = false;
    let detached = false;

    return {
      root,
      outlet: this,
      key: root.dataset.auraKey || undefined,
      destroy: () => {
        if (destroyed) return;
        destroyed = true;
        root.replaceChildren();
        root.remove();
        this.syncStateAfterRootRemoved(root);
      },
      detach: () => {
        if (detached || destroyed) return root;
        detached = true;
        root.remove();
        this.syncStateAfterRootRemoved(root);
        return root;
      },
    };
  }

  /** Set `data-aura-key` on `root`, or clear it when `key` is omitted. */
  private applyKey(root: ViewRoot, key?: string): void {
    if (key) this.setRootKey(root, key);
    else delete root.dataset.auraKey;
  }

  private setRootKey(root: ViewRoot, key: string): void {
    root.dataset.auraKey = key;
  }

  /**
   * Keep `activeRoot` / `stagedRoot` in sync after a view root leaves the outlet
   * (`destroy` / `detach` on a {@link ViewHandle}).
   *
   * - Staged root removed → clear `stagedRoot` only; active view unchanged.
   * - Active root removed while a staged sibling exists → staged becomes active
   *   (transition-out removed the old view; the incoming view is already in the DOM).
   * - Active root removed with no staged sibling → clear `activeRoot`.
   * - Unknown / already detached root → no-op.
   */
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
