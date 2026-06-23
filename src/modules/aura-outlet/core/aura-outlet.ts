import { AuraDom } from '../../aura-dom/core/aura-dom';
import type { PatchSource } from '../../aura-dom/core/types';

/** Outlet DOM update strategy. */
export type OutletStrategy = 'replace' | 'patch' | 'stage';

/** Attribute on auto-created view wrapper (`[data-aura-view-root]`). */
export const AURA_VIEW_ROOT_ATTR = 'data-aura-view-root';

/** Wrapper element for a mounted view (`[data-aura-view-root]`). */
export type ViewRoot = HTMLElement;

/** Inner content for patch updates. */
export type ViewContent = PatchSource;

/** `replace`/`stage`: view root; `patch`: inner content. */
export type OutletApplyInput = ViewRoot | ViewContent;

export type OutletApplyOptions = {
  /** Default `replace`. */
  strategy?: OutletStrategy;
  /** Optional view metadata for handle / cache; strategy is chosen upstream. */
  key?: string;
  signal?: AbortSignal;
};

/** Programmatic handle to a mounted view subtree. */
export type ViewHandle = {
  /** Patch / animation target. */
  root: ViewRoot;
  outlet: AuraOutlet;
  key?: string;
  /** Remove root from DOM and clear its children. */
  destroy(): void;
  /** Remove root from outlet; keep subtree for reattach. */
  detach(): ViewRoot;
  /** Patch content inside `root`. */
  patch(content: ViewContent): void;
};

/** DOM mount slot; executes replace / patch / stage strategies. */
export class AuraOutlet extends AuraDom {
  static is = 'aura-outlet';

  private activeRoot?: ViewRoot;
  private stagedRoot?: ViewRoot;
  private activeKey?: string;

  /** Mount or update view; `null` when `signal` is already aborted. */
  apply(payload: OutletApplyInput, opts: OutletApplyOptions = {}): ViewHandle | null {
    const { strategy = 'replace', key, signal } = opts;

    if (signal?.aborted) {
      return null;
    }

    switch (strategy) {
      case 'patch':
        return this.applyPatch(payload, key, signal);
      case 'stage':
        return this.applyStage(payload);
      case 'replace':
      default:
        return this.applyReplace(this.asRoot(payload), key);
    }
  }

  /** After transition: drop other staged roots, keep `root`. */
  commitStage(root: ViewRoot): void {
    for (const child of [...this.children]) {
      if (child !== root) child.remove();
    }
    this.activeRoot = root;
    this.stagedRoot = undefined;
    this.activeKey = root.dataset.auraKey ?? this.activeKey;
  }

  /** Nested `<aura-outlet>` inside a layout view root. */
  findNestedOutlet(root: ParentNode = this.activeRoot ?? this): AuraOutlet | null {
    return root.querySelector(AuraOutlet.is) as AuraOutlet | null;
  }

  private applyReplace(root: ViewRoot, key?: string): ViewHandle {
    this.stagedRoot = undefined;
    this.replaceChildren(root);
    this.activeRoot = root;
    this.activeKey = key;
    if (key) root.dataset.auraKey = key;
    return this.makeHandle(root);
  }

  private applyPatch(payload: OutletApplyInput, key?: string, signal?: AbortSignal): ViewHandle {
    const content = payload as ViewContent;

    if (!this.activeRoot) {
      const root = this.createViewRoot();
      this.updateInner(root, content, { key, signal });
      return this.applyReplace(root, key);
    }

    this.updateInner(this.activeRoot, content, { key, signal });
    if (key) this.activeKey = key;
    return this.makeHandle(this.activeRoot);
  }

  private applyStage(payload: OutletApplyInput): ViewHandle {
    const root = this.asRoot(payload);
    if (!this.activeRoot) {
      return this.applyReplace(root);
    }

    if (this.stagedRoot) this.stagedRoot.remove();
    this.stagedRoot = root;
    this.appendChild(root);
    return this.makeHandle(root);
  }

  private asRoot(payload: OutletApplyInput): ViewRoot {
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
    return {
      root,
      outlet: this,
      key: this.activeKey,
      destroy: () => {
        root.replaceChildren();
        root.remove();
        if (this.activeRoot === root) {
          this.activeRoot = undefined;
          this.activeKey = undefined;
        }
        if (this.stagedRoot === root) this.stagedRoot = undefined;
      },
      detach: () => {
        root.remove();
        if (this.activeRoot === root) this.activeRoot = undefined;
        if (this.stagedRoot === root) this.stagedRoot = undefined;
        return root;
      },
      patch: (content: ViewContent) => {
        this.updateInner(root, content, { key: this.activeKey });
      },
    };
  }
}
