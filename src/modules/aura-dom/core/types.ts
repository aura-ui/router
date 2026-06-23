/** Content passed to inner DOM updates. */
export type PatchSource = Node | DocumentFragment | string;

/** Options for {@link updateInner}. */
export type DomUpdateOptions = {
  /** View identity; stored on container as `data-aura-key`. */
  key?: string;
  signal?: AbortSignal;
};

/** Result of {@link updateInner}. */
export type DomUpdateResult = {
  /** `true` when nodes were reused (morph); `false` when children were fully replaced. */
  incremental: boolean;
};
