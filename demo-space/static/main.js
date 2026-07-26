// node_modules/@auraui/router/dist/modules/aura-dom/core/patch.js
function replaceInner(container, next) {
  container.replaceChildren();
  if (typeof next === "string") {
    const tpl = document.createElement("template");
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
function updateInner(container, next, opts) {
  if (opts?.signal?.aborted) return { incremental: false };
  replaceInner(container, next);
  return { incremental: false };
}

// node_modules/@auraui/router/dist/modules/aura-dom/core/aura-dom.js
var AuraDom = class extends HTMLElement {
  /** Replace `container` children; the container node is kept. */
  replaceInner(container, next) {
    replaceInner(container, next);
  }
  /** Update `container` children (v1: replace-inner). */
  updateInner(container, next, opts) {
    return updateInner(container, next, opts);
  }
};

// node_modules/@auraui/router/dist/modules/aura-outlet/core/aura-outlet.js
var AURA_VIEW_ROOT_ATTR = "data-aura-view-root";
var AuraOutlet = class AuraOutlet2 extends AuraDom {
  static {
    this.is = "aura-outlet";
  }
  /** Clears internal refs; DOM children stay on the element. */
  disconnectedCallback() {
    this.stagedRoot = void 0;
    this.activeRoot = void 0;
  }
  apply(payload, opts = {}) {
    const { key, signal } = opts;
    const strategy = opts.strategy ?? "replace";
    if (signal?.aborted) return null;
    switch (strategy) {
      case "patch":
        return this.applyPatch(payload, key, signal);
      case "stage":
        return this.applyStage(payload, key);
      default:
        return this.applyReplace(this.asRoot(payload), key);
    }
  }
  /** Finish transition: remove sibling roots, keep `root` (must be a direct child). */
  commitStage(root) {
    if (root.parentElement !== this) throw new DOMException("commitStage root must be a direct child of this outlet", "InvalidStateError");
    for (const child of [...this.children]) if (child !== root) child.remove();
    this.activeRoot = root;
    this.stagedRoot = void 0;
  }
  /** Abort transition: remove staged root, keep active view. */
  cancelStage() {
    if (!this.stagedRoot) return;
    this.stagedRoot.remove();
    this.stagedRoot = void 0;
    this.activeRoot && (this.activeRoot.hidden = false);
  }
  /** Hide the committed active root (e.g. while a loading skeleton is staged). */
  hideActive() {
    if (this.activeRoot) this.activeRoot.hidden = true;
  }
  /** First nested `<aura-outlet>` in staged, active, or this element. */
  findNestedOutlet(root = this.stagedRoot ?? this.activeRoot ?? this) {
    return root.querySelector(AuraOutlet2.is);
  }
  /** Replace outlet content with a single view root. */
  applyReplace(root, key) {
    this.stagedRoot = void 0;
    this.replaceChildren(root);
    this.activeRoot = root;
    this.applyKey(root, key);
    return this.makeHandle(root);
  }
  /** Update inner content of the active root (or bootstrap one). */
  applyPatch(content, key, signal) {
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
  applyStage(payload, key) {
    const root = this.asRoot(payload);
    if (!this.activeRoot) return this.applyReplace(root, key);
    if (this.stagedRoot) this.stagedRoot.remove();
    this.applyKey(root, key);
    this.stagedRoot = root;
    this.appendChild(root);
    return this.makeHandle(root);
  }
  /** Resolve mount payload to a view root (wrap content when needed). */
  asRoot(payload) {
    if (payload instanceof HTMLElement) {
      if (!payload.hasAttribute("data-aura-view-root")) payload.setAttribute(AURA_VIEW_ROOT_ATTR, "");
      return payload;
    }
    const root = this.createViewRoot();
    this.replaceInner(root, payload);
    return root;
  }
  createViewRoot() {
    const root = document.createElement("div");
    root.setAttribute(AURA_VIEW_ROOT_ATTR, "");
    return root;
  }
  makeHandle(viewRoot) {
    let destroyed = false;
    let detached = false;
    return {
      viewRoot,
      mountOutlet: this,
      key: viewRoot.dataset.auraKey || void 0,
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
      }
    };
  }
  applyKey(root, key) {
    if (key) this.setRootKey(root, key);
    else delete root.dataset.auraKey;
  }
  setRootKey(root, key) {
    root.dataset.auraKey = key;
  }
  /** Sync refs after handle teardown; promotes staged root if active was removed mid-transition. */
  syncStateAfterRootRemoved(root) {
    if (this.stagedRoot === root) {
      this.stagedRoot = void 0;
      return;
    }
    if (this.activeRoot !== root) return;
    this.activeRoot = void 0;
    if (this.stagedRoot) {
      this.activeRoot = this.stagedRoot;
      this.stagedRoot = void 0;
    }
  }
};

// node_modules/@auraui/router/dist/modules/aura-cache/core/aura-swr-cache.js
var AuraSwrCache = class {
  /**
  * @param options - Cache limits, SWR timings, invalidation defaults, and removal callback.
  */
  constructor(options = {}) {
    this.map = /* @__PURE__ */ new Map();
    this.head = null;
    this.tail = null;
    this.sweepTimer = null;
    if (options.max !== void 0 && options.max < 1) throw new Error(`AuraSwrCache: max must be >= 1, got ${options.max}`);
    assertTiming("staleTime", options.staleTime);
    assertTiming("gcTime", options.gcTime);
    if (options.gcSweepInterval !== void 0 && options.gcSweepInterval !== false) assertPositiveInterval("gcSweepInterval", options.gcSweepInterval);
    this.max = options.max;
    this.staleTimeMs = options.staleTime;
    this.gcTimeMs = options.gcTime ?? (options.staleTime !== void 0 ? 3e5 : void 0);
    if (options.gcSweepInterval !== void 0 && options.gcSweepInterval !== false && !isFiniteGcTime(this.gcTimeMs)) throw new Error("AuraSwrCache: gcSweepInterval requires a finite gcTime (Infinity disables TTL removal)");
    this.gcSweepIntervalMs = resolveGcSweepInterval(this.gcTimeMs, options.gcSweepInterval);
    this.defaultInvalidatePolicy = options.invalidatePolicy ?? "stale";
    this.onRemove = options.onRemove;
  }
  /**
  * Returns a cached value when present (fresh or stale) and promotes LRU order.
  * GC-expired entries are removed on access.
  *
  * Does not report whether the entry is stale. In SWR mode (`staleTime`), use
  * {@link AuraSwrCache.lookup} to decide whether to revalidate.
  *
  * @param key - Cache key.
  * @returns The stored value, or `undefined` if missing or GC-expired.
  */
  get(key) {
    const node = this.map.get(key);
    if (!node) return void 0;
    if (this.removeIfExpired(node, Date.now())) return;
    if (node !== this.tail) this.moveToEnd(node);
    return node.value;
  }
  /**
  * Reads an entry with `fresh` / `stale` / `missing` status.
  *
  * In SWR mode (`staleTime`), age past `staleTime` yields `stale` while the entry
  * remains readable. GC-expired entries are removed on access (same as {@link get}).
  * Stale-but-readable entries are not removed by this method.
  *
  * @param key - Cache key.
  * @param touch - When `true`, promote the entry in the LRU list. Default `false`.
  * @returns Lookup result with `fresh`, `stale`, or `missing` status.
  */
  lookup(key, touch = false) {
    const node = this.map.get(key);
    if (!node) return { status: "missing" };
    const now = Date.now();
    if (this.removeIfExpired(node, now)) return { status: "missing" };
    if (touch && node !== this.tail) this.moveToEnd(node);
    return {
      status: this.readStatus(node, now),
      value: node.value
    };
  }
  /**
  * Stores a value under `key`, clearing stale flag and refreshing `storedAt`.
  *
  * Updates an existing entry in place without LRU trim. Overwriting invokes
  * `onRemove` for the previous value when it differs, before the new value is stored.
  * New entries may remove the least recently used key when `max` is exceeded.
  *
  * @param key - Cache key.
  * @param value - Value to store.
  * @param options - Per-entry timings. When passed, replaces both overrides
  *   (`undefined` fields fall back to store defaults). Omitted → keep previous overrides.
  */
  set(key, value, options) {
    if (options) {
      assertTiming("gcTime", options.gcTime);
      assertTiming("staleTime", options.staleTime);
    }
    const existingNode = this.map.get(key);
    const now = Date.now();
    if (existingNode) {
      const previous = existingNode.value;
      if (previous !== value) this.onRemove?.(key, previous);
      existingNode.value = value;
      if (options) {
        existingNode.gcTime = options.gcTime;
        existingNode.staleTime = options.staleTime;
      }
      existingNode.stale = false;
      existingNode.storedAt = now;
      if (existingNode !== this.tail) this.moveToEnd(existingNode);
      this.ensureSweepRunning();
      return;
    }
    const newNode = {
      key,
      value,
      storedAt: now,
      gcTime: options?.gcTime,
      staleTime: options?.staleTime,
      stale: false,
      prev: null,
      next: null
    };
    this.addToEnd(newNode);
    this.map.set(key, newNode);
    if (this.max !== void 0 && this.map.size > this.max) this.removeLruHead();
    this.ensureSweepRunning();
  }
  /**
  * Returns a cached value without promoting LRU order.
  * GC-expired entries are removed on access (same as {@link has}), with `onRemove` when configured.
  *
  * @param key - Cache key.
  * @returns The stored value, or `undefined` if missing or GC-expired.
  */
  peek(key) {
    const node = this.map.get(key);
    if (!node) return void 0;
    if (this.removeIfExpired(node, Date.now())) return;
    return node.value;
  }
  /**
  * Returns whether a readable, non-GC-expired entry exists.
  *
  * Does not promote LRU order. GC-expired entries are removed and return `false`.
  *
  * @param key - Cache key.
  * @returns `true` if the entry exists and is readable.
  */
  has(key) {
    const node = this.map.get(key);
    if (!node) return false;
    return !this.removeIfExpired(node, Date.now());
  }
  /**
  * Returns whether an entry is stale (by age or manual invalidation) but still readable.
  *
  * @param key - Cache key.
  * @returns `true` if stale and readable; `false` if missing, fresh, or GC-expired.
  */
  isStale(key) {
    const node = this.map.get(key);
    if (!node) return false;
    const now = Date.now();
    if (this.removeIfExpired(node, now)) return false;
    return this.readStatus(node, now) === "stale";
  }
  /**
  * Removes all GC-expired entries (store default and per-entry `gcTime`).
  *
  * @returns Number of removed entries.
  */
  purgeExpired() {
    return this.sweepExpired();
  }
  /**
  * Marks an entry outdated or removes it. Use after mutations or route changes.
  * Does not promote LRU order.
  *
  * @param key - Cache key.
  * @param policy - `'stale'` keeps value for SWR reads; `'remove'` deletes immediately.
  *   Defaults to `invalidatePolicy`.
  * @returns `true` if an entry was affected.
  */
  invalidate(key, policy = this.defaultInvalidatePolicy) {
    const node = this.map.get(key);
    if (!node) return false;
    if (policy === "remove") this.removeNode(node);
    else node.stale = true;
    return true;
  }
  /**
  * Marks matching entries outdated or removes them. See {@link AuraSwrCache.invalidate}.
  *
  * @param predicate - Key filter.
  * @param policy - Defaults to `invalidatePolicy`.
  * @returns Number of affected entries.
  */
  invalidateMatch(predicate, policy = this.defaultInvalidatePolicy) {
    if (policy === "remove") return this.invalidateMatchRemove(predicate);
    let count = 0;
    for (const [key, node] of this.map) if (predicate(key)) {
      node.stale = true;
      count++;
    }
    return count;
  }
  /**
  * Marks every entry outdated or removes all. See {@link AuraSwrCache.invalidate}.
  *
  * @param policy - Defaults to `invalidatePolicy`.
  * @returns Number of affected entries.
  */
  invalidateAll(policy = this.defaultInvalidatePolicy) {
    if (policy === "stale") {
      let count = 0;
      for (const node of this.map.values()) {
        node.stale = true;
        count++;
      }
      return count;
    }
    return this.invalidateMatch(() => true, policy);
  }
  /**
  * Removes the entry and returns the value (keep-alive checkout).
  *
  * Live entry: no `onRemove` — value can be reattached. GC-expired: `onRemove` runs,
  * returns `undefined`. Missing key: `undefined`.
  *
  * @param key - Cache key.
  * @returns The stored value, or `undefined` if missing or GC-expired.
  */
  extract(key) {
    const node = this.map.get(key);
    if (!node) return void 0;
    if (this.removeIfExpired(node, Date.now())) return;
    const value = node.value;
    this.unlinkNode(node);
    return value;
  }
  /**
  * Removes an entry and invokes `onRemove` when configured.
  *
  * @param key - Cache key.
  * @returns `true` if an entry was removed.
  */
  delete(key) {
    const node = this.map.get(key);
    if (!node) return false;
    this.removeNode(node);
    return true;
  }
  /**
  * Removes all entries, stops the background sweep, and invokes `onRemove` for each when configured.
  * The store can be reused; the next `set()` restarts the background sweep when configured.
  */
  clear() {
    this.stopSweep();
    const onRemove = this.onRemove;
    if (onRemove) {
      let current = this.head;
      while (current) {
        const next = current.next;
        onRemove(current.key, current.value);
        current = next;
      }
    }
    this.map.clear();
    this.head = null;
    this.tail = null;
  }
  /**
  * Releases the store. Same as {@link AuraSwrCache.clear}.
  */
  destroy() {
    this.clear();
  }
  /**
  * Number of entries in the map (includes stale and GC-expired until removed elsewhere).
  * Does not run GC or promote LRU.
  *
  * @returns Current `map` size. Use {@link AuraSwrCache.purgeExpired} or read accessors
  *   first when you need a count of readable entries only.
  */
  get size() {
    return this.map.size;
  }
  /**
  * Snapshot of map keys in insertion order (not LRU order). Does not promote LRU or run GC.
  * May include GC-expired keys until removed by access, {@link AuraSwrCache.purgeExpired},
  * or background sweep.
  *
  * @returns All keys currently in the map.
  */
  keys() {
    return Array.from(this.map.keys());
  }
  /**
  * Removes the entry when it exceeded `gcTime`.
  *
  * @param node - Entry to check.
  * @param now - Current timestamp.
  * @returns `true` if the entry was removed.
  */
  removeIfExpired(node, now) {
    const gcTimeMs = node.gcTime ?? this.gcTimeMs;
    if (gcTimeMs === void 0) return false;
    if (now - node.storedAt <= gcTimeMs) return false;
    this.removeNode(node);
    return true;
  }
  /**
  * Resolves SWR status from entry age and manual stale flag.
  *
  * @param node - Entry to read.
  * @param now - Current timestamp.
  * @returns `'fresh'` or `'stale'`.
  */
  readStatus(node, now) {
    if (node.stale) return "stale";
    const staleTime = node.staleTime ?? this.staleTimeMs;
    if (staleTime === void 0) return "fresh";
    if (staleTime === Infinity) return "fresh";
    return now - node.storedAt > staleTime ? "stale" : "fresh";
  }
  /**
  * Walks the LRU list and removes all GC-expired entries.
  *
  * @returns Number of removed entries.
  */
  sweepExpired() {
    const now = Date.now();
    let count = 0;
    let current = this.head;
    while (current) {
      const next = current.next;
      if (this.removeIfExpired(current, now)) count++;
      current = next;
    }
    return count;
  }
  /** Starts background sweep when `gcSweepInterval` is configured and the store is non-empty. */
  ensureSweepRunning() {
    if (this.gcSweepIntervalMs === null || this.map.size === 0) return;
    this.startSweep();
  }
  /** Schedules periodic GC sweep via `setInterval`. */
  startSweep() {
    if (this.gcSweepIntervalMs === null || this.sweepTimer !== null) return;
    if (typeof setInterval === "undefined") return;
    this.sweepTimer = setInterval(() => {
      this.sweepExpired();
    }, this.gcSweepIntervalMs);
  }
  /** Clears the background sweep timer. */
  stopSweep() {
    if (this.sweepTimer === null) return;
    clearInterval(this.sweepTimer);
    this.sweepTimer = null;
  }
  /**
  * Removes entries matching `predicate` and invokes `onRemove` for each.
  *
  * @param predicate - Key filter.
  * @returns Number of removed entries.
  */
  invalidateMatchRemove(predicate) {
    let count = 0;
    let current = this.head;
    while (current) {
      const next = current.next;
      if (predicate(current.key)) {
        this.removeNode(current);
        count++;
      }
      current = next;
    }
    return count;
  }
  /**
  * Detaches `node` from its current position and appends it to the LRU tail.
  *
  * @param node - Entry to promote.
  */
  moveToEnd(node) {
    if (node === this.tail) return;
    const prev = node.prev;
    const next = node.next;
    if (prev) prev.next = next;
    if (next) next.prev = prev;
    if (node === this.head) this.head = next;
    this.addToEnd(node);
  }
  /**
  * Appends `node` to the LRU tail.
  *
  * @param node - Entry to append. `prev`/`next` are rewritten.
  */
  addToEnd(node) {
    node.next = null;
    if (this.tail) {
      this.tail.next = node;
      node.prev = this.tail;
      this.tail = node;
    } else {
      node.prev = null;
      this.head = node;
      this.tail = node;
    }
  }
  /**
  * Detaches `node` from the map and LRU list without invoking `onRemove`.
  * Stops background sweep when the store becomes empty.
  *
  * @param node - Entry to unlink.
  */
  unlinkNode(node) {
    const { key } = node;
    const prev = node.prev;
    const next = node.next;
    if (prev) prev.next = next;
    if (next) next.prev = prev;
    if (node === this.head) this.head = next;
    if (node === this.tail) this.tail = prev;
    this.map.delete(key);
    if (this.map.size === 0) this.stopSweep();
  }
  /** Unlinks `node` and invokes `onRemove` when configured. */
  removeNode(node) {
    const { key, value } = node;
    this.unlinkNode(node);
    const onRemove = this.onRemove;
    if (onRemove) onRemove(key, value);
  }
  /** Removes the least recently used entry (LRU head). */
  removeLruHead() {
    if (!this.head) return;
    this.removeNode(this.head);
  }
};
function resolveGcSweepInterval(gcTime, gcSweepInterval) {
  if (gcSweepInterval === false) return null;
  if (!isFiniteGcTime(gcTime)) return null;
  if (gcSweepInterval !== void 0) return gcSweepInterval;
  return Math.min(Math.max(gcTime / 2, 5e3), 6e4);
}
function isFiniteGcTime(gcTime) {
  return gcTime !== void 0 && Number.isFinite(gcTime);
}
function assertTiming(name, value) {
  if (value === void 0) return;
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) throw new Error(`AuraSwrCache: ${name} must be >= 0 or Infinity, got ${value}`);
}
function assertPositiveInterval(name, value) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`AuraSwrCache: ${name} must be a positive number, got ${value}`);
}

// node_modules/@auraui/router/dist/modules/aura-route/core/view/dom-cache.js
function domCacheKey(source, fallbackPath) {
  const base = source?.pathname ?? fallbackPath;
  const query = source?.query;
  if (!query || Object.keys(query).length === 0) return base;
  return `${base}|${Object.keys(query).sort().map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(query[key])}`).join("&")}`;
}
var DEFAULT_CACHE_OPTIONS = {
  max: 10,
  gcTime: Infinity,
  gcSweepInterval: false,
  onRemove: (_key, root) => destroyViewRoot(root)
};
var RouteDomCache = class RouteDomCache2 {
  static configure(options = {}) {
    RouteDomCache2.store?.destroy();
    RouteDomCache2.store = new AuraSwrCache({
      ...DEFAULT_CACHE_OPTIONS,
      ...options,
      onRemove: options.onRemove ?? DEFAULT_CACHE_OPTIONS.onRemove
    });
  }
  /** Read-only probe for dom-cache fast path — no LRU promote, no checkout. */
  has(key) {
    return RouteDomCache2.storeOf().has(key);
  }
  extract(key) {
    return RouteDomCache2.storeOf().extract(key);
  }
  put(key, root) {
    RouteDomCache2.storeOf().set(key, root);
  }
  static storeOf() {
    if (!RouteDomCache2.store) RouteDomCache2.configure();
    return RouteDomCache2.store;
  }
};
function destroyViewRoot(root) {
  root.replaceChildren();
  root.remove();
}
var defaultDomCache = new RouteDomCache();

// node_modules/@auraui/router/dist/modules/aura-utils/misc/dom.js
var getTemplate = (id) => {
  const template = document.getElementById(id);
  if (!template) throw new Error(`Template with id "${id}" not found`);
  if (!(template instanceof HTMLTemplateElement)) throw new Error(`Element with id "${id}" is not a template`);
  return template?.content.cloneNode(true);
};
function extractHtmlFragment(html, selector) {
  return new DOMParser().parseFromString(html, "text/html").querySelector(selector)?.outerHTML ?? null;
}
function applyHtmlExtract(html, extract, href) {
  if (!extract) return html;
  const fragment = extractHtmlFragment(html, extract);
  if (fragment != null) return fragment;
  console.warn(`Nothing found for extract selector "${extract}" \u2014 using full HTML. Page \u2014 ${href}`);
  return html;
}

// node_modules/@auraui/router/dist/modules/aura-utils/misc/events.js
var dispatchCustomEvent = (el, eventName, eventInit) => {
  if (!eventName || !eventName.trim()) return true;
  const init = Object.assign({
    bubbles: true,
    composed: true,
    cancelable: true
  }, eventInit || {});
  return el.dispatchEvent(new CustomEvent(eventName, init));
};

// node_modules/@auraui/router/dist/modules/aura-utils/misc/format.js
var toKebabCase = (str) => {
  return str.replace(/([a-z])([A-Z])/g, "$1-$2").replace(/[\s_]+/g, "-").toLowerCase();
};
var parseString = (val) => String(val ?? "");
function parseNullableString(raw) {
  if (raw === null) return null;
  return raw.trim();
}
function parseCommaSeparated(val) {
  if (val === null) return null;
  const trimmed = val.trim();
  if (!trimmed) return null;
  return trimmed.split(",").map((s) => s.trim()).filter(Boolean);
}
function parseNumber(str) {
  const num = +(str || NaN);
  return isNaN(num) ? null : num;
}

// node_modules/@auraui/router/dist/modules/aura-utils/async/abort-scope.js
var AbortScope = class {
  constructor() {
    this.local = new AbortController();
  }
  begin(parent) {
    this.cancel();
    this.local = new AbortController();
    this.parent = parent;
    return this.signal;
  }
  get signal() {
    const { signal } = this.local;
    return this.parent ? AbortSignal.any([this.parent, signal]) : signal;
  }
  get aborted() {
    return this.signal.aborted;
  }
  cancel() {
    this.local.abort();
  }
};

// node_modules/@auraui/router/dist/modules/aura-route/core/view/outlet-adapter.js
var EMPTY_MOUNT = {
  strategy: "replace",
  activeHandle: null,
  stageOutgoingHandle: null,
  pendingOutgoingRoot: null,
  nestedOutlet: null
};
function toMountSlice(snapshot) {
  return {
    activeHandle: snapshot.activeHandle,
    nestedOutlet: snapshot.nestedOutlet,
    appliedStrategy: snapshot.strategy
  };
}
function mergeMount(snapshot, slice, detachedOutgoing = null) {
  const strategy = slice.appliedStrategy;
  if (strategy === "stage") {
    if (snapshot.pendingOutgoingRoot) destroyViewRoot(snapshot.pendingOutgoingRoot);
    return {
      strategy,
      activeHandle: slice.activeHandle,
      stageOutgoingHandle: snapshot.activeHandle,
      pendingOutgoingRoot: null,
      nestedOutlet: slice.nestedOutlet
    };
  }
  return {
    strategy: "replace",
    activeHandle: slice.activeHandle,
    stageOutgoingHandle: null,
    pendingOutgoingRoot: detachedOutgoing,
    nestedOutlet: slice.nestedOutlet
  };
}
function hasActiveMount(slice, isLayoutRoute) {
  return !!slice.activeHandle && (!isLayoutRoute || !!slice.nestedOutlet);
}
function warnMissingLayoutOutlet(route, viewKind, nestedOutlet) {
  if (viewKind !== "layout" || nestedOutlet) return;
  console.warn(`AuraRoute layout "${route.layout}" (path: ${route.path}) has no <aura-outlet>`);
}
function applyMountToSnapshot(snapshot, ctx, payload) {
  if (ctx.signal?.aborted) return null;
  const outlet = resolveOutlet(ctx);
  const strategy = resolveStageStrategy(ctx, outlet);
  const detachedOutgoing = detachOutgoingBeforeReplace(snapshot, outlet, strategy);
  const slice = applyMount(ctx, outlet, payload, strategy);
  if (!slice?.activeHandle) {
    if (detachedOutgoing) replaceRootInOutlet(outlet, detachedOutgoing);
    return null;
  }
  return mergeMount(snapshot, slice, detachedOutgoing);
}
function unmountHandle(handle, keepDom) {
  if (!handle) return null;
  if (keepDom) return handle.detach();
  handle.destroy();
  return null;
}
function promoteStagedView(snapshot) {
  return discardPendingOutgoing(commitStaged(snapshot));
}
function discardPendingOutgoing(snapshot) {
  if (!snapshot.pendingOutgoingRoot) return snapshot;
  destroyViewRoot(snapshot.pendingOutgoingRoot);
  return {
    ...snapshot,
    pendingOutgoingRoot: null
  };
}
function commitStaged(snapshot) {
  if (snapshot.strategy !== "stage" || !snapshot.activeHandle) return snapshot;
  snapshot.activeHandle.mountOutlet.commitStage(snapshot.activeHandle.viewRoot);
  snapshot.stageOutgoingHandle?.destroy();
  return {
    ...snapshot,
    strategy: "replace",
    stageOutgoingHandle: null
  };
}
function rollbackUncommittedMount(snapshot) {
  return snapshot.strategy === "stage" ? rollbackStaged(snapshot) : rollbackReplace(snapshot);
}
function rollbackStaged(snapshot) {
  if (snapshot.strategy !== "stage" || !snapshot.activeHandle) return snapshot;
  const outgoing = cancelStagedIncoming(snapshot).stageOutgoingHandle;
  return {
    strategy: "replace",
    activeHandle: outgoing,
    stageOutgoingHandle: null,
    pendingOutgoingRoot: null,
    nestedOutlet: outgoing?.findChildOutlet() ?? null
  };
}
function rollbackReplace(snapshot) {
  const outgoing = snapshot.pendingOutgoingRoot;
  if (!outgoing) return snapshot;
  const mountOutlet = snapshot.activeHandle?.mountOutlet;
  snapshot.activeHandle?.destroy();
  if (!mountOutlet) {
    destroyViewRoot(outgoing);
    return {
      ...snapshot,
      activeHandle: null,
      pendingOutgoingRoot: null
    };
  }
  const handle = replaceRootInOutlet(mountOutlet, outgoing);
  if (!handle) {
    destroyViewRoot(outgoing);
    return {
      ...snapshot,
      activeHandle: null,
      pendingOutgoingRoot: null,
      nestedOutlet: null
    };
  }
  return {
    strategy: "replace",
    activeHandle: handle,
    stageOutgoingHandle: null,
    pendingOutgoingRoot: null,
    nestedOutlet: handle.findChildOutlet()
  };
}
function unmountOnLeave(snapshot, keepDom) {
  const cleared = discardPendingOutgoing(snapshot);
  if (cleared.strategy === "stage") {
    const afterCancel = cancelStagedIncoming(cleared);
    return {
      detachedRoot: unmountHandle(afterCancel.stageOutgoingHandle, keepDom),
      snapshot: {
        ...afterCancel,
        activeHandle: null,
        stageOutgoingHandle: null
      }
    };
  }
  return {
    detachedRoot: unmountHandle(cleared.activeHandle, keepDom),
    snapshot: {
      ...cleared,
      activeHandle: null
    }
  };
}
function unmountParamChangeOutgoing(snapshot, keepDom) {
  const cleared = discardPendingOutgoing(snapshot);
  const outgoing = cleared.stageOutgoingHandle;
  if (!outgoing) return {
    snapshot: cleared,
    detachedRoot: null
  };
  return {
    detachedRoot: unmountHandle(outgoing, keepDom),
    snapshot: {
      ...cleared,
      stageOutgoingHandle: null
    }
  };
}
function finalizeLeave(snapshot, keepDom, detachedRoot) {
  return keepDom && detachedRoot ? snapshot : {
    ...snapshot,
    nestedOutlet: null
  };
}
function resolveStageStrategy(ctx, targetOutlet) {
  if (ctx.strategy) return ctx.strategy;
  if (!ctx.useStagedMount) return "replace";
  return targetOutlet.children.length > 0 ? "stage" : "replace";
}
function cancelStagedIncoming(snapshot) {
  if (snapshot.strategy !== "stage" || !snapshot.activeHandle) return snapshot;
  const incoming = snapshot.activeHandle;
  incoming.mountOutlet.cancelStage();
  incoming.destroy();
  return {
    ...snapshot,
    strategy: "replace",
    activeHandle: null
  };
}
function detachOutgoingBeforeReplace(snapshot, targetOutlet, strategy) {
  if (strategy !== "replace") return null;
  const handle = snapshot.activeHandle;
  if (!handle || handle.mountOutlet !== targetOutlet) return null;
  if (snapshot.pendingOutgoingRoot) destroyViewRoot(snapshot.pendingOutgoingRoot);
  return handle.detach();
}
function replaceRootInOutlet(outlet, root) {
  return outlet.apply(root, { strategy: "replace" });
}
function applyMount(ctx, outlet, payload, strategy) {
  const handle = outlet.apply(payload, {
    strategy,
    key: ctx.pattern,
    signal: ctx.signal
  });
  if (!handle) return null;
  return {
    activeHandle: handle,
    nestedOutlet: handle.findChildOutlet(),
    appliedStrategy: strategy
  };
}
function resolveOutlet(ctx) {
  return ctx.mountOutlet ?? ctx.appOutlet;
}

// node_modules/@auraui/router/dist/modules/aura-route/core/view/view-context.js
var ViewContext = class {
  constructor(config, getPassId) {
    this.renderSignal = new AbortScope();
    this.mount = { ...EMPTY_MOUNT };
    this.lastCacheKey = null;
    this.paramChangeRemount = false;
    this.config = config;
    this.getPassId = getPassId;
  }
  get nestedOutlet() {
    return this.mount.nestedOutlet;
  }
  get signal() {
    return this.renderSignal.signal;
  }
};

// node_modules/@auraui/router/dist/modules/aura-utils/misc/sanitize.js
function escapeHtml(value) {
  const len = value.length;
  if (len === 0) return value;
  if (!(value.indexOf("&") !== -1 || value.indexOf("<") !== -1 || value.indexOf(">") !== -1 || value.indexOf('"') !== -1 || value.indexOf("'") !== -1)) return value;
  let result = "";
  let lastIndex = 0;
  for (let i = 0; i < len; i++) {
    const ch = value[i];
    if (ch === "&" || ch === "<" || ch === ">" || ch === '"' || ch === "'") {
      if (lastIndex !== i) result += value.substring(lastIndex, i);
      lastIndex = i + 1;
      switch (ch) {
        case "&":
          result += "&amp;";
          break;
        case "<":
          result += "&lt;";
          break;
        case ">":
          result += "&gt;";
          break;
        case '"':
          result += "&quot;";
          break;
        case "'":
          result += "&#39;";
          break;
      }
    }
  }
  if (lastIndex < len) result += value.substring(lastIndex);
  return result;
}

// node_modules/@auraui/router/dist/modules/aura-route/core/view/view-render-pipeline-phase.js
var ViewRenderPipelinePhase = class {
  constructor(ctx) {
    this.ctx = ctx;
  }
  /** Keep-alive cache hit — returns `ok` when DOM was reattached, `null` to continue. */
  tryCacheRestore(pass) {
    if (!this.ctx.config.route.cache.dom) return null;
    const cachedRoot = this.ctx.config.cache.extract(pass.domCacheKey);
    if (!cachedRoot) return null;
    return this.mountPayload(pass, cachedRoot, pass.viewKind, cachedRoot) ? { status: "ok" } : null;
  }
  /** Active keep-alive view already in outlet — skip fetch/mount. */
  trySkipAlreadyMounted(pass) {
    if (this.ctx.paramChangeRemount) return null;
    if (this.ctx.mount.strategy === "stage") return null;
    const useDomCache = this.ctx.config.route.cache.dom;
    const layout = pass.viewKind === "layout";
    if (useDomCache && hasActiveMount(toMountSlice(this.ctx.mount), layout)) return { status: "ok" };
    return null;
  }
  /** Mount resolved view (from branch resolve or {@link ViewResolverPort}). */
  applyResolvedContent(pass, payload) {
    if (this.isStale(pass)) return;
    if (payload == null) {
      if (pass.viewKind === "view") this.mountPayload(pass, emptyContent(), "view");
      return;
    }
    this.fireContentResolved(pass, payload);
    this.mountPayload(pass, payload, pass.viewKind);
  }
  /** Load content via port, then mount (or empty placeholder for null content routes). */
  async resolveContent(pass) {
    const { data, error } = await this.ctx.config.view.loadView(pass.routeInfo, pass.signal, pass.data !== void 0 ? { data: pass.data } : void 0);
    if (this.isStale(pass)) return;
    if (error?.status === "cancelled") return;
    if (error) throw error;
    this.applyResolvedContent(pass, data ?? null);
  }
  /** Recovery UI after resolve failure — does not rethrow. */
  handleError(pass, error) {
    if (this.isStale(pass)) return { status: "ok" };
    const plugins = this.ctx.config.plugins;
    if (plugins) for (let i = 0; i < plugins.length; i++) plugins[i].onPassError?.(pass, error);
    this.mountPayload(pass, resolveErrorMarkup(this.ctx.config.route, error), "view");
    return {
      status: "error",
      error
    };
  }
  mountPayload(pass, payload, viewKind, cachedRoot) {
    if (this.isStale(pass)) return false;
    const mountCtx = this.buildMountContext(pass);
    const next = applyMountToSnapshot(this.ctx.mount, mountCtx, cachedRoot ?? payload);
    if (!next?.activeHandle) return false;
    this.ctx.mount = next;
    warnMissingLayoutOutlet(this.ctx.config.route, viewKind, next.nestedOutlet);
    const plugins = this.ctx.config.plugins;
    if (plugins) for (let i = 0; i < plugins.length; i++) plugins[i].onMounted?.(pass);
    return true;
  }
  fireContentResolved(pass, payload) {
    const plugins = this.ctx.config.plugins;
    if (!plugins) return;
    for (let i = 0; i < plugins.length; i++) plugins[i].onContentResolved?.(pass, payload);
  }
  isStale(pass) {
    return this.ctx.renderSignal.aborted || this.ctx.getPassId() !== pass.id;
  }
  buildMountContext(pass) {
    const { mountTarget } = this.ctx.config;
    return {
      pattern: pass.routeInfo.pattern,
      appOutlet: mountTarget.appOutlet(),
      mountOutlet: mountTarget.nestedOutlet(pass.routeInfo),
      signal: pass.signal,
      useStagedMount: pass.useStagedMount
    };
  }
};
var EMPTY_CONTENT = "<div>No content to display</div>";
function emptyContent() {
  return EMPTY_CONTENT;
}
function resolveErrorMarkup(route, error) {
  if (route.errorTemplate) try {
    return getTemplate(route.errorTemplate);
  } catch (templateError) {
    console.warn(`Failed to render errorTemplate for route "${route.path}":`, templateError);
  }
  console.error(`Error rendering route (path: ${route.path}):`, error);
  const err = error instanceof Error ? error : null;
  const message = escapeHtml(err?.message ?? "Error loading content");
  const stack = escapeHtml(err?.stack ?? "");
  return `<div class="aura-route-error">
    <h2>Content Loading Error</h2>
    <p>${message}</p>
    ${stack ? `<pre class="error-stack">${stack}</pre>` : ""}
  </div>`;
}

// node_modules/@auraui/router/dist/modules/aura-route/core/view/view-render-pipeline.js
var ViewRenderPipeline = class {
  constructor(ctx) {
    this.ctx = ctx;
    this.phase = new ViewRenderPipelinePhase(ctx);
  }
  /**
  * Branch-atomic sync mount — applies payload as-is.
  */
  syncBranchMount(pass) {
    if (this.ctx.renderSignal.aborted) return "aborted";
    if (pass.preResolvedView === void 0) return {
      status: "error",
      error: /* @__PURE__ */ new Error("syncBranchMount requires preResolvedView on pass")
    };
    try {
      const early = this.tryEarlyExit(pass);
      if (early) return early;
      this.phase.applyResolvedContent(pass, pass.preResolvedView);
      return { status: "ok" };
    } catch (error) {
      return this.phase.handleError(pass, error);
    }
  }
  async resolveAndMount(pass) {
    try {
      const early = this.tryEarlyExit(pass);
      if (early) return early;
      await this.phase.resolveContent(pass);
      return { status: "ok" };
    } catch (error) {
      return this.phase.handleError(pass, error);
    }
  }
  tryEarlyExit(pass) {
    return this.phase.tryCacheRestore(pass) ?? this.phase.trySkipAlreadyMounted(pass);
  }
};

// node_modules/@auraui/router/dist/modules/aura-route/core/view/view-teardown-pipeline.js
function resetViewRootPresentation(root) {
  root.style.removeProperty("opacity");
  root.style.removeProperty("transform");
  root.getAnimations?.().forEach((animation) => animation.cancel());
}
var ViewTeardownPipeline = class {
  constructor(ctx) {
    this.ctx = ctx;
  }
  commitStaged() {
    this.ctx.mount = promoteStagedView(this.ctx.mount);
  }
  /** Roll back uncommitted view mount without post-commit teardown. */
  revertInFlight() {
    this.ctx.mount = rollbackUncommittedMount(this.ctx.mount);
    this.ctx.renderSignal.cancel();
    this.clearViewPresentation();
  }
  /** Detaches or destroys exit view; param remount only clears a lingering outgoing handle. */
  onUnmount(options) {
    this.ctx.renderSignal.cancel();
    const keepDom = this.ctx.config.route.cache.dom;
    const paramChange = this.ctx.paramChangeRemount;
    this.ctx.paramChangeRemount = false;
    const { snapshot, detachedRoot } = paramChange ? unmountParamChangeOutgoing(this.ctx.mount, keepDom) : unmountOnLeave(this.ctx.mount, keepDom);
    this.ctx.mount = finalizeLeave(snapshot, keepDom, detachedRoot);
    if (keepDom && detachedRoot) this.ctx.config.cache.put(options?.domCacheKey ?? this.ctx.lastCacheKey ?? this.ctx.config.route.path, detachedRoot);
  }
  clearViewPresentation() {
    const { activeHandle, stageOutgoingHandle } = this.ctx.mount;
    const roots = [activeHandle?.viewRoot, stageOutgoingHandle?.viewRoot];
    for (let i = 0; i < roots.length; i++) {
      const root = roots[i];
      if (root) resetViewRootPresentation(root);
    }
  }
};

// node_modules/@auraui/router/dist/modules/aura-route/core/view/view-controller.js
var RouteViewController = class {
  constructor(config, getPassId) {
    this.ctx = new ViewContext(config, getPassId);
    this.renderPipeline = new ViewRenderPipeline(this.ctx);
    this.teardownPipeline = new ViewTeardownPipeline(this.ctx);
  }
  get nestedOutlet() {
    return this.ctx.nestedOutlet;
  }
  get signal() {
    return this.ctx.signal;
  }
  /**
  * Resolves and mounts route content (or restores a keep-alive view).
  * Returns `{ status: 'error' }` after mounting recovery UI — does not rethrow.
  */
  async resolveAndMountView(routeInfo, options) {
    const pass = this.beginPass(routeInfo, options);
    this.ctx.lastCacheKey = pass.domCacheKey;
    return this.renderPipeline.resolveAndMount(pass);
  }
  /**
  * Sync mount with a pre-resolved payload — used by branch-atomic apply.
  * Parent→child calls must stay in one task (no `await` between routes).
  */
  mountResolvedView(routeInfo, options) {
    if (options.parentSignal?.aborted) return "aborted";
    const pass = this.beginPass(routeInfo, options, options.preResolvedView);
    this.ctx.lastCacheKey = pass.domCacheKey;
    return this.renderPipeline.syncBranchMount(pass);
  }
  /**
  * Mount `loading-template` as pending incoming (`stage`) — committed view stays active.
  * Cancel → {@link AuraOutlet.cancelStage}; success → real mount replaces the staged skeleton.
  */
  mountLoadingTemplate(routeInfo, payload) {
    const pass = {
      ...this.beginPass(routeInfo, void 0, payload),
      viewKind: "view",
      useStagedMount: true
    };
    this.ctx.lastCacheKey = pass.domCacheKey;
    const result = this.renderPipeline.syncBranchMount(pass);
    if (result !== "aborted" && result.status === "ok" && this.ctx.mount.strategy === "stage") this.ctx.mount.activeHandle?.mountOutlet.hideActive();
    return result;
  }
  beginPass(routeInfo, options, preResolvedView) {
    this.ctx.paramChangeRemount = options?.paramChangeRemount === true;
    const route = this.ctx.config.route;
    return {
      id: this.ctx.getPassId(),
      routeInfo,
      signal: this.ctx.renderSignal.begin(options?.parentSignal),
      domCacheKey: domCacheKey(routeInfo, route.path),
      viewKind: route.hasLayout ? "layout" : "view",
      useStagedMount: route.transition.order !== null || this.ctx.paramChangeRemount && route.cache.dom,
      ...options?.data !== void 0 && { data: options.data },
      ...preResolvedView !== void 0 && { preResolvedView }
    };
  }
  commitStagedView() {
    this.teardownPipeline.commitStaged();
  }
  onUnmount(options) {
    this.teardownPipeline.onUnmount(options);
  }
  cancel() {
    this.ctx.renderSignal.cancel();
  }
  revertInFlightView() {
    this.teardownPipeline.revertInFlight();
  }
};

// node_modules/@auraui/router/dist/modules/aura-utils/decorators/attr.js
var defaultParser = parseString;
var cachesByEl = /* @__PURE__ */ new WeakMap();
function cacheOf(el, create = false) {
  let map = cachesByEl.get(el);
  if (!map) {
    if (!create) return;
    map = /* @__PURE__ */ new Map();
    cachesByEl.set(el, map);
  }
  return map;
}
var getInherited = (el, name) => el.parentElement?.closest(`[${name}]`)?.getAttribute(name) ?? null;
var attr = (config = {}) => {
  return (proto, propName) => {
    const name = (config.dataAttr ? "data-" : "") + toKebabCase(config.name || propName);
    const inheritName = typeof config.inherit === "string" ? config.inherit : name;
    const inherit = !!config.inherit;
    const hasDefault = "defaultValue" in config;
    const parser = config.parser || defaultParser;
    const read = (el) => {
      let raw;
      if (!inherit) raw = el.getAttribute(name);
      else if (el.hasAttribute(name)) raw = el.getAttribute(name);
      else raw = getInherited(el, inheritName);
      return parser(raw === null && hasDefault ? config.defaultValue : raw);
    };
    const write = (el, val) => {
      val == null ? el.removeAttribute(name) : el.setAttribute(name, String(val));
    };
    if (config.cached) {
      let get2 = function() {
        let map = cachesByEl.get(this);
        if (map?.has(propName)) return map.get(propName);
        const val = read(this);
        if (!map) {
          map = /* @__PURE__ */ new Map();
          cachesByEl.set(this, map);
        }
        map.set(propName, val);
        return val;
      }, set2 = function(val) {
        write(this, val);
        cacheOf(this, true).set(propName, read(this));
      };
      Object.defineProperty(proto, propName, config.readonly ? { get: get2 } : {
        get: get2,
        set: set2
      });
      return;
    }
    function get() {
      return read(this);
    }
    function set(val) {
      write(this, val);
    }
    Object.defineProperty(proto, propName, config.readonly ? { get } : {
      get,
      set
    });
  };
};
function clearAttr(target, prop) {
  if (Array.isArray(prop)) return prop.forEach((p) => attr.clear(target, p));
  if (typeof target === "function") return;
  const el = target;
  if (prop === void 0) {
    cachesByEl.delete(el);
    return;
  }
  cacheOf(el)?.delete(String(prop));
}
attr.clear = clearAttr;

// node_modules/@auraui/router/dist/modules/aura-utils/decorators/route-attr.js
var routeAttr = (config = {}) => attr({
  inherit: true,
  cached: true,
  readonly: true,
  ...config
});
routeAttr.clear = attr.clear;

// node_modules/@auraui/router/dist/modules/aura-utils/misc/utils.js
function getPropertyDescriptor(o, prop) {
  let proto = o;
  while (proto) {
    const desc = Object.getOwnPropertyDescriptor(proto, prop);
    if (desc) return desc;
    proto = Object.getPrototypeOf(proto);
  }
}

// node_modules/@auraui/router/dist/modules/aura-utils/misc/memoize.js
function defaultArgsToHashFn(...args) {
  if (args.length === 0) return null;
  if (args.length > 1) return;
  const v = args[0];
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
}
function memoizeFn(fn, hashFn = defaultArgsToHashFn) {
  const cache = /* @__PURE__ */ new Map();
  function memo(...args) {
    const key = hashFn(...args);
    if (typeof key !== "string" && key !== null) {
      console.warn(`[Aura] memoize("${fn.name}"): arguments could not be hashed; result not cached.`);
      return fn.apply(this, args);
    }
    let value = cache.get(key);
    if (value === void 0 && !cache.has(key)) {
      value = fn.apply(this, args);
      cache.set(key, value);
    }
    return value;
  }
  memo.cache = cache;
  memo.clear = () => cache.clear();
  memo.has = (...args) => {
    const key = hashFn(...args);
    return key !== void 0 && cache.has(key);
  };
  return memo;
}

// node_modules/@auraui/router/dist/modules/aura-utils/decorators/memoize.js
function memoize(hashFn = defaultArgsToHashFn) {
  return function(target, prop, descriptor) {
    if (!descriptor || typeof (descriptor.value || descriptor.get) !== "function") throw new TypeError("@memoize can only be applied to getters and class methods");
    if (typeof target !== "function") {
      typeof descriptor.get === "function" && (descriptor.get = memoizeInstanceGetter(descriptor.get, prop));
      typeof descriptor.value === "function" && (descriptor.value = memoizeInstanceMethod(descriptor.value, prop, hashFn));
    } else {
      typeof descriptor.get === "function" && (descriptor.get = memoizeFn(descriptor.get));
      typeof descriptor.value === "function" && (descriptor.value = memoizeFn(descriptor.value, hashFn));
    }
    return descriptor;
  };
}
function memoizeInstanceGetter(getter, prop) {
  return function() {
    const value = getter.call(this);
    Object.defineProperty(this, prop, {
      value,
      writable: true,
      configurable: true
    });
    return value;
  };
}
function memoizeInstanceMethod(method, prop, hashFn) {
  return function(...args) {
    const memo = memoizeFn(method, hashFn);
    this[prop] = memo;
    return memo.apply(this, args);
  };
}
function clearMemo(target, property) {
  if (Array.isArray(property)) return property.forEach((prop) => memoize.clear(target, prop));
  const desc = getPropertyDescriptor(target, property);
  if (!desc) return;
  if (typeof desc.get === "function" && typeof desc.get.clear === "function") return desc.get.clear();
  if (typeof desc.value === "function" && typeof desc.value.clear === "function") return desc.value.clear();
  if (Object.hasOwnProperty.call(target, property)) delete target[property];
}
memoize.clear = clearMemo;
function hasMemo(target, property, ...params) {
  const desc = getPropertyDescriptor(target, property);
  if (!desc) return false;
  if (typeof desc.get === "function" && typeof desc.get.has === "function") return desc.get.has(...params);
  if (typeof desc.value === "function" && typeof desc.value.has === "function") return desc.value.has(...params);
  return Object.hasOwnProperty.call(target, property);
}
memoize.has = hasMemo;

// node_modules/@auraui/router/dist/modules/aura-route/core/attr/off-keyword.js
var OFF_KEYWORDS = [
  "none",
  "off",
  "false"
];
function isOffKeyword(raw) {
  const normalized = raw.trim().toLowerCase();
  return OFF_KEYWORDS.includes(normalized);
}

// node_modules/@auraui/router/dist/modules/aura-route/core/attr/cache-attr-parser.js
var NO_CACHE = {
  dom: false,
  view: false,
  data: false
};
var DEFAULT_CACHE = {
  dom: false,
  view: true,
  data: true
};
var DOM_CACHE = {
  dom: true,
  view: true,
  data: false
};
var ALL_CACHE = {
  dom: true,
  view: true,
  data: true
};
function parseCacheAttr(raw) {
  if (raw === null) return NO_CACHE;
  const value = raw.trim().toLowerCase();
  if (!value) return DEFAULT_CACHE;
  if (isOffKeyword(value)) return NO_CACHE;
  switch (value) {
    case "dom":
      return DOM_CACHE;
    case "view":
      return {
        dom: false,
        view: true,
        data: false
      };
    case "data":
      return {
        dom: false,
        view: false,
        data: true
      };
    case "all":
      return ALL_CACHE;
    default:
      console.warn(`Invalid cache attribute value "${raw.trim()}"; expected dom, view, data, all, or none/off/false`);
      return NO_CACHE;
  }
}

// node_modules/@auraui/router/dist/modules/aura-route/core/attr/inherit-attr-parser.js
function parseHookList(raw) {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (isOffKeyword(trimmed)) return [];
  return parseCommaSeparated(trimmed);
}
function parseInheritableNullableString(raw) {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (!trimmed || isOffKeyword(trimmed)) return null;
  return trimmed;
}

// node_modules/@auraui/router/dist/modules/aura-route/core/attr/mount-strategy-attr-parser.js
var DEFAULT_ROUTER_MOUNT_STRATEGY = "branch";
function parseMountStrategyAttr(value) {
  const trimmed = value?.trim().toLowerCase() ?? "";
  if (trimmed === "full") return trimmed;
  return DEFAULT_ROUTER_MOUNT_STRATEGY;
}

// node_modules/@auraui/router/dist/modules/aura-route/core/attr/param-change-attr-parser.js
var MODES = /* @__PURE__ */ new Set(["update", "navigate"]);
function parseParamChangeAttr(value) {
  if (value === null) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || isOffKeyword(trimmed)) return null;
  if (MODES.has(trimmed)) return trimmed;
  return null;
}

// node_modules/@auraui/router/dist/modules/aura-route/core/attr/prefetch-attr-parser.js
var LINK_PREFETCH_MODES = [
  "intent",
  "viewport",
  "tap",
  "render",
  "manual"
];
var DEFAULT_ROUTER_PREFETCH_MODE = "intent";
var MODES2 = new Set(LINK_PREFETCH_MODES);
function parsePrefetchAttr(value) {
  if (value === null) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed === "true") return DEFAULT_ROUTER_PREFETCH_MODE;
  if (isOffKeyword(trimmed)) return false;
  if (MODES2.has(trimmed)) return trimmed;
  return null;
}

// node_modules/@auraui/router/dist/modules/aura-route/core/attr/scroll-attr-parser.js
function parseScrollAttr(raw) {
  if (raw === null) return null;
  const normalized = raw.trim().toLowerCase();
  if (isOffKeyword(normalized)) return "manual";
  if (!normalized) return null;
  if (normalized === "restore" || normalized === "top") return normalized;
  return null;
}

// node_modules/@auraui/router/dist/modules/aura-route/core/attr/transition-attr-parser.js
var NO_TRANSITION = {
  order: null,
  in: null,
  out: null
};
function parseTransitionShortcutAttr(raw) {
  if (raw == null) return null;
  if (isOffKeyword(raw)) return null;
  const parts = parseCommaSeparated(raw);
  if (!parts?.length) return null;
  if (parts.length === 1) return {
    in: parts,
    out: parts
  };
  return {
    out: [parts[0]],
    in: [parts[1]]
  };
}

// node_modules/@auraui/router/dist/modules/aura-route/core/attr/transition-order-attr-parser.js
function parseTransitionOrder(value) {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (isOffKeyword(trimmed)) return null;
  if (!(trimmed === "out-in" || trimmed === "in-out" || trimmed === "parallel")) {
    console.warn("Invalid transition-order attribute value; expected out-in, in-out, or parallel");
    return null;
  }
  return trimmed;
}

// node_modules/@auraui/router/dist/modules/aura-route/core/attr/view-attr-parser.js
var BUILTIN_LOADER_IDS = [
  "template",
  "html",
  "url",
  "component",
  "import",
  "iframe"
];
var ASYNC_LOADER_IDS = [
  "url",
  "import",
  "iframe"
];
var SYNC_LOADER_IDS = [
  "template",
  "html",
  "component"
];
var knownLoaders = new Set(BUILTIN_LOADER_IDS);
var asyncLoaders = new Set(ASYNC_LOADER_IDS);
var syncLoaders = new Set(SYNC_LOADER_IDS);
function isKnownViewLoader(loader) {
  return knownLoaders.has(loader);
}
function isAsyncLoader(loader) {
  return loader !== void 0 && asyncLoaders.has(loader);
}
function isSyncLoader(loader) {
  return loader !== void 0 && syncLoaders.has(loader);
}
function urlView(content) {
  warnIfContentLooksLikeModule(content);
  return {
    loader: "url",
    content
  };
}
function parseViewAttr(value) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const sep = trimmed.indexOf("::");
  if (sep <= 0) return urlView(trimmed);
  const loader = trimmed.slice(0, sep);
  const content = trimmed.slice(sep + 2);
  if (isKnownViewLoader(loader)) {
    if (loader === "url") warnIfContentLooksLikeModule(content);
    if (loader === "component" && !content.includes("-")) console.warn(`view="component::${content}" \u2014 custom element ref must contain "-"`);
    return {
      loader,
      content
    };
  }
  return {
    loader,
    content
  };
}
var warnedImportExtension = /* @__PURE__ */ new Set();
var SCRIPT_PATH_RE = /\.(?:mjs|cjs|jsx|tsx|js|ts)(?:$|[?#])/i;
function warnIfContentLooksLikeModule(content) {
  if (!SCRIPT_PATH_RE.test(content)) return;
  if (warnedImportExtension.has(content)) return;
  warnedImportExtension.add(content);
  console.warn(`view content "${content}" looks like a module path \u2014 use import::${content} instead of url`);
}

// node_modules/@auraui/router/dist/_virtual/_@oxc-project_runtime@0.127.0/helpers/decorate.js
function __decorate(decorators, target, key, desc) {
  var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
  if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
  else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
  return c > 3 && r && Object.defineProperty(target, key, r), r;
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/hooks/version.js
var ROUTER_VERSION = "0.1.0";
var VERSION_RANGE_PATTERN = /^(>=|<=|>|<|=)(\d+)\.(\d+)\.(\d+)$/;
var VERSION_STRING_PATTERN = /^(\d+)\.(\d+)\.(\d+)/;
function toVersionNumber(major, minor, patch) {
  return major * 1e6 + minor * 1e3 + patch;
}
function parseVersionNumber(version) {
  const match = VERSION_STRING_PATTERN.exec(version);
  if (!match) return 0;
  const major = match[1];
  const minor = match[2];
  const patch = match[3];
  if (major === void 0 || minor === void 0 || patch === void 0) return 0;
  return toVersionNumber(Number(major), Number(minor), Number(patch));
}
var routerVersionNumber = parseVersionNumber(ROUTER_VERSION);
function satisfies(version, range) {
  const rangeMatch = VERSION_RANGE_PATTERN.exec(range.trim());
  if (!rangeMatch) {
    console.warn(`Invalid version range: "${range}"`);
    return true;
  }
  const operator = rangeMatch[1];
  const rangeMajor = rangeMatch[2];
  const rangeMinor = rangeMatch[3];
  const rangePatch = rangeMatch[4];
  if (operator === void 0 || rangeMajor === void 0 || rangeMinor === void 0 || rangePatch === void 0) return true;
  const difference = (version === "0.1.0" ? routerVersionNumber : parseVersionNumber(version.trim())) - toVersionNumber(Number(rangeMajor), Number(rangeMinor), Number(rangePatch));
  switch (operator) {
    case ">=":
      return difference >= 0;
    case ">":
      return difference > 0;
    case "<=":
      return difference <= 0;
    case "<":
      return difference < 0;
    case "=":
      return difference === 0;
    default:
      return true;
  }
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/hooks/registry.js
var HOOK_NAME_RE = /^[\p{Ll}\p{Lo}\p{Lm}][\p{Ll}\p{Lo}\p{Lm}\p{N}-]*$/u;
function isRedirectTarget(value) {
  return typeof value === "string" || typeof value === "object" && value !== null && "url" in value && !("type" in value);
}
function normalizeHookResult(result) {
  if (result === void 0 || result === true) return void 0;
  if (result === false) return false;
  if (typeof result === "string") return result;
  if (isRedirectTarget(result)) return result;
  if (typeof result === "object" && result !== null && "type" in result) {
    const typed = result;
    if (typed.type === "redirect" && typed.url) return {
      url: typed.url,
      ...typed.replace !== void 0 && { replace: typed.replace }
    };
    if (typed.type === "continue") return void 0;
    if (typed.type === "cancel") return false;
  }
}
function isTerminalGuardResult(result) {
  return result === false || isRedirectTarget(result);
}
var HookRegistry = class {
  constructor() {
    this.entries = /* @__PURE__ */ new Map();
  }
  /**
  * Registers a hook by name.
  *
  * Re-registering the same `fn` + `version` updates options only (no version warn, no re-check of `requires`).
  * Options are stored as a shallow snapshot.
  *
  * @throws When `hook.requires` is not satisfied by {@link ROUTER_VERSION} (new or upgraded registration)
  */
  register(hook, options = {}) {
    const { name, version, fn, requires } = hook;
    if (!name || !HOOK_NAME_RE.test(name)) throw new Error(`Invalid hook name: "${name}". Use letters (any language; no uppercase), digits, and hyphens; must start with a letter (e.g. "auth", "fetch-user", "\u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u044F").`);
    const existing = this.entries.get(name);
    const stored = {
      fn,
      version,
      options: { ...options }
    };
    if (existing?.fn === fn && existing.version === version) {
      this.entries.set(name, stored);
      return;
    }
    if (existing && existing.version !== version) console.warn(`Hook "${name}" ${existing.version} \u2192 ${version}`);
    if (requires && !satisfies("0.1.0", requires)) throw new Error(`Hook "${name}@${version}" requires router ${requires} (current: ${ROUTER_VERSION})`);
    this.entries.set(name, stored);
  }
  /** Removes a hook by name. Returns `true` when an entry existed. */
  unregister(name) {
    return this.entries.delete(name);
  }
  /** Returns whether a hook name is registered. */
  has(name) {
    return this.entries.has(name);
  }
  /** Returns the stored entry (internal/testing). */
  get(name) {
    return this.entries.get(name);
  }
  /**
  * Runs hooks sequentially for one route/phase.
  *
  * Stops on first cancel (`false`) or redirect. Unknown names are skipped with a warning.
  * Each hook gets a fresh {@link RouteHookContext} (no shared mutable ctx between hooks).
  *
  * @param isTransactionActive - when it returns `false`, remaining hooks are skipped
  */
  async run(lifecycleCtx, names, isTransactionActive) {
    for (const name of names) {
      if (!isTransactionActive?.()) return void 0;
      const entry = this.entries.get(name);
      if (!entry) {
        console.warn(`Unknown hook "${name}" on route ${lifecycleCtx.route.path} (phase ${lifecycleCtx.phase})`);
        continue;
      }
      const hookCtx = {
        ...lifecycleCtx,
        options: entry.options
      };
      const raw = await entry.fn(hookCtx);
      if (!isTransactionActive?.()) return void 0;
      const result = normalizeHookResult(raw);
      if (isTerminalGuardResult(result)) return result;
    }
  }
};
async function runPhaseHooks(registry, lifecycleContext, hookNames, isTransactionActive) {
  if (!hookNames.length) return void 0;
  try {
    const result = await registry.run(lifecycleContext, hookNames, isTransactionActive);
    if (!isTransactionActive()) return false;
    return result;
  } catch (error) {
    if (!isTransactionActive()) return false;
    throw error;
  }
}
var defaultHookRegistry = new HookRegistry();

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/prefetch/prefetch-policy.js
function resolvePrefetchEngineConfig(parsed) {
  if (parsed === false) return false;
  if (parsed == null) return void 0;
  return { defaultMode: parsed };
}
function readLinkPrefetchOverride(anchor) {
  if (!anchor.hasAttribute("data-prefetch")) return void 0;
  return parsePrefetchAttr(anchor.getAttribute("data-prefetch") ?? "") ?? void 0;
}
function resolvePrefetchMode(options) {
  const routerDefault = options.routerDefault ?? "intent";
  const link = readLinkPrefetchOverride(options.anchor);
  if (link !== void 0) return link === false ? null : link;
  const route = options.route?.prefetch;
  if (route === false) return null;
  if (route != null) return route;
  return options.touch ? "tap" : routerDefault;
}

// node_modules/@auraui/router/dist/modules/aura-utils/async/singleflight.js
var Singleflight = class {
  constructor() {
    this.pending = /* @__PURE__ */ new Map();
  }
  do(key, fn) {
    const existing = this.pending.get(key);
    if (existing) return existing;
    const promise = fn().finally(() => {
      this.pending.delete(key);
    });
    this.pending.set(key, promise);
    return promise;
  }
  /** In-flight promise for `key`, if any — does not start work. */
  get(key) {
    return this.pending.get(key);
  }
  delete(key) {
    this.pending.delete(key);
  }
  clear() {
    this.pending.clear();
  }
};

// node_modules/@auraui/router/dist/modules/aura-cache/core/aura-resolvable-swr-cache.js
var AuraResolvableSwrCache = class {
  /**
  * @param options - Store config plus fixed {@link ResolvableSwrCachePolicy}.
  */
  constructor(options = {}) {
    this.singleflight = new Singleflight();
    this.epoch = 0;
    const { write, onSettled, ...storeOptions } = options;
    this.store = new AuraSwrCache(storeOptions);
    this.write = write;
    this.onSettled = onSettled;
  }
  /**
  * Returns a cached value when present (fresh or stale) and promotes LRU order.
  *
  * @param key - Cache key.
  * @returns The stored value, or `undefined` if missing or GC-expired.
  */
  get(key) {
    return this.store.get(key);
  }
  /** Read-only probe — no LRU promote, no load. */
  has(key) {
    return this.store.has(key);
  }
  /**
  * Join in-flight `resolve` work or a settled store value — never starts a load.
  *
  * @returns Promise of the value when in-flight or settled; `undefined` when missing.
  */
  join(key) {
    const pending = this.singleflight.get(key);
    if (pending) return pending;
    const settled = this.store.get(key);
    if (settled !== void 0) return Promise.resolve(settled);
  }
  /**
  * Stores a value under `key`. See {@link AuraSwrCache.set}.
  *
  * @param key - Cache key.
  * @param value - Value to store.
  * @param options - Per-entry `gcTime` / `staleTime` overrides.
  */
  set(key, value, options) {
    this.store.set(key, value, options);
  }
  /**
  * Removes the entry and drops any in-flight `resolve` for `key`.
  *
  * @param key - Cache key.
  */
  delete(key) {
    this.store.delete(key);
    this.singleflight.delete(key);
  }
  /**
  * Clears the store and in-flight map; bumps epoch so prior loads cannot commit.
  */
  clear() {
    this.epoch++;
    this.store.clear();
    this.singleflight.clear();
  }
  /**
  * Marks an entry outdated or removes it. See {@link AuraSwrCache.invalidate}.
  *
  * @param key - Cache key.
  * @param policy - `'stale'` or `'remove'`; defaults to store `invalidatePolicy`.
  */
  invalidate(key, policy) {
    return this.store.invalidate(key, policy);
  }
  /**
  * Invalidates entries whose keys match `predicate`.
  *
  * @param predicate - Key filter.
  * @param policy - Defaults to store `invalidatePolicy`.
  */
  invalidateMatch(predicate, policy) {
    return this.store.invalidateMatch(predicate, policy);
  }
  /**
  * Invalidates every entry. See {@link AuraSwrCache.invalidateAll}.
  *
  * @param policy - Defaults to store `invalidatePolicy`.
  */
  invalidateAll(policy) {
    return this.store.invalidateAll(policy);
  }
  /**
  * Releases the store and in-flight map (same epoch bump as {@link clear}).
  */
  destroy() {
    this.epoch++;
    this.store.destroy();
    this.singleflight.clear();
  }
  /**
  * Returns a cached value or runs `load` once per in-flight key.
  *
  * With SWR (`staleTime`): fresh → cached value; stale → cached value + background `load`;
  * missing → await `load`. Background revalidation errors are ignored.
  *
  * On settle: writes into this store when the constructor {@link ResolvableSwrCachePolicy.write}
  * allows (default), then runs optional {@link ResolvableSwrCachePolicy.onSettled}.
  */
  resolve(key, load) {
    const entry = this.store.lookup(key, true);
    if (entry.status === "fresh") return Promise.resolve(entry.value);
    if (entry.status === "stale") {
      this.runLoad(key, load).catch(() => {
      });
      return Promise.resolve(entry.value);
    }
    return this.runLoad(key, load);
  }
  /** Runs `load` once per in-flight key via singleflight, then {@link commit}. */
  runLoad(key, load) {
    const epoch = this.epoch;
    return this.singleflight.do(key, () => load().then((value) => {
      if (epoch === this.epoch) this.commit(key, value);
      return value;
    }));
  }
  /** Writes settled value when policy allows, then runs `onSettled`. */
  commit(key, value) {
    if (this.shouldWrite(value)) this.store.set(key, value);
    this.onSettled?.(key, value);
  }
  /** Resolves constructor `write` policy for a settled value. */
  shouldWrite(value) {
    const write = this.write;
    if (write === void 0) return true;
    if (typeof write === "function") return write(value);
    return write;
  }
};

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/aura-routing-engine-config.js
var ENGINE_DEFAULTS = {
  linksSelector: "[aura-router-link]",
  hash: false,
  /** `cache.view` — max entries, GC after 12h. */
  viewCache: {
    max: 50,
    gcTime: 432e5
  },
  /** `cache.data` — SWR fresh 30s, GC after 5min. */
  dataCache: {
    staleTime: 3e4,
    gcTime: 5 * 6e4
  },
  /** Prepare handoff TTL (prefetch → navigation). */
  sharedBufferOptions: { ttl: 3e4 },
  /** Link prefetch; pass `prefetch: false` on the engine to disable. */
  prefetch: {
    defaultMode: "intent",
    intentDelayMs: 50,
    viewportDelayMs: 0,
    tapDelayMs: 0,
    staleTimeMs: 3e4,
    maxAgeMs: 3e4
  }
};
function resolveAuraRoutingEngineConfig(config = {}) {
  return {
    ...config,
    linksSelector: config.linksSelector ?? ENGINE_DEFAULTS.linksSelector,
    hash: config.hash ?? ENGINE_DEFAULTS.hash,
    sharedBufferOptions: {
      ...ENGINE_DEFAULTS.sharedBufferOptions,
      ...config.sharedBufferOptions
    },
    prefetch: config.prefetch === false ? false : {
      ...ENGINE_DEFAULTS.prefetch,
      ...config.prefetch
    }
  };
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/data-graph/route-data.js
function resolveRouteData(snapshot, route) {
  if (!route.route.hasLoad) return void 0;
  const key = route.dataKey;
  if (key == null || !snapshot.has(key)) return void 0;
  return snapshot.get(key);
}
function closestRouteWithLoadHooks(child, branch) {
  const childUid = child.route.uid;
  const childIndex = branch.findIndex((route) => route.route.uid === childUid);
  if (childIndex <= 0) return void 0;
  for (let i = childIndex - 1; i >= 0; i--) {
    const ancestor = branch[i];
    if (ancestor.route.hasLoad) return ancestor;
  }
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/navigation/lifecycle-phases.js
var PHASES = {
  leave: {
    phase: "leave",
    targetRoutes: "exitRoutes",
    hookPolicy: { kind: "blocking" },
    errorPolicy: "failure",
    htmlAttr: "leave",
    routeHookProp: "leave",
    runRouteLifecycle: (route, ctx) => route.onLeave(ctx)
  },
  guard: {
    phase: "guard",
    targetRoutes: "enterRoutes",
    hookPolicy: { kind: "blocking" },
    errorPolicy: "failure",
    htmlAttr: "guard",
    routeHookProp: "guard",
    runRouteLifecycle: (route, ctx) => route.onGuard(ctx)
  },
  load: {
    phase: "load",
    targetRoutes: "enterRoutes",
    hookPolicy: {
      kind: "preCommit",
      onError: "propagate"
    },
    errorPolicy: "failure",
    htmlAttr: "load",
    routeHookProp: "load",
    runRouteLifecycle: (route, ctx) => route.onLoad(ctx)
  },
  update: {
    phase: "update",
    targetRoutes: "enterRoutes",
    hookPolicy: {
      kind: "preCommit",
      onError: "propagate"
    },
    errorPolicy: "failure",
    htmlAttr: "update",
    routeHookProp: "update",
    runRouteLifecycle: (route, ctx) => route.onUpdate(ctx)
  },
  transitionOut: {
    phase: "transitionOut",
    targetRoutes: "exitRoutes",
    hookPolicy: {
      kind: "postCommit",
      onError: "propagate"
    },
    errorPolicy: "failure",
    htmlAttr: "transition-out",
    routeHookProp: "transitionOut",
    runRouteLifecycle: (route, ctx) => route.onTransitionOut(ctx)
  },
  transitionIn: {
    phase: "transitionIn",
    targetRoutes: "enterRoutes",
    hookPolicy: {
      kind: "postCommit",
      onError: "propagate"
    },
    errorPolicy: "failure",
    htmlAttr: "transition-in",
    routeHookProp: "transitionIn",
    runRouteLifecycle: (route, ctx) => route.onTransitionIn(ctx)
  },
  unmount: {
    phase: "unmount",
    targetRoutes: "exitRoutes",
    hookPolicy: {
      kind: "postCommit",
      onError: "log"
    },
    errorPolicy: "log",
    htmlAttr: "unmount",
    routeHookProp: "unmount",
    runRouteLifecycle: (route, ctx) => route.onUnmount(ctx)
  },
  ready: {
    phase: "ready",
    targetRoutes: "enterRoutes",
    hookPolicy: {
      kind: "postCommit",
      onError: "log"
    },
    errorPolicy: "log",
    htmlAttr: "ready",
    routeHookProp: "ready",
    runRouteLifecycle: (route, ctx) => route.onReady(ctx)
  },
  error: {
    phase: "error",
    targetRoutes: "enterRoutes",
    hookPolicy: {
      kind: "postCommit",
      onError: "log"
    },
    errorPolicy: "log",
    htmlAttr: "error",
    routeHookProp: "error",
    runRouteLifecycle: (route, ctx) => route.onError(ctx)
  }
};
Object.keys(PHASES).filter((phase) => phase !== "error");

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/hooks/resolve-hook-names.js
function resolveHookNames(source, phase) {
  const routeHookProp = PHASES[phase].routeHookProp;
  if (!routeHookProp) return null;
  const names = source[routeHookProp];
  return names?.length ? names : null;
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/navigation/navigation-transaction-pipeline-phase.js
var NavigationTransactionPipelinePhase = class {
  /**
  * Runs the route lifecycle callback, then phase hooks from the registry.
  * Blocking phases may return cancel/redirect; post-commit phases always continue.
  */
  static async run(route, phaseDef, transaction) {
    const isBlocking = phaseDef.hookPolicy.kind === "blocking";
    const { engine } = transaction;
    const { errorPolicy, phase, runRouteLifecycle } = phaseDef;
    const context = this.toPhaseContext(phase, route, transaction);
    try {
      runRouteLifecycle(route.route, context);
    } catch (error) {
      return this.applyErrorPolicy(errorPolicy, phase, error, route);
    }
    const hookNames = resolveHookNames(route.route, phaseDef.phase) ?? [];
    if (isBlocking) try {
      const hookResult = await runPhaseHooks(engine.hooksRegistry, context, hookNames, () => transaction.isActive());
      return this.resolveBlockingHookOutcome(hookResult);
    } catch (error) {
      return this.applyErrorPolicy(errorPolicy, phase, error, route);
    }
    const { hookPolicy } = phaseDef;
    const onHookError = hookPolicy.kind !== "blocking" && hookPolicy.onError === "log" ? (error) => console.error(`[${phase}] post-commit hook threw (logged, continuing):`, error) : (error) => {
      throw error;
    };
    try {
      await this.runLoggedPostCommitHooks(context, hookNames, engine.hooksRegistry, () => transaction.isActive(), phase, onHookError);
      return null;
    } catch (error) {
      return this.applyErrorPolicy(errorPolicy, phase, error, route);
    }
  }
  /**
  * Terminal `error` recovery: `onError` + attr `error` hooks.
  * Caller supplies a normalized error and assembled {@link NavigationFailure}.
  */
  static async runError(route, normalized, failed, context) {
    const { phase, runRouteLifecycle } = PHASES.error;
    const routeData = context.dataSnapshot ? resolveRouteData(context.dataSnapshot, route) : void 0;
    const errorContext = this.buildPhaseContext(phase, route, {
      from: context.transaction.from,
      action: context.transaction.action,
      router: context.router,
      transactionId: context.transactionId,
      transactionSignal: context.transactionSignal,
      error: normalized,
      ...routeData !== void 0 && { data: routeData }
    });
    try {
      runRouteLifecycle(route.route, errorContext);
    } catch (routeError) {
      context.reportHookError?.(routeError, failed);
    }
    const errorHooks = resolveHookNames(route.route, phase);
    if (!errorHooks?.length) return;
    await this.runLoggedPostCommitHooks(errorContext, errorHooks, context.hookRegistry, context.isJobActive, phase, (hookError) => context.reportHookError?.(hookError, failed));
  }
  /** Hook/callback context for a pipeline phase step. */
  static toPhaseContext(phase, route, transaction) {
    const { engine, from, action, transactionId, signal } = transaction;
    return this.buildPhaseContext(phase, route, {
      from,
      action,
      router: engine.router,
      transactionId,
      transactionSignal: signal,
      data: transaction.dataSnapshot ? resolveRouteData(transaction.dataSnapshot, route) : void 0
    });
  }
  static buildPhaseContext(phase, route, source) {
    const { data, error, from, action, router: router2, transactionId, transactionSignal, parent } = source;
    return {
      phase,
      to: this.toRouteInfo(route),
      from: from ? this.toRouteInfo(from) : null,
      router: router2,
      route: route.route,
      action,
      transactionId,
      transactionSignal,
      ...data !== void 0 && { data },
      ...parent !== void 0 && { parent },
      ...error !== void 0 && { error }
    };
  }
  static isRoutePhaseFailure(r) {
    return r !== null && typeof r === "object" && "status" in r && r.status === "phaseFailed";
  }
  /** Maps a blocking {@link GuardResult} to a {@link BlockingHookStepResult}. */
  static resolveBlockingHookOutcome(hookResult) {
    if (hookResult === false) return { status: "cancelled" };
    if (typeof hookResult === "string") return {
      status: "redirect",
      url: hookResult
    };
    if (hookResult && typeof hookResult === "object" && "url" in hookResult) return {
      status: "redirect",
      url: hookResult.url,
      ...hookResult.replace !== void 0 && { replace: hookResult.replace }
    };
    return null;
  }
  static resolveLoadHookOutcome(result) {
    if (result === false) return { status: "cancelled" };
    return null;
  }
  /** Post-commit hooks cannot cancel or redirect — log and discard non-void results. */
  static logIgnoredPostCommitOutcome(phase, hookResult) {
    if (hookResult === false) {
      console.warn(`[${phase}] post-commit hook returned false \u2014 ignored`);
      return;
    }
    const redirect = this.resolveBlockingHookOutcome(hookResult);
    if (redirect?.status === "redirect") console.warn(`[${phase}] post-commit hook returned redirect \u2014 ignored: ${redirect.url}`);
  }
  static async runLoggedPostCommitHooks(lifecycleContext, hookNames, hookRegistry, isJobActive, phase, onHookError) {
    try {
      const hookResult = await runPhaseHooks(hookRegistry, lifecycleContext, hookNames, isJobActive);
      this.logIgnoredPostCommitOutcome(phase, hookResult);
    } catch (error) {
      onHookError(error);
    }
  }
  static toRouteInfo(matchedRoute) {
    return {
      pathname: matchedRoute.pathname,
      ...matchedRoute.params && { params: matchedRoute.params },
      ...matchedRoute.query && { query: matchedRoute.query }
    };
  }
  /** Applies {@link RoutePhaseThrowPolicy} when a lifecycle callback or hook throws. */
  static applyErrorPolicy(errorPolicy, phase, error, route) {
    if (errorPolicy === "log") {
      console.error(`[${phase}] phase threw (logged, continuing pipeline):`, error);
      return null;
    }
    if (errorPolicy === "propagate") throw error;
    return {
      status: "phaseFailed",
      error,
      route,
      phase
    };
  }
};

// node_modules/@auraui/router/dist/modules/aura-utils/async/on-abort.js
function onAbort(signal, callback) {
  if (signal.aborted) {
    callback();
    return () => void 0;
  }
  const handler = () => callback();
  signal.addEventListener("abort", handler, { once: true });
  return () => signal.removeEventListener("abort", handler);
}

// node_modules/@auraui/router/dist/modules/aura-utils/async/await-until-abort.js
function abortReason(signal) {
  return signal.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError");
}
function awaitUntilAbort(promise, signal) {
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise((resolve, reject) => {
    const clearAbort = onAbort(signal, () => reject(abortReason(signal)));
    const finish = (action) => {
      clearAbort();
      if (signal.aborted) {
        reject(abortReason(signal));
        return;
      }
      action();
    };
    promise.then((value) => finish(() => resolve(value)), (error) => finish(() => reject(error)));
  });
}

// node_modules/@auraui/router/dist/modules/aura-utils/async/promises.js
var promiseWithResolvers = () => {
  let resolve;
  let reject;
  return {
    promise: new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    }),
    resolve,
    reject
  };
};

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/invalidate-router-cache.js
var CACHE_KEY_SEP = "|";
var KIND_PREFIX_LEN = 5;
function belongsToPath(entryKey, path) {
  const body = entryKey.slice(KIND_PREFIX_LEN);
  return body === path || body.startsWith(`${path}${CACHE_KEY_SEP}`);
}
function exactKeyMatcher(key) {
  return (entryKey) => entryKey === key;
}
function pathPrefixMatcher(path) {
  return (entryKey) => belongsToPath(entryKey, path);
}
function buildKeyMatcher(scope) {
  const { key, path, match } = scope ?? {};
  if (key) return exactKeyMatcher(key);
  if (path) return pathPrefixMatcher(path);
  if (match) return match;
  return null;
}
function invalidateExactKey(cache, key, policy) {
  return cache.invalidate(key, policy) ? 1 : 0;
}
function invalidateEveryKey(cache, policy) {
  const count = cache.invalidateAll(policy);
  return count > 0 ? count : -1;
}
function invalidateRouterCache(cache, options = {}, defaultPolicy = "stale") {
  const policy = options.policy ?? defaultPolicy;
  if (options.key) return invalidateExactKey(cache, options.key, policy);
  const matcher = buildKeyMatcher(options);
  if (!matcher) return invalidateEveryKey(cache, policy);
  return cache.invalidateMatch(matcher, policy);
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/data-graph/data-graph.js
var SKIP_RESULT = {};
var CANCELLED_RESULT = { error: { status: "cancelled" } };
var DataGraphTerminalError = class extends Error {
  constructor(outcome) {
    super("DataGraph terminal hook outcome");
    this.name = "DataGraphTerminalError";
    this.outcome = outcome;
  }
};
var DataGraph = class DataGraph2 {
  static {
    this.defaultCacheOptions = {};
  }
  /** Default `cache.data` options for engine-created graphs. */
  static configure(options = {}) {
    DataGraph2.defaultCacheOptions = {
      ...DataGraph2.defaultCacheOptions,
      ...options
    };
  }
  constructor(sharedBuffer, deps) {
    this.hooks = deps.hooks;
    this.sharedBuffer = sharedBuffer;
    this.cache = new AuraResolvableSwrCache({
      ...ENGINE_DEFAULTS.dataCache,
      ...DataGraph2.defaultCacheOptions,
      ...deps.cache,
      gcSweepInterval: false
    });
  }
  /**
  * Parallel enter-route loads (navigation or prefetch via {@link DataGraphLoadOptions.mode}).
  * `navigation` → `{ error }` only on failure (no partial sibling data).
  * `prefetch` → keeps partial `data`; soft skip on cancel/error.
  */
  async load(enterRoutes, options) {
    const { error, data } = await this.loadEnterRoutes(enterRoutes, options.branch ?? enterRoutes, options.transaction, options.mode);
    if (options.mode === "prefetch") return {
      error,
      data
    };
    return error ? { error } : { data };
  }
  /**
  * Invalidate long `cache.data` entries ({@link RouterInvalidateOptions}, default policy `stale`).
  * Clears the shared prepare handoff buffer so the next load/prefetch cannot reuse stale settles.
  */
  invalidate(options = {}) {
    const count = invalidateRouterCache(this.cache, options, "stale");
    this.sharedBuffer.clear();
    return count;
  }
  /** Cached `cache.data` payloads on the branch, or `undefined` when empty. */
  snapshot(branch) {
    const data = /* @__PURE__ */ new Map();
    for (const match of branch) {
      if (!match.route.hasDataCache) continue;
      const key = match.dataKey;
      if (!key) continue;
      const value = this.cache.get(key);
      if (value !== void 0) data.set(key, value);
    }
    return data.size > 0 ? data : void 0;
  }
  getData(match) {
    const key = match.dataKey;
    return key ? this.cache.get(key) : void 0;
  }
  destroy() {
    this.cache.destroy();
  }
  /**
  * Parallel enter loads. Interest abort detaches callers; work abort — see {@link HandoffWorkRegistry}.
  */
  async loadEnterRoutes(enterRoutes, branch, transaction, mode) {
    const siblingAbort = new AbortController();
    const interestSignal = AbortSignal.any([transaction.signal, siblingAbort.signal]);
    const deferreds = createPayloadDeferredTable(enterRoutes);
    const result = /* @__PURE__ */ new Map();
    const errors = [];
    await Promise.all(enterRoutes.map(async (match, index) => {
      const deferred = deferreds.get(match.route.uid);
      if (!match.dataKey) {
        deferred.resolve(void 0);
        return;
      }
      const { error, data } = await this.loadEnterRoute({
        match,
        transaction,
        interestSignal,
        siblingAbort,
        mode,
        parent: () => this.resolveParentDeferred(match, deferreds, branch),
        deferred
      });
      if (error) {
        errors[index] = error;
        siblingAbort.abort();
        return;
      }
      result.set(match.dataKey, data);
    }));
    return {
      error: errors.find(Boolean),
      data: result
    };
  }
  async loadEnterRoute(request) {
    const { match, transaction, interestSignal, mode, parent, deferred } = request;
    const hookNames = resolveHookNames(match.route, "load");
    if (!hookNames) {
      deferred.resolve(void 0);
      return SKIP_RESULT;
    }
    const waiter = this.sharedBuffer.hold(match.dataKey, mode);
    try {
      const shared = this.runSharedLoad(match, () => this.callLoadHooks(this.buildLoadHookContext(match, transaction, {
        transactionSignal: waiter.workSignal,
        parent
      }), hookNames));
      shared.then(deferred.resolve, deferred.reject);
      const data = await awaitUntilAbort(shared, interestSignal);
      if (!isInterestActive(request)) return cancelledResult(mode);
      if (mode === "navigation") match.route.onLoad(this.buildLoadHookContext(match, transaction, {
        transactionSignal: transaction.signal,
        parent,
        data
      }));
      return { data };
    } catch (error) {
      return this.toLoadErrorResult(error, request);
    } finally {
      waiter.release();
    }
  }
  /**
  * Handoff (+ optional long `cache.data`).
  * Factory uses the waiter {@link HandoffWaiter.workSignal}, not caller interest.
  */
  runSharedLoad(match, load) {
    const { dataKey } = match;
    if (!dataKey) return Promise.resolve(void 0);
    return this.sharedBuffer.resolve(dataKey, async () => {
      const useLongCache = match.route.hasDataCache;
      if (useLongCache) {
        const cachedValue = this.cache.get(dataKey);
        if (cachedValue !== void 0) return cachedValue;
      }
      const { data, error } = await load();
      if (error) throw new DataGraphTerminalError(error);
      if (useLongCache) this.cache.set(dataKey, data, {
        gcTime: match.route.cacheTime ?? void 0,
        staleTime: match.route.cacheRefresh ?? void 0
      });
      return data;
    });
  }
  async callLoadHooks(context, hookNames) {
    const values = await Promise.all(hookNames.map((hookName) => {
      const loader = this.hooks.get(hookName);
      if (!loader) {
        console.warn(`Unknown hook "${hookName}" on route ${context.route.path} (phase ${context.phase})`);
        return;
      }
      return loader.fn({
        ...context,
        options: loader.options
      });
    }));
    if (hookNames.length === 1) return { data: values[0] };
    const data = {};
    for (let i = 0; i < hookNames.length; i++) data[hookNames[i]] = values[i];
    return { data };
  }
  buildLoadHookContext(match, transaction, extras) {
    return NavigationTransactionPipelinePhase.buildPhaseContext("load", match, {
      from: transaction.from,
      action: transaction.action,
      router: transaction.engine.router,
      transactionId: transaction.transactionId,
      transactionSignal: extras.transactionSignal,
      parent: extras.parent,
      ...extras.data !== void 0 && { data: extras.data }
    });
  }
  async toLoadErrorResult(error, request) {
    const { match, transaction, mode } = request;
    if (mode === "prefetch") return SKIP_RESULT;
    if (error instanceof DataGraphTerminalError) return { error: error.outcome };
    if (!isInterestActive(request)) return CANCELLED_RESULT;
    return { error: await transaction.fail(match, error, "load") };
  }
  /** Nearest ancestor payload: in-batch deferred → handoff → long cache. */
  resolveParentDeferred(child, deferreds, branch) {
    const parent = closestRouteWithLoadHooks(child, branch);
    if (!parent) return Promise.resolve(void 0);
    const parentDeferred = deferreds.get(parent.route.uid);
    if (parentDeferred) return parentDeferred.promise;
    const dataKey = parent.dataKey;
    if (!dataKey) return Promise.resolve(void 0);
    const joined = this.sharedBuffer.join(dataKey);
    if (!joined) return Promise.resolve(this.cache.get(dataKey));
    return joined.catch(() => this.cache.get(dataKey));
  }
};
function createPayloadDeferredTable(enterRoutes) {
  const table = /* @__PURE__ */ new Map();
  for (const match of enterRoutes) {
    const deferred = promiseWithResolvers();
    deferred.promise.catch(() => {
    });
    table.set(match.route.uid, deferred);
  }
  return table;
}
function cancelledResult(mode) {
  return mode === "prefetch" ? SKIP_RESULT : CANCELLED_RESULT;
}
function isInterestActive(request) {
  return request.transaction.isActive() && !request.siblingAbort.signal.aborted;
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/view-graph/environment.js
var fetchText = async (url, signal) => {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
};
function defaultBase() {
  const href = globalThis.location?.href;
  if (href) return href;
  throw new Error("resolveRelativeUrl: pass base when location is unavailable (SSR / tests)");
}
function resolveRelativeUrl(path, base = defaultBase()) {
  try {
    const root = new URL("/", base);
    return new URL(path.trim(), root).href;
  } catch {
    return path;
  }
}
function createBrowserEnvironment() {
  return {
    fetchText,
    resolveUrl: resolveRelativeUrl,
    isSSR: false
  };
}
var defaultEnvironment = createBrowserEnvironment();

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/view-graph/loader.js
var Loader = class {
  constructor(env, typeOverride, needsDataOverride) {
    this.env = env;
    if (needsDataOverride !== void 0) this.needsData = needsDataOverride;
    if (typeOverride !== void 0) {
      this.type = typeOverride;
      return;
    }
    const ctor = this.constructor;
    if (typeof ctor.type !== "string") throw new TypeError(`${ctor.name} requires static readonly type`);
    this.type = ctor.type;
  }
};
var FnLoader = class extends Loader {
  constructor(env, loaderId, fn, needsData) {
    super(env, loaderId, needsData);
    this.fn = fn;
  }
  async load(ctx) {
    const result = await this.fn(ctx);
    if (result == null) return null;
    if (typeof result === "string") return {
      kind: "html",
      value: result
    };
    if (result instanceof Node) return {
      kind: "fragment",
      value: toFragment(result)
    };
    return result;
  }
};
function toFragment(node) {
  if (node instanceof DocumentFragment) return node;
  const fragment = document.createDocumentFragment();
  fragment.appendChild(node);
  return fragment;
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/view-graph/markup.js
function routeSnapshot(ctx) {
  return {
    href: ctx.route.href,
    pattern: ctx.route.pattern,
    ...ctx.route.params && { params: ctx.route.params },
    ...ctx.route.query && { query: ctx.route.query },
    ...ctx.data !== void 0 && { data: ctx.data }
  };
}
var CUSTOM_ELEMENT_TAG_RE = /^[a-z][a-z0-9._-]*$/;
function componentMarkup(tagName, context) {
  if (!CUSTOM_ELEMENT_TAG_RE.test(tagName)) throw new Error(`Invalid custom element tag name: "${tagName}"`);
  return `<${tagName} aura-data='${escapeHtml(JSON.stringify(routeSnapshot(context)))}'></${tagName}>`;
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/view-graph/loaders/component.js
var ComponentLoader = class extends Loader {
  static {
    this.type = "component";
  }
  static {
    this.needsData = true;
  }
  load(ctx) {
    if (!customElements.get(ctx.content)) throw new Error(`Component '${ctx.content}' is not registered`);
    return Promise.resolve({
      kind: "markup",
      value: componentMarkup(ctx.content, ctx)
    });
  }
};

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/view-graph/loaders/html.js
var HtmlLoader = class extends Loader {
  static {
    this.type = "html";
  }
  load(ctx) {
    return Promise.resolve({
      kind: "html",
      value: ctx.content
    });
  }
};

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/view-graph/loaders/iframe.js
var IframeLoader = class extends Loader {
  static {
    this.type = "iframe";
  }
  load(ctx) {
    return Promise.resolve({
      kind: "markup",
      value: `<iframe src="${escapeHtml(ctx.content)}" loading="lazy"></iframe>`
    });
  }
};

// node_modules/@auraui/router/dist/modules/aura-utils/misc/component.js
var registerComponent = (Component) => {
  const tagName = Component.is;
  const constructor = customElements.get(tagName);
  if (constructor && (constructor !== Component || constructor.is !== tagName)) throw new DOMException("Element tag already occupied or inconsistent", "NotSupportedError");
  if (constructor) return;
  customElements.define(tagName, Component);
};

// node_modules/@auraui/router/dist/modules/aura-utils/misc/loaders.js
var pathPrefix = "../../../";
function findRegisterableExport(exports) {
  for (const value of Object.values(exports)) if (value && typeof value === "function" && typeof value.is === "string") return value;
  return null;
}
async function loadAndRegisterComponent(path) {
  const Component = findRegisterableExport(await import(pathPrefix + path));
  if (!Component) throw new Error(`Not found [is] property inside the component: ${path}`);
  registerComponent(Component);
  return Component.is;
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/view-graph/loaders/import.js
var importSingleflight = new Singleflight();
async function resolveImportedTag(path) {
  return importSingleflight.do(path, () => loadAndRegisterComponent(path));
}
var ImportLoader = class extends Loader {
  static {
    this.type = "import";
  }
  static {
    this.needsData = true;
  }
  async load(ctx) {
    if (ctx.signal.aborted) return null;
    try {
      const tagName = await resolveImportedTag(ctx.content);
      if (ctx.signal.aborted) return null;
      return {
        kind: "markup",
        value: componentMarkup(tagName, ctx)
      };
    } catch (error) {
      if (ctx.signal.aborted) return null;
      throw error;
    }
  }
};

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/view-graph/loaders/template.js
var TemplateLoader = class extends Loader {
  static {
    this.type = "template";
  }
  load(ctx) {
    return Promise.resolve({
      kind: "fragment",
      value: getTemplate(ctx.content)
    });
  }
};

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/view-graph/loaders/url.js
var UrlLoader = class extends Loader {
  static {
    this.type = "url";
  }
  async load(ctx) {
    return {
      kind: "html",
      value: applyHtmlExtract(await this.env.fetchText(this.env.resolveUrl(ctx.content), ctx.signal), ctx.extract, ctx.route.href)
    };
  }
};

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/view-graph/registry.js
var BUILTIN = [
  TemplateLoader,
  HtmlLoader,
  UrlLoader,
  ComponentLoader,
  ImportLoader,
  IframeLoader
];
var LoaderRegistry = class {
  constructor(env = defaultEnvironment, loaders = BUILTIN.map((C) => new C(env))) {
    this.loaders = /* @__PURE__ */ new Map();
    this.env = env;
    loaders.forEach((loader) => this.install(loader));
  }
  register(loaderIdOrLoader, fn, options) {
    if (typeof loaderIdOrLoader === "string") {
      if (!fn) throw new TypeError(`register("${loaderIdOrLoader}") requires a loader function`);
      return this.install(new FnLoader(this.env, loaderIdOrLoader, fn, options?.needsData));
    }
    if (fn) throw new TypeError("register(loader) accepts a single argument");
    if (typeof loaderIdOrLoader === "function") {
      if (typeof loaderIdOrLoader.type !== "string") throw new TypeError("register(fn) is invalid \u2014 use register(loaderId, fn)");
      return this.install(new loaderIdOrLoader(this.env));
    }
    this.install(loaderIdOrLoader);
  }
  has(loaderId) {
    return this.loaders.has(loaderId);
  }
  /** @throws when `loaderId` is not registered */
  get(loaderId) {
    const loader = this.loaders.get(loaderId);
    if (!loader) throw new Error(`Unknown view loader "${loaderId}". Registered: ${[...this.loaders.keys()].join(", ") || "none"}`);
    return loader;
  }
  getEnvironment() {
    return this.env;
  }
  install(loader) {
    this.loaders.has(loader.type) && console.warn(`View loader "${loader.type}" is already registered \u2014 overwriting`);
    this.loaders.set(loader.type, loader);
  }
};
var defaultLoaderRegistry = new LoaderRegistry();

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/failure/navigation-error.js
var FAILURE_CODE_BY_PHASE = {
  match: "NOT_FOUND",
  leave: "GUARD_THROW",
  guard: "GUARD_THROW",
  load: "LOAD_FAILED",
  render: "RENDER_FAILED",
  update: "UPDATE_FAILED",
  transitionOut: "TRANSITION_FAILED",
  transitionIn: "TRANSITION_FAILED",
  unmount: "HOOK_THROW",
  ready: "HOOK_THROW"
};
var NavigationError = class extends Error {
  constructor(init) {
    super(init.message, { cause: init.cause });
    this.name = "NavigationError";
    this.code = init.code;
    this.phase = init.phase;
    this.routePattern = init.routePattern;
  }
};
function normalizeNavigationError(error, ctx) {
  if (error instanceof NavigationError) return error;
  const code = ctx.defaultCode ?? defaultCodeForPhase(ctx.phase);
  const message = error instanceof Error ? error.message : String(error);
  return new NavigationError({
    code,
    phase: ctx.phase,
    routePattern: ctx.routePattern,
    message,
    cause: error
  });
}
function defaultCodeForPhase(phase) {
  return FAILURE_CODE_BY_PHASE[phase] ?? "INTERNAL";
}
function createViewLoadError(loader, routePattern, cause) {
  return new NavigationError({
    code: "CONTENT_LOAD_FAILED",
    phase: "render",
    routePattern,
    message: `Failed to load ${loader} for route ${routePattern}: ${cause instanceof Error ? cause.message : String(cause)}`,
    cause
  });
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/match/resource-keys.js
function viewKey(match) {
  const suffix = match.route.viewKeySuffix;
  if (!suffix) return null;
  return `view:${identity(match)}|${suffix}`;
}
function resourceKeys(match) {
  const id = identity(match);
  const suffix = match.route.viewKeySuffix;
  return {
    dataKey: `data:${id}`,
    viewKey: suffix ? `view:${id}|${suffix}` : null
  };
}
function viewKeyWithData(base, data) {
  return `${base}|d:${encodeURIComponent(JSON.stringify(data, sortKeys))}`;
}
function identity(match) {
  let out = match.node?.pattern ?? match.pattern;
  const params = encode(match.params);
  if (params) out += `|${params}`;
  const query = encode(match.query);
  if (query) out += `|${query}`;
  return out;
}
function encode(record) {
  if (!record) return "";
  const keys = Object.keys(record);
  const n = keys.length;
  if (!n) return "";
  if (n > 1) keys.sort();
  let encoded = "";
  for (let i = 0; i < n; i++) {
    const key = keys[i];
    const value = record[key];
    if (value == null) continue;
    if (encoded) encoded += "&";
    encoded += `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  }
  return encoded;
}
function sortKeys(_key, value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  const sorted = {};
  for (const key of Object.keys(value).sort()) sorted[key] = value[key];
  return sorted;
}

// node_modules/@auraui/router/dist/modules/aura-utils/async/run-concurrent.js
async function runConcurrent(items, concurrency, run, signal) {
  if (items.length === 0 || signal?.aborted) return;
  const limit = Math.max(1, concurrency);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      if (signal?.aborted) return;
      const item = items[nextIndex++];
      if (item === void 0) return;
      await run(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/view-graph/view-graph.js
var SKIP_RESULT2 = {};
var CANCELLED_RESULT2 = { error: { status: "cancelled" } };
var ViewGraph = class ViewGraph2 {
  static {
    this.defaultCacheOptions = {};
  }
  /** Default `cache.view` options for engine-created graphs. */
  static configure(options = {}) {
    ViewGraph2.defaultCacheOptions = {
      ...ViewGraph2.defaultCacheOptions,
      ...options
    };
  }
  constructor(sharedBuffer, deps = {}) {
    this.registry = deps.registry ?? defaultLoaderRegistry;
    this.sharedBuffer = sharedBuffer;
    this.cache = new AuraResolvableSwrCache({
      ...ENGINE_DEFAULTS.viewCache,
      ...ViewGraph2.defaultCacheOptions,
      ...deps.cache,
      gcSweepInterval: false
    });
  }
  /**
  * Batch enter-route view loads. Routes by {@link ViewLoadOptions.mode}:
  * - `navigation` (default) — parallel {@link loadView}; first `{ error }` wins, partial data dropped
  * - `prefetch` — bounded concurrency / order; soft warmup, returns `{}`
  *
  * Per-route data: pass `options.data` as `(match) => …`.
  */
  async load(matches, signal, options) {
    if (!matches.length) return {};
    if (options?.mode === "prefetch") {
      await this.loadPrefetch(matches, signal, options);
      return {};
    }
    return this.loadNavigation(matches, signal, options);
  }
  /** Navigation batch: unbounded parallel {@link loadView}. */
  async loadNavigation(matches, signal, options) {
    const results = await Promise.all(matches.map((match) => this.loadView(match, signal, options)));
    const error = results.find((result) => result.error)?.error;
    return error ? { error } : { data: results };
  }
  /** Prefetch batch: bounded concurrency + order; swallows per-route failures. */
  loadPrefetch(matches, signal, options) {
    const concurrency = options?.concurrency ?? 3;
    return runConcurrent((options?.order ?? "root-first") === "leaf-first" ? [...matches].reverse() : matches, concurrency, (match) => this.loadView(match, signal, {
      ...options,
      mode: "prefetch"
    }), signal);
  }
  /**
  * Load payload for a matched route (`layout` wins over resolved `view` attr).
  * Single-route entry ({@link ViewResolverPort}). Outcome: `{ data }` / `{ error }` / `{}`.
  */
  loadView(match, signal, options) {
    const descriptor = buildViewDescriptor(match.route, match.resolvedView);
    if (!descriptor) return Promise.resolve(SKIP_RESULT2);
    return this.loadPayload(descriptor, match, signal, options);
  }
  /** Direct resolve bypassing route attrs — tests and explicit descriptor loads. */
  async loadPayload(descriptor, match, interestSignal, options) {
    const mode = options?.mode ?? "navigation";
    const transaction = options?.transaction;
    const data = resolveViewData(match, options?.data);
    if (interestSignal.aborted) return cancelledResult2(mode);
    const key = resolveViewCacheKey(match, data);
    if (!key) return {};
    const useLongCache = descriptor.cache;
    const hit = this.readLongCacheHit(useLongCache, key, interestSignal, mode, transaction);
    if (hit) return hit;
    const waiter = this.sharedBuffer.hold(key, mode);
    try {
      const shared = this.runSharedLoad(match, key, useLongCache, () => this.runViewLoader(descriptor, match, waiter.workSignal, data));
      shared.catch(() => {
      });
      const payload = await awaitUntilAbort(shared, interestSignal);
      if (!isInterestActive2(interestSignal, transaction)) return cancelledResult2(mode);
      return { data: payload };
    } catch (error) {
      return this.toLoadErrorResult(error, match, interestSignal, mode, transaction);
    } finally {
      waiter.release();
    }
  }
  /**
  * Read-only probe: long payload entry exists for `match.viewKey`.
  * No LRU promote, no checkout. Caller decides policy (`cache.view`, layout, …).
  *
  * Used by {@link ../route-tree/can-use-fast-path!canUseViewCacheFastPath}.
  */
  hasCachedView(match) {
    const key = resolveViewCacheKey(match);
    if (!key) return false;
    return this.cache.has(key);
  }
  /**
  * Invalidate long `cache.view` entries ({@link RouterInvalidateOptions}, default policy `stale`).
  * Clears the shared prepare handoff buffer so the next load/prefetch cannot reuse stale settles.
  */
  invalidate(options = {}) {
    const count = invalidateRouterCache(this.cache, options, "stale");
    this.sharedBuffer.clear();
    return count;
  }
  destroy() {
    this.cache.destroy();
  }
  /** Hit on `cache.view` without touching handoff; `undefined` → miss. */
  readLongCacheHit(useLongCache, key, interestSignal, mode, transaction) {
    if (!useLongCache) return void 0;
    const payload = this.cache.get(key);
    if (payload === void 0) return void 0;
    if (!isInterestActive2(interestSignal, transaction)) return cancelledResult2(mode);
    return { data: payload };
  }
  /**
  * Handoff (+ optional long `cache.view`).
  * Factory uses the waiter {@link HandoffWaiter.workSignal}, not caller interest.
  */
  runSharedLoad(match, key, useLongCache, load) {
    return this.sharedBuffer.resolve(key, async () => {
      if (useLongCache) {
        const payload2 = this.cache.get(key);
        if (payload2 !== void 0) return payload2;
      }
      const payload = await load();
      if (useLongCache && typeof payload === "string") this.cache.set(key, payload, {
        gcTime: match.route.cacheTime ?? void 0,
        staleTime: match.route.cacheRefresh ?? void 0
      });
      return payload;
    });
  }
  /**
  * Run the view loader against `workSignal` (shared {@link HandoffWaiter.workSignal}).
  * Abort must **reject** — never settle `null` into handoff (that would poison the TTL window).
  */
  async runViewLoader(descriptor, match, workSignal, data) {
    throwIfAborted(workSignal);
    try {
      return (await this.registry.get(descriptor.loader).load(buildLoadContext(match, descriptor, workSignal, data)))?.value ?? null;
    } catch (error) {
      throwIfAborted(workSignal);
      throw createViewLoadError(descriptor.loader, match.pattern, error);
    }
  }
  async toLoadErrorResult(error, match, interestSignal, mode, transaction) {
    if (mode === "prefetch") return SKIP_RESULT2;
    if (!isInterestActive2(interestSignal, transaction)) return CANCELLED_RESULT2;
    if (transaction) return { error: await transaction.fail(match, error, "render") };
    throw error;
  }
};
function buildViewDescriptor(route, resolvedView) {
  const layout = route.layout.trim();
  if (layout) return {
    kind: "layout",
    loader: "template",
    content: layout,
    cache: false
  };
  if (!resolvedView?.loader) return null;
  const descriptor = {
    kind: "view",
    loader: resolvedView.loader,
    content: resolvedView.content,
    cache: route.cache.view
  };
  return resolvedView.loader === "url" && route.extract ? {
    ...descriptor,
    extract: route.extract
  } : descriptor;
}
function resolveViewData(match, data) {
  return typeof data === "function" ? data(match) : data;
}
function resolveViewCacheKey(match, data) {
  const base = match.viewKey ?? viewKey(match);
  if (!base) return null;
  return data !== void 0 ? viewKeyWithData(base, data) : base;
}
function cancelledResult2(mode) {
  return mode === "prefetch" ? SKIP_RESULT2 : CANCELLED_RESULT2;
}
function isInterestActive2(interestSignal, transaction) {
  return !interestSignal.aborted && (transaction == null || transaction.isActive());
}
function buildLoadContext(match, descriptor, workSignal, data) {
  return {
    content: descriptor.content,
    kind: descriptor.kind,
    signal: workSignal,
    route: {
      href: match.href,
      pattern: match.pattern,
      ...match.params && { params: match.params },
      ...match.query && { query: match.query }
    },
    ...data !== void 0 && { data },
    ...descriptor.extract && { extract: descriptor.extract }
  };
}
function throwIfAborted(signal) {
  if (!signal.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError");
}

// node_modules/@auraui/router/dist/modules/aura-utils/misc/url.js
function stripTrailingSlash(path) {
  if (path.length <= 1) return path;
  return path.endsWith("/") ? path.slice(0, -1) : path;
}
function splitAppHref(href) {
  let parts;
  if (href.startsWith("/") && !href.startsWith("//")) {
    let pathname = href;
    let search = "";
    let hash = "";
    const hashIndex = href.indexOf("#");
    if (hashIndex !== -1) {
      hash = href.slice(hashIndex);
      pathname = href.slice(0, hashIndex);
    }
    const searchIndex = pathname.indexOf("?");
    if (searchIndex !== -1) {
      search = pathname.slice(searchIndex);
      pathname = pathname.slice(0, searchIndex);
    }
    parts = {
      pathname,
      search,
      hash
    };
  } else {
    const { pathname, search, hash } = new URL(href, window.location.origin);
    parts = {
      pathname,
      search,
      hash
    };
  }
  return {
    pathname: stripTrailingSlash(parts.pathname),
    search: parts.search,
    hash: parts.hash
  };
}
function joinAppHref(parts) {
  return parts.pathname + parts.search + parts.hash;
}
function parseSearch(search) {
  if (!search || search === "?") return void 0;
  const params = new URLSearchParams(search);
  if (params.size === 0) return void 0;
  return Object.fromEntries(params);
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/route-tree/resolve-pattern.js
var CATCH_ALL_SEGMENT = /* @__PURE__ */ new Set(["*", "/*"]);
var SCOPED_CATCH_ALL_SUFFIX = "/*";
function normalizeRouteSegment(segment) {
  return segment === "." ? "" : segment;
}
function resolvePattern(parentPattern, segment) {
  segment = normalizeRouteSegment(segment);
  if (CATCH_ALL_SEGMENT.has(segment)) {
    if (!parentPattern || parentPattern === "/") return "*";
    return normalizePath(`${stripTrailingSlash(parentPattern)}${SCOPED_CATCH_ALL_SUFFIX}`);
  }
  if (segment === "") return parentPattern ?? "/";
  if (segment.startsWith("/")) return normalizePath(segment);
  const base = parentPattern ?? "";
  if (!base || base === "/") return normalizePath(`/${segment}`);
  return normalizePath(`${stripTrailingSlash(base)}/${segment}`);
}
function isGlobalCatchAllPattern(pattern) {
  return pattern === "*" || pattern === "/*";
}
function isScopedCatchAllPattern(pattern) {
  return pattern.endsWith(SCOPED_CATCH_ALL_SUFFIX) && !isGlobalCatchAllPattern(pattern);
}
function normalizePath(path) {
  return stripTrailingSlash(path.replace(/\/{2,}/g, "/")) || "/";
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/match/route-score.js
function isParamRoutePattern(pattern) {
  return pattern.includes(":");
}
function isCatchAllRoutePattern(pattern) {
  return isGlobalCatchAllPattern(pattern) || isScopedCatchAllPattern(pattern);
}
function isStaticRoutePattern(pattern) {
  return !isParamRoutePattern(pattern) && !isCatchAllRoutePattern(pattern);
}
function computeMatchScore(pattern) {
  if (isGlobalCatchAllPattern(pattern)) return -1;
  if (isScopedCatchAllPattern(pattern)) return pattern.slice(0, -2).split("/").filter(Boolean).length - 0.5;
  return pattern.split("/").filter(Boolean).length;
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/route-tree/build-route-tree.js
function buildRouteTree(routes) {
  const { rootRoutes, childRoutesByParent } = buildParentChildHierarchy(routes, new Set(routes));
  const nodesByPattern = /* @__PURE__ */ new Map();
  const matchableNodes = [];
  return {
    roots: rootRoutes.map((rootRoute) => buildRouteNode(rootRoute, null, 0, nodesByPattern, matchableNodes, childRoutesByParent)),
    nodesByPattern,
    matchableNodes
  };
}
function buildParentChildHierarchy(routes, knownRoutes) {
  const childRoutesByParent = /* @__PURE__ */ new Map();
  const rootRoutes = [];
  for (const route of routes) {
    const parentRoute = findParentRoute(route, knownRoutes);
    if (parentRoute) {
      let siblings = childRoutesByParent.get(parentRoute);
      if (!siblings) {
        siblings = [];
        childRoutesByParent.set(parentRoute, siblings);
      }
      siblings.push(route);
    } else rootRoutes.push(route);
  }
  return {
    rootRoutes,
    childRoutesByParent
  };
}
function findParentRoute(route, knownRoutes) {
  if (typeof route.parentElement?.closest !== "function") return null;
  const parentRoute = route.parentElement?.closest(AuraRoute.is);
  return parentRoute && knownRoutes.has(parentRoute) ? parentRoute : null;
}
function getDirectChildRoutes(parentRoute, childRoutesByParent) {
  const siblings = childRoutesByParent.get(parentRoute);
  if (siblings?.length) return siblings;
  return queryDirectChildRoutes(parentRoute);
}
function queryDirectChildRoutes(parentRoute) {
  if (typeof parentRoute.querySelectorAll !== "function") return [];
  return Array.from(parentRoute.querySelectorAll(`:scope > ${AuraRoute.is}`));
}
function buildRouteNode(route, parentNode, depth, nodesByPattern, matchableNodes, childRoutesByParent) {
  const segment = normalizeRouteSegment(route.getAttribute("path") ?? "");
  const pattern = resolvePattern(parentNode?.pattern ?? null, segment);
  const existing = nodesByPattern.get(pattern);
  if (existing && !isIndexChildOf(existing, parentNode, segment)) console.warn(`Duplicate route pattern "${pattern}" \u2014 previous route will be overwritten`);
  const node = {
    route,
    segment,
    pattern,
    matchScore: computeMatchScore(pattern),
    parent: parentNode,
    children: [],
    depth,
    isIndex: segment === "",
    branch: []
  };
  node.branch = parentNode ? parentNode.branch.concat(node) : [node];
  nodesByPattern.set(pattern, node);
  for (const childRoute of getDirectChildRoutes(route, childRoutesByParent)) node.children.push(buildRouteNode(childRoute, node, depth + 1, nodesByPattern, matchableNodes, childRoutesByParent));
  registerMatchableNode(node, matchableNodes);
  return node;
}
function isIndexChildOf(existing, parentNode, segment) {
  return segment === "" && parentNode !== null && existing === parentNode;
}
function registerMatchableNode(node, matchableNodes) {
  const hasIndexChild = node.children.some((child) => child.isIndex);
  if (node.children.length === 0 || node.isIndex || !hasIndexChild) matchableNodes.push(node);
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/aura-routing-route-registry.js
var AuraRoutingRouteRegistry = class {
  constructor() {
    this.routes = [];
    this.generation = 0;
    this.roots = [];
    this.nodesByPattern = /* @__PURE__ */ new Map();
    this.matchableNodes = [];
    this.matchablePatterns = [];
  }
  register(routes) {
    this.rebuildSnapshot([...this.routes, ...routes]);
  }
  replace(routes) {
    this.rebuildSnapshot(routes);
  }
  clear() {
    this.generation++;
    this.routes = [];
    this.roots = [];
    this.nodesByPattern.clear();
    this.matchableNodes = [];
    this.matchablePatterns = [];
  }
  get generationId() {
    return this.generation;
  }
  getRootNodes() {
    return this.roots;
  }
  getMatchableNodes() {
    return this.matchableNodes;
  }
  getMatchablePatterns() {
    return this.matchablePatterns;
  }
  getNode(pattern) {
    return this.nodesByPattern.get(pattern);
  }
  getRoute(pattern) {
    return this.nodesByPattern.get(pattern)?.route;
  }
  rebuildSnapshot(routes) {
    this.generation++;
    this.routes = routes;
    const snapshot = buildRouteTree(routes);
    this.roots = snapshot.roots;
    this.nodesByPattern = snapshot.nodesByPattern;
    this.matchableNodes = snapshot.matchableNodes;
    this.matchablePatterns = snapshot.matchableNodes.map((node) => node.pattern);
  }
};

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/events/event-bus.js
var EventBus = class {
  constructor() {
    this.listeners = /* @__PURE__ */ new Set();
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  emit(event) {
    for (const listener of this.listeners) listener(event);
  }
  destroy() {
    this.listeners.clear();
  }
};

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/view-mount/view-commit-state.js
function isViewCommittedForHistory(viewCommit) {
  return viewCommit.view === "committed";
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/failure/navigation-failure.js
var NavigationFailure = class NavigationFailure2 {
  constructor(error, commit, from, to, action) {
    this.error = error;
    this.commit = commit;
    this.from = from;
    this.to = to;
    this.action = action;
  }
  get href() {
    return this.to?.href ?? this.commit.href;
  }
  /** Whether target URL should be written to browser history (`commit.view === 'committed'`). */
  get viewCommitted() {
    return isViewCommittedForHistory(this.commit);
  }
  get isNotFound() {
    return this.to === null && this.error.code === "NOT_FOUND";
  }
  static notFound(href, from, action) {
    return new NavigationFailure2(new NavigationError({
      code: "NOT_FOUND",
      phase: "match",
      routePattern: "*",
      message: `No route matched ${href}`
    }), {
      view: "none",
      href
    }, from, null, action);
  }
  /** Pre-commit redirect chain failure (cycle or max depth). Emits `navigation:error`. */
  static redirectError(code, href, from, action) {
    return new NavigationFailure2(new NavigationError({
      code: code === "redirect-cycle" ? "REDIRECT_CYCLE" : "REDIRECT_DEPTH_EXCEEDED",
      phase: "match",
      routePattern: "*",
      message: code === "redirect-cycle" ? `Redirect cycle detected at ${href}` : `Redirect depth exceeded at ${href}`
    }), {
      view: "none",
      href
    }, from, null, action);
  }
  static fromPipeline(error, commit, from, to, action) {
    return new NavigationFailure2(error, commit, from, to, action);
  }
  toResult() {
    return {
      status: "error",
      failure: this
    };
  }
};

// node_modules/@auraui/router/dist/modules/aura-utils/decorators/bind.js
function bind(_target, methodName, descriptor) {
  if (!descriptor || typeof descriptor.value !== "function") throw new TypeError("Only class methods can be decorated via @bind");
  const originalMethod = descriptor.value;
  return descriptor = {
    enumerable: descriptor.enumerable,
    configurable: true,
    get: function getBoundMethod() {
      const prototypeDescriptor = getPropertyDescriptor(Object.getPrototypeOf(this), methodName);
      if (!prototypeDescriptor || prototypeDescriptor.get !== getBoundMethod) return originalMethod;
      const boundFn = originalMethod.bind(this);
      Object.defineProperty(this, methodName, {
        value: boundFn,
        writable: true,
        configurable: true,
        enumerable: descriptor.enumerable
      });
      return boundFn;
    },
    set(value) {
      Object.defineProperty(this, methodName, {
        value,
        writable: true,
        configurable: true,
        enumerable: descriptor.enumerable
      });
    }
  };
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/history/browser-provider.js
var BrowserHistoryProvider = class {
  constructor() {
    this.listening = false;
  }
  get currentHref() {
    const { pathname, search, hash } = window.location;
    return joinAppHref({
      pathname,
      search,
      hash
    });
  }
  onNavigation(handler) {
    this.handler = handler;
  }
  start() {
    if (this.listening) return;
    this.listening = true;
    window.addEventListener("popstate", this.onPopState);
  }
  stop() {
    if (!this.listening) return;
    this.listening = false;
    window.removeEventListener("popstate", this.onPopState);
  }
  destroy() {
    this.stop();
    this.handler = void 0;
  }
  commit(url, options) {
    if (!options.syncHistory) return;
    if (options.replace) history.replaceState(null, "", url);
    else history.pushState(null, "", url);
  }
  rollback(url) {
    history.replaceState(null, "", url);
  }
  onPopState() {
    this.handler?.({
      href: this.currentHref,
      action: "pop",
      replace: true,
      syncHistory: false
    });
  }
};
__decorate([bind], BrowserHistoryProvider.prototype, "onPopState", null);

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/history/history-policy.js
function resolveErrorHistoryPolicy(code, commit, action, options = {}) {
  if (code === "NOT_FOUND") {
    if (options.syncHistory !== false && (action === "push" || action === "replace")) return "commit-target";
    return "preserve";
  }
  if (isViewCommittedForHistory(commit)) return "commit-target";
  return action === "pop" ? "rollback-source" : "preserve";
}
function resolveHistoryPolicy(result, action, options = {}) {
  switch (result.status) {
    case "navigationSucceeded":
      return options.sameTarget ? "preserve" : "commit-target";
    case "redirect":
      return "preserve";
    case "cancelled":
      return action === "pop" ? "rollback-source" : "preserve";
    case "error":
      return resolveErrorHistoryPolicy(result.failure.error.code, result.failure.commit, action, options);
  }
}
function applyHistoryPolicy(policy, ctx, provider) {
  switch (policy) {
    case "commit-target":
      provider.commit(ctx.href, ctx.options);
      break;
    case "rollback-source":
      if (ctx.fromHref) provider.rollback(ctx.fromHref);
      break;
    case "preserve":
      break;
  }
}
function applyTransactionHistory(result, action, href, fromHref, options, provider, policyOptions = {}) {
  applyHistoryPolicy(resolveHistoryPolicy(result, action, {
    syncHistory: options.syncHistory,
    ...policyOptions
  }), {
    href,
    fromHref,
    options
  }, provider);
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/link-active/app-href.js
function getCurrentAppHref() {
  return joinAppHref({
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash
  });
}
function toDocumentResolutionBase(appHref) {
  const hashIndex = appHref.indexOf("#");
  const base = hashIndex === -1 ? appHref : appHref.slice(0, hashIndex);
  return new URL(base, window.location.origin).href;
}
function resolveDocumentHrefParts(href, baseHref = window.location.href) {
  const { pathname, search, hash } = new URL(href, baseHref);
  const normalizedPathname = stripTrailingSlash(pathname);
  return {
    pathname: normalizedPathname,
    search,
    hash,
    href: joinAppHref({
      pathname: normalizedPathname,
      search,
      hash
    })
  };
}
function resolveDocumentHref(href, baseHref = window.location.href) {
  return resolveDocumentHrefParts(href, baseHref).href;
}
function pathnamesEqual(a, b) {
  if (a === b) return true;
  return stripTrailingSlash(a) === stripTrailingSlash(b);
}
function isSamePathAndSearch(a, b) {
  if (a.search !== b.search) return false;
  return pathnamesEqual(a.pathname, b.pathname);
}
function isHashOnlyChange(next, current, options) {
  if (!isSamePathAndSearch(next, current)) return false;
  if (!next.hash || next.hash === current.hash) return false;
  if (options?.requireExistingHash && !current.hash) return false;
  return true;
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/route-tree/resolved-view.js
var PARAM_PLACEHOLDER = /\{\{(\w+)\}\}/g;
function resolveContent(content, params) {
  if (!params || !content.includes("{{")) return content;
  return content.replace(PARAM_PLACEHOLDER, (_, name) => params[name] ?? `{{${name}}}`);
}
function resolveView(view, params) {
  const content = resolveContent(view.content, params);
  return {
    loader: view.loader,
    content,
    viewKey: `${view.loader}:${content}`
  };
}
function attachResolvedView(leaf) {
  if (leaf.resolvedView !== void 0) return;
  const route = leaf.route;
  if (route?.layout?.trim()) {
    leaf.resolvedView = null;
    return;
  }
  const view = route?.view;
  leaf.resolvedView = view?.loader && view.content ? resolveView(view, leaf.params) : null;
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/route-tree/matched-chain.js
function routeMatchKey(info) {
  return info.node?.pattern ?? info.pattern;
}
function isSameRouteMatch(a, b) {
  if (a.node && b.node) return a.node === b.node;
  return a.pattern === b.pattern && a.route === b.route;
}
function getActiveChain(info) {
  if (info.chain?.length) return info.chain;
  return [info];
}
function getLeafMatch(info) {
  const chain = getActiveChain(info);
  return chain[chain.length - 1];
}
function syncChainHref(info, href, hash) {
  for (const entry of getActiveChain(info)) {
    entry.href = href;
    entry.hash = hash;
  }
}
function buildActiveChain(leaf, base, resolveParams) {
  const chain = leaf.branch.map((node, index) => {
    const isLeaf = index === leaf.branch.length - 1;
    const params = isLeaf ? base.params : resolveParams(base.pathname, node.pattern) ?? void 0;
    return {
      href: base.href,
      pathname: base.pathname,
      search: base.search,
      hash: base.hash,
      pattern: node.pattern,
      route: node.route,
      node,
      ...params && Object.keys(params).length > 0 && { params },
      ...isLeaf && base.query && Object.keys(base.query).length > 0 && { query: base.query }
    };
  });
  for (const info of chain) info.chain = chain;
  const leafInfo = chain[chain.length - 1];
  attachResolvedView(leafInfo);
  return leafInfo;
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/match/url-matcher.js
var AuraRoutingUrlMatcher = class {
  constructor() {
    this.urlPatterns = /* @__PURE__ */ new Map();
    this.matchIndexByNodes = /* @__PURE__ */ new WeakMap();
  }
  /**
  * Best match among `matchableNodes`.
  *
  * A static hit is the baseline; a dynamic candidate wins only with a **higher**
  * `matchScore` (on a tie the static match is kept).
  *
  * Memoized by pathname — call {@link destroy} after the route tree changes.
  *
  * @param pathname - Browser pathname (no search/hash).
  * @param nodes - Usually `routeTree.matchableNodes`.
  * @returns Winning node + params, or `null` if nothing matched.
  */
  matchPath(pathname, nodes) {
    const { exact, rest } = this.getMatchIndex(nodes);
    let bestNode = exact.get(pathname) ?? null;
    let bestParams = {};
    let bestScore = bestNode?.matchScore ?? -Infinity;
    for (const node of rest) {
      const params = this.getPathParams(pathname, node.pattern);
      if (params === null || node.matchScore <= bestScore) continue;
      bestNode = node;
      bestParams = params;
      bestScore = node.matchScore;
    }
    return bestNode ? {
      node: bestNode,
      params: bestParams
    } : null;
  }
  /**
  * Leaf {@link MatchedRouteInfo} + nested `chain` from `node.branch`.
  *
  * Ancestor params via {@link getPathParams}; resource keys via {@link resourceKeys}.
  *
  * @param href - Relative href (`pathname + search + hash`).
  * @param pathname - Browser pathname.
  * @param search - Raw search including `?`, or `''`.
  * @param hash - Raw hash including `#`, or `''`.
  * @param node - Leaf node from {@link matchPath}.
  * @param params - Path params for the leaf (usually from {@link matchPath}).
  */
  buildMatchedRouteInfo(href, pathname, search, hash, node, params) {
    const leaf = buildActiveChain(node, {
      href,
      pathname,
      search,
      hash,
      params,
      query: parseSearch(search)
    }, (targetPathname, targetPattern) => this.getPathParams(targetPathname, targetPattern));
    for (const info of getActiveChain(leaf)) {
      const keys = resourceKeys(info);
      info.dataKey = keys.dataKey;
      info.viewKey = keys.viewKey;
    }
    return leaf;
  }
  /**
  * Path params for `(pathname, pattern)`, or `null` if the pattern does not match.
  *
  * Check order: global `*` → scoped `/*` → static `===` → `:param` (URLPattern).
  *
  * @param pathname - Browser pathname.
  * @param pattern - Route pattern (`node.pattern`).
  */
  getPathParams(pathname, pattern) {
    if (isGlobalCatchAllPattern(pattern)) return { splat: pathname.startsWith("/") ? pathname.slice(1) : pathname };
    if (isScopedCatchAllPattern(pattern)) return getScopedCatchAllParams(pathname, pattern);
    if (isStaticRoutePattern(pattern)) return pathname === pattern ? {} : null;
    return this.getUrlPatternParams(pathname, pattern);
  }
  /**
  * Clears memoized `matchPath` and compiled `URLPattern` caches.
  * Call when the route tree is replaced or destroyed.
  */
  destroy() {
    memoize.clear(this, "matchPath");
    this.urlPatterns.clear();
  }
  /**
  * Static O(1) map + dynamic `rest` list for `nodes`.
  * Cached by array identity (`WeakMap`); a new `nodes` reference rebuilds the index.
  */
  getMatchIndex(nodes) {
    const cached = this.matchIndexByNodes.get(nodes);
    if (cached) return cached;
    const exact = /* @__PURE__ */ new Map();
    const rest = [];
    for (const node of nodes) if (isStaticRoutePattern(node.pattern)) exact.set(node.pattern, node);
    else rest.push(node);
    const index = {
      exact,
      rest
    };
    this.matchIndexByNodes.set(nodes, index);
    return index;
  }
  /**
  * Params via compiled {@link URLPattern} for `:param` patterns.
  * On compile/exec failure, falls back to static `pathname === pattern`.
  */
  getUrlPatternParams(pathname, pattern) {
    try {
      const result = this.getUrlPattern(pattern).exec({ pathname });
      if (!result) return null;
      const params = {};
      for (const [key, value] of Object.entries(result.pathname.groups)) if (value !== void 0) params[key] = value;
      return params;
    } catch {
      return pathname === pattern ? {} : null;
    }
  }
  /** Compiled `URLPattern` for `pattern` (cached in `urlPatterns`). */
  getUrlPattern(pattern) {
    let compiled = this.urlPatterns.get(pattern);
    if (!compiled) {
      compiled = new URLPattern({ pathname: pattern });
      this.urlPatterns.set(pattern, compiled);
    }
    return compiled;
  }
};
__decorate([memoize((pathname) => pathname)], AuraRoutingUrlMatcher.prototype, "matchPath", null);
function getScopedCatchAllParams(pathname, pattern) {
  const prefix = pattern.slice(0, -1);
  if (!pathname.startsWith(prefix)) return null;
  const splat = pathname.slice(prefix.length);
  return splat ? { splat } : null;
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/route-tree/can-use-fast-path.js
function hasFastPathLifecycleGates(enter, exit) {
  if (exit?.hasLeave || enter.hasGuard || enter.hasTransitionIn) return false;
  if (exit?.hasReady || enter.hasReady) return false;
  if (enter.transition.order != null || exit?.transition.order != null) return false;
  return true;
}
function canUseDomCacheFastPath(plan) {
  if (plan.canUseFastPath || !plan.isFlatSingleEnter) return false;
  const enter = plan.enterRoute;
  const exit = plan.exitRoute;
  const enterMatch = plan.enterMatch;
  if (!enter || !enterMatch) return false;
  if (!enter.cache?.dom || enter.hasLoad) return false;
  if (!hasFastPathLifecycleGates(enter, exit)) return false;
  return defaultDomCache.has(domCacheKey(enterMatch, enter.path));
}
function canUseViewCacheFastPath(plan, viewGraph) {
  if (plan.canUseFastPath || !plan.isFlatSingleEnter) return false;
  const enter = plan.enterRoute;
  const exit = plan.exitRoute;
  const enterMatch = plan.enterMatch;
  if (!enter || !enterMatch) return false;
  if (!enter.cache?.view || enter.hasLoad || enter.hasLayout || enter.viewLoaderNeedsData) return false;
  if (!hasFastPathLifecycleGates(enter, exit)) return false;
  return viewGraph.hasCachedView(enterMatch);
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/route-tree/branch-diff.js
function findBranchLcaIndex(fromChain, toChain) {
  const limit = Math.min(fromChain.length, toChain.length);
  let lcaIndex = -1;
  for (let i = 0; i < limit; i++) {
    if (routeMatchKey(fromChain[i]) !== routeMatchKey(toChain[i])) break;
    lcaIndex = i;
  }
  return lcaIndex;
}
function buildExitRoutes(fromChain, lcaIndex) {
  if (lcaIndex < 0) return fromChain.slice().reverse();
  return fromChain.slice(lcaIndex + 1).reverse();
}
function buildEnterRoutes(toChain, lcaIndex) {
  if (lcaIndex < 0) return toChain.slice();
  return toChain.slice(lcaIndex + 1);
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/route-tree/transition-plan.js
function buildTransitionPlan(from, to) {
  if (!from) return finalizeTransitionPlan({
    exitRoutes: [],
    enterRoutes: getActiveChain(to),
    lca: null,
    update: false
  });
  const fromLeaf = getLeafMatch(from);
  const toLeaf = getLeafMatch(to);
  if (isSameRouteMatch(fromLeaf, toLeaf)) return buildSameRecordPlan(fromLeaf, toLeaf);
  const fromChain = getActiveChain(from);
  const toChain = getActiveChain(to);
  const lcaIndex = findBranchLcaIndex(fromChain, toChain);
  return finalizeTransitionPlan({
    exitRoutes: buildExitRoutes(fromChain, lcaIndex),
    enterRoutes: buildEnterRoutes(toChain, lcaIndex),
    lca: lcaIndex >= 0 ? fromChain[lcaIndex] : null,
    update: false
  });
}
function resolveParamChangeMode(fromLeaf, toLeaf) {
  const mode = toLeaf.route.paramChange;
  if (mode === "navigate") return "navigate";
  const fromKey = fromLeaf.resolvedView?.viewKey ?? null;
  const toKey = toLeaf.resolvedView?.viewKey ?? null;
  if (mode === "update") {
    if (fromKey && toKey && fromKey !== toKey) console.warn(`[aura-router] param-change="update" with different viewKey (${fromKey} \u2192 ${toKey}): UPDATE shortcut skips render \u2014 stale HTML risk. Omit param-change or use param-change="navigate".`);
    return "update";
  }
  if (fromKey === null || toKey === null) return "update";
  return fromKey === toKey ? "update" : "navigate";
}
function buildSameRecordPlan(fromLeaf, toLeaf) {
  if (resolveParamChangeMode(fromLeaf, toLeaf) === "update") return finalizeTransitionPlan({
    exitRoutes: [],
    enterRoutes: [toLeaf],
    lca: toLeaf,
    update: true
  });
  const chain = getActiveChain(fromLeaf);
  const parentIndex = chain.length - 2;
  return finalizeTransitionPlan({
    exitRoutes: [fromLeaf],
    enterRoutes: [toLeaf],
    lca: parentIndex >= 0 ? chain[parentIndex] : null,
    update: false,
    paramChangeRemount: true
  });
}
function isSameNavigationTarget(from, to) {
  if (!isSamePathAndSearch(from, to)) return false;
  return isSameRouteMatch(getLeafMatch(from), getLeafMatch(to));
}
function finalizeTransitionPlan(base) {
  const enterMatch = base.enterRoutes[base.enterRoutes.length - 1];
  const exitMatch = base.exitRoutes[0];
  const enterRoute = enterMatch?.route;
  const exitRoute = exitMatch?.route;
  const hasExitLeave = base.exitRoutes.some((matched) => matched.route.hasLeave);
  const hasEnterGuard = base.enterRoutes.some((matched) => matched.route.hasGuard);
  const isFlatSingleEnter = !base.update && !base.paramChangeRemount && base.enterRoutes.length === 1 && base.exitRoutes.length <= 1;
  const transitionOrder = enterRoute?.transition.order ?? null;
  const canUseFastPath = isFlatSingleEnter && !!enterRoute && enterRoute.hasSyncContent && hasFastPathLifecycleGates(enterRoute, exitRoute);
  return {
    ...base,
    enterMatch,
    exitMatch,
    enterRoute,
    exitRoute,
    transitionOrder,
    hasExitLeave,
    hasEnterGuard,
    needsBlockingWalk: hasExitLeave || hasEnterGuard,
    isFlatSingleEnter,
    canUseFastPath
  };
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/view-mount/view-commit-tracker.js
var ViewCommitTracker = class {
  constructor(href) {
    this._view = "none";
    this.href = href;
  }
  /** Current view mount state + {@link href} — read at transaction terminal (especially on error). */
  get snapshot() {
    return {
      view: this._view,
      href: this.href
    };
  }
  /** After successful `runViewCommit` on the enter branch (view staged, not yet promoted). */
  markViewStaged() {
    this._view = "staged";
  }
  /** After `commitStagedView()` on enter routes (happy-path terminal commit). */
  markViewCommitted() {
    this._view = "committed";
  }
  /** Whether view state reached a terminal committed snapshot for this transaction. */
  isViewCommitted() {
    return this._view === "committed";
  }
  /**
  * Render failed but error UI mounted on target (after exit `left` cleanup).
  * History and error callbacks treat navigation as user-visible on target URL.
  */
  markViewCommittedAfterErrorRecovery() {
    this._view = "committed";
  }
};

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/view-mount/view-mount-rollback.js
function collectTransactionRoutes(plan) {
  const seen = /* @__PURE__ */ new Set();
  const routes = [];
  for (const matched of [...plan.enterRoutes, ...plan.exitRoutes]) {
    if (seen.has(matched.route)) continue;
    seen.add(matched.route);
    routes.push(matched.route);
  }
  return routes;
}
function rollbackUncommittedViews(plan, viewCommitTracker) {
  if (viewCommitTracker.isViewCommitted()) return;
  for (const route of collectTransactionRoutes(plan)) route.revertInFlightView?.();
}

// node_modules/@auraui/router/dist/modules/aura-utils/async/is-thenable.js
function isThenable(value) {
  return value != null && typeof value.then === "function";
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/view-mount/view-commit-render.js
function isRenderError(result) {
  return typeof result === "object" && result !== null && result.status === "error";
}
async function runViewCommit(matchedRoute, cancellation, options) {
  if (cancellation.isAborted()) return "aborted";
  const result = await matchedRoute.route.resolveAndMountView(matchedRoute, {
    parentSignal: cancellation.signal,
    ...options
  });
  if (cancellation.isAborted()) return "aborted";
  if (isRenderError(result)) return result;
  return "ok";
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/view-mount/branch-mount.js
function mountEnterBranch(enterRoutes, viewSnapshot, ctx) {
  if (ctx.aborted()) return { status: "aborted" };
  if (viewSnapshot.length !== enterRoutes.length) return {
    status: "error",
    error: /* @__PURE__ */ new Error(`Branch mount: expected ${enterRoutes.length} view payloads, got ${viewSnapshot.length}`),
    route: enterRoutes[0]
  };
  for (let i = 0; i < enterRoutes.length; i++) {
    const matchedRoute = enterRoutes[i];
    const data = ctx.dataSnapshot ? resolveRouteData(ctx.dataSnapshot, matchedRoute) : void 0;
    const options = {
      parentSignal: ctx.signal,
      preResolvedView: viewSnapshot[i],
      ...data !== void 0 && { data },
      ...ctx.paramChangeRemount ? { paramChangeRemount: true } : {}
    };
    const result = matchedRoute.route.mountResolvedView(matchedRoute, options);
    if (result === "aborted" || ctx.aborted()) {
      rollbackMounted(enterRoutes, i);
      return { status: "aborted" };
    }
    if (isRenderError(result)) {
      rollbackMounted(enterRoutes, i);
      return {
        status: "error",
        error: result.error,
        route: matchedRoute
      };
    }
  }
  return { status: "ok" };
}
function rollbackMounted(enterRoutes, failedIndex) {
  for (let i = failedIndex - 1; i >= 0; i--) enterRoutes[i].route.revertInFlightView?.();
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/navigation/navigation-transaction-pipeline.js
var NavigationTransactionPipeline = class {
  /**
  * @param transaction — active navigation; must have `transitionPlan` set before any `run*` call
  */
  constructor(transaction) {
    this.transaction = transaction;
  }
  get pulse() {
    return this.transaction.engine.pulse;
  }
  /**
  * Standard navigation pipeline.
  *
  * Order: prepare (`leave` → `guard` → history → loads) → render → {@link runAfterRender}.
  * Fast path skips prepare markers. `prepare:end` runs only if prepare steps all return `null`.
  *
  * @returns first terminal step result (`error`, `redirect`, `cancelled`), or `navigationSucceeded` when all steps return `null`
  */
  async runFullPipeline() {
    const tx = this.transaction;
    return await this.runSequentially([
      () => (this.pulse.prepareStart(tx), null),
      ...tx.skipBlockingPhases ? [] : [() => this.runGuards()],
      () => this.commitHistory(),
      () => this.runLoads(),
      () => (this.pulse.prepareEnd(tx), null),
      () => this.runRenderWithTransition(),
      () => this.runAfterRender()
    ]) ?? { status: "navigationSucceeded" };
  }
  /**
  * Fast path — view swap only (sync content, `cache.dom` hit, or warm `cache.view`).
  *
  * Skips guards, data loads, and transition phases. Commits history synchronously, runs a single
  * {@link runViewCommit} on the sole enter route, then {@link runAfterRender}.
  *
  * Selected by {@link TransitionMap.canUseFastPath},
  * {@link ../route-tree/can-use-fast-path!canUseDomCacheFastPath}, or
  * {@link ../route-tree/can-use-fast-path!canUseViewCacheFastPath}.
  *
  * @returns `cancelled` on abort/supersede; render errors via {@link failRender}; otherwise {@link runAfterRender} result or `navigationSucceeded`
  */
  async runFastPipeline() {
    this.commitHistory();
    const enterMatch = this.transaction.transitionPlan.enterMatch;
    const viewCommit = await runViewCommit(enterMatch, {
      signal: this.transaction.signal,
      isAborted: () => !this.transaction.isActive()
    });
    if (viewCommit === "ok") this.transaction.viewCommitTracker.markViewStaged();
    if (viewCommit === "aborted" || !this.transaction.isActive()) return { status: "cancelled" };
    if (isRenderError(viewCommit)) return this.failRender(enterMatch, viewCommit.error);
    return await this.runAfterRender() ?? { status: "navigationSucceeded" };
  }
  /**
  * In-place update on the same route record (param/query change).
  *
  * Order: history commit → {@link runLoads} → `update` lifecycle phase →
  * {@link NavigationTransaction.commitNavigation} (no guards, render, `unmount`, or `ready`).
  *
  * @returns terminal result from loads/update (`error`, `redirect`, `cancelled`), or `navigationSucceeded`
  */
  async runUpdate() {
    const tx = this.transaction;
    const stepResult = await this.runSequentially([
      () => (this.pulse.prepareStart(tx), null),
      () => this.commitHistory(),
      () => this.runLoads(),
      () => (this.pulse.prepareEnd(tx), null),
      () => this.runLifecyclePhase(PHASES.update)
    ]);
    if (stepResult) return stepResult;
    if (!tx.isActive()) return { status: "cancelled" };
    this.pulse.commitStart(tx);
    tx.commitNavigation();
    return { status: "navigationSucceeded" };
  }
  /**
  * History: write URL (when needed), then URL-aligned chrome sync.
  *
  * {@link AuraRoutingEngine.commitHistoryIfNeeded} →
  * {@link AuraRoutingEngine.notifyUrlAligned} → {@link NavigationPulse.alignUrl}
  */
  commitHistory() {
    const tx = this.transaction;
    tx.engine.commitHistoryIfNeeded(tx);
    tx.engine.notifyUrlAligned(tx);
    return null;
  }
  /**
  * Blocking pre-render lifecycle phases on exit and enter branches.
  *
  * Order: `leave` (exit routes) → `guard` (enter routes). Redirect or hook failure
  * stops the pipeline before loads/render.
  */
  runGuards() {
    return this.runSequentially([() => this.runLifecyclePhase(PHASES.leave), () => this.runLifecyclePhase(PHASES.guard)]);
  }
  /**
  * Blocking data load for the enter branch.
  *
  * Runs after history commit and before render. Emits {@link NavigationPulse.loadStart} /
  * {@link NavigationPulse.loadEnd}; delegates to `engine.resourceGraph.load`; stores
  * the resulting snapshot on the transaction for view commit and lifecycle hooks.
  *
  * Loading chrome (`showLoading` / `hideLoading`) wraps the true wait window.
  *
  * `activeChain` is the full target branch (`to.chain`) when present, otherwise enter routes.
  */
  async runLoads() {
    const tx = this.transaction;
    const enterRoutes = tx.transitionPlan.enterRoutes;
    const branch = tx.to.chain ?? enterRoutes;
    this.showEnterLoading(enterRoutes);
    try {
      this.pulse.loadStart(tx, enterRoutes);
      const { error, data, view } = await tx.engine.resourceGraph.load(enterRoutes, {
        branch,
        transaction: tx
      });
      data && (tx.dataSnapshot = data);
      view && (tx.viewSnapshot = view);
      this.pulse.loadEnd(tx, enterRoutes, error, tx.to);
      return error ?? null;
    } finally {
      this.hideEnterLoading(enterRoutes);
    }
  }
  /** Per enter-route loading chrome on (template / body class / events). */
  showEnterLoading(routes) {
    for (let i = 0; i < routes.length; i++) {
      const match = routes[i];
      match.route.showLoading?.(match);
    }
  }
  /** Per enter-route loading chrome off. */
  hideEnterLoading(routes) {
    for (let i = 0; i < routes.length; i++) routes[i].route.hideLoading?.();
  }
  async runSpeculativePrepare() {
    const { to, transitionPlan, engine } = this.transaction;
    const enterRoutes = transitionPlan.enterRoutes;
    await engine.resourceGraph.load(enterRoutes, {
      branch: to.chain ?? enterRoutes,
      transaction: this.transaction
    });
  }
  /**
  * Render enter branch without `transition-order` interleaving.
  *
  * @internal Test and diagnostic entry — production uses {@link runRenderWithTransition}.
  */
  async runRender() {
    return this.renderEnterBranch(null);
  }
  /**
  * Render enter branch with `transition-order` from the enter leaf
  * ({@link TransitionMap.transitionOrder}).
  */
  async runRenderWithTransition() {
    return this.renderEnterBranch(this.transaction.transitionPlan.transitionOrder);
  }
  /**
  * Commit enter-branch DOM with `transition-order` from the enter leaf.
  *
  * Content must already be on `transaction.viewSnapshot` ({@link runLoads}).
  *
  * | transition-order | step sequence |
  * |------------------|---------------|
  * | `null`           | commit |
  * | `out-in`         | transitionOut → commit → transitionIn |
  * | `parallel`       | commit → transitionOut ∥ transitionIn |
  * | `in-out`         | commit → transitionIn → transitionOut |
  *
  * @param transitionOrder — enter leaf `transition-order`, or `null` when absent
  */
  renderEnterBranch(transitionOrder) {
    if (transitionOrder === null) return this.commitEnterBranchToDom();
    if (transitionOrder === "out-in") return this.runSequentially([
      () => this.runLifecyclePhase(PHASES.transitionOut),
      () => this.commitEnterBranchToDom(),
      () => this.runLifecyclePhase(PHASES.transitionIn)
    ]);
    if (transitionOrder === "parallel") return this.runSequentially([() => this.commitEnterBranchToDom(), () => this.runTransitionOutInParallel()]);
    if (transitionOrder === "in-out") return this.runSequentially([
      () => this.commitEnterBranchToDom(),
      () => this.runLifecyclePhase(PHASES.transitionIn),
      () => this.runLifecyclePhase(PHASES.transitionOut)
    ]);
    return null;
  }
  /**
  * Runs `transition-out` and `transition-in` concurrently.
  *
  * After both settle: `cancelled` if inactive; otherwise `transitionOut` outcome, else `transitionIn`,
  * else `null`.
  */
  async runTransitionOutInParallel() {
    const [transitionOutOutcome, transitionInOutcome] = await Promise.all([this.runLifecyclePhase(PHASES.transitionOut), this.runLifecyclePhase(PHASES.transitionIn)]);
    if (!this.transaction.isActive()) return { status: "cancelled" };
    return transitionOutOutcome ?? transitionInOutcome ?? null;
  }
  /**
  * Atomic render: sync-mount {@link NavigationTransaction.viewSnapshot} into the DOM.
  * Clears the snapshot after read. Missing snapshot → `cancelled`.
  */
  commitEnterBranchToDom() {
    const viewSnapshot = this.transaction.viewSnapshot;
    this.transaction.viewSnapshot = void 0;
    if (!viewSnapshot) return { status: "cancelled" };
    const tx = this.transaction;
    const mountResult = mountEnterBranch(tx.transitionPlan.enterRoutes, viewSnapshot, {
      signal: tx.signal,
      aborted: () => !tx.isActive(),
      paramChangeRemount: tx.transitionPlan.paramChangeRemount === true,
      dataSnapshot: tx.dataSnapshot
    });
    if (mountResult.status === "aborted" || !tx.isActive()) return { status: "cancelled" };
    if (mountResult.status === "error") return this.failRender(mountResult.route, mountResult.error);
    tx.viewCommitTracker.markViewStaged();
    return null;
  }
  /**
  * Post-render finalization after staged views are in the DOM.
  *
  * Order: `unmount` (exit branch) → **commit slice**
  * ({@link NavigationPulse.commitStart} → `commitStagedView` × enter →
  * {@link NavigationTransaction.commitNavigation} → {@link NavigationPulse.commitEnd})
  * → `ready` (enter branch).
  *
  * **Invariant:** the commit slice is synchronous — no `await` between the last
  * `commitStagedView` and `commitNavigation`. `unmount` / `ready` may suspend; that is
  * outside the slice. See class JSDoc and `core/ARCHITECTURE.md` § Commit Vocabulary.
  *
  * Param-change remount follows the same sequence globally for successful navigations.
  */
  async runAfterRender() {
    if (!this.transaction.isActive()) return { status: "cancelled" };
    const unmountOutcome = await this.runLifecyclePhase(PHASES.unmount);
    if (unmountOutcome) return unmountOutcome;
    if (!this.transaction.isActive()) return { status: "cancelled" };
    this.pulse.commitStart(this.transaction);
    for (const matchedRoute of this.transaction.transitionPlan.enterRoutes) matchedRoute.route.commitStagedView?.();
    this.transaction.commitNavigation();
    return this.runLifecyclePhase(PHASES.ready);
  }
  /**
  * Runs one registered lifecycle phase on every route in its target branch.
  *
  * Target routes come from `transitionPlan[phaseDef.targetRoutes]` (e.g. `exitRoutes`,
  * `enterRoutes`). Blocking phases may return `redirect` / `cancelled`; failures use
  * {@link NavigationTransaction.fail}.
  *
  * @param phaseDef — entry from {@link PHASES} registry
  * @returns first terminal result, or `null` when all routes complete successfully
  */
  async runLifecyclePhase(phaseDef) {
    const matchedRoutes = this.transaction.transitionPlan[phaseDef.targetRoutes];
    for (const matchedRoute of matchedRoutes) {
      const result = await NavigationTransactionPipelinePhase.run(matchedRoute, phaseDef, this.transaction);
      if (NavigationTransactionPipelinePhase.isRoutePhaseFailure(result)) return this.transaction.fail(matchedRoute, result.error, result.phase);
      if (result) return result;
    }
    return null;
  }
  /**
  * Render failure recovery: unmount exit branch, mark view committed after error recovery,
  * then delegate to {@link NavigationTransaction.fail} with phase `'render'`.
  */
  async failRender(matchedRoute, error) {
    await this.runLifecyclePhase(PHASES.unmount);
    this.transaction.viewCommitTracker.markViewCommittedAfterErrorRecovery();
    return this.transaction.fail(matchedRoute, error, "render");
  }
  /**
  * Runs pipeline steps in order until one returns a terminal result or the transaction is inactive.
  *
  * Thenable-aware: sync step results continue without an extra microtask tick; only Promises are awaited.
  *
  * @param steps — ordered step functions (sync or async)
  * @returns first non-`null` step result, `cancelled` if inactive before/during a step, or `null`
  */
  async runSequentially(steps) {
    for (const step of steps) {
      if (!this.transaction.isActive()) return { status: "cancelled" };
      let stepResult = step();
      if (isThenable(stepResult)) stepResult = await stepResult;
      if (stepResult) return stepResult;
    }
    return null;
  }
};

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/navigation/pipeline-failure.js
async function handlePipelineFailure(route, error, atPhase, context) {
  const normalized = normalizeNavigationError(error, {
    phase: atPhase,
    routePattern: route.pattern
  });
  const failed = NavigationFailure.fromPipeline(normalized, context.viewCommitTracker.snapshot, context.transaction.from, context.transaction.to, context.transaction.action);
  await NavigationTransactionPipelinePhase.runError(route, normalized, failed, context);
  return failed.toResult();
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/navigation/navigation-transaction.js
var NavigationTransaction = class NavigationTransaction2 {
  constructor(transactionId, options, isTransactionStale, engine) {
    this.historyCommitted = false;
    this.transactionId = transactionId;
    this.from = options.from;
    this.to = options.to;
    this.href = options.href;
    this.hash = options.hash;
    this.action = options.action;
    this.historyOptions = options.options;
    this.skipBlockingPhases = options.skipBlockingPhases ?? false;
    this.abortController = new AbortController();
    this.signal = this.abortController.signal;
    this.isStale = () => isTransactionStale(transactionId);
    this.engine = engine;
    this.phaseMode = options.phaseMode ?? "navigation";
    this.viewCommitTracker = new ViewCommitTracker(options.to.href);
  }
  get isAborted() {
    return this.signal.aborted;
  }
  /** Async work after await must stop when aborted or superseded by a newer transaction. */
  isActive() {
    return !this.isAborted && !this.isStale();
  }
  cancel(reason) {
    if (!this.signal.aborted) this.abortController.abort(reason);
  }
  /** View success gate: `prev` + tracker (URL was written earlier in the pipeline). */
  commitNavigation() {
    this.engine.commitNavigation(this);
    this.viewCommitTracker.markViewCommitted();
  }
  /**
  * Build transition plan, {@link NavigationPulse.begin}, then full / update / fast pipeline.
  */
  async run() {
    this.transitionPlan = buildTransitionPlan(this.from, this.to);
    this.engine.pulse.begin(this);
    return this.runWithStagedViewRollback(() => {
      const pipeline = new NavigationTransactionPipeline(this);
      return this.transitionPlan.update ? pipeline.runUpdate() : this.transitionPlan.canUseFastPath || canUseDomCacheFastPath(this.transitionPlan) || canUseViewCacheFastPath(this.transitionPlan, this.engine.viewGraph) ? pipeline.runFastPipeline() : pipeline.runFullPipeline();
    });
  }
  /** Pre-commit blocking walk for {@link ../redirect/redirect-resolver!followRedirectsWithGuardWalk}: `leave` → `guard` via {@link NavigationTransactionPipeline.runGuards}. */
  async runRedirectCollapse() {
    if (!this.transitionPlan) this.transitionPlan = buildTransitionPlan(this.from, this.to);
    return new NavigationTransactionPipeline(this).runGuards();
  }
  async runSpeculativePrepare() {
    this.transitionPlan = buildTransitionPlan(this.from, this.to);
    return new NavigationTransactionPipeline(this).runSpeculativePrepare();
  }
  async fail(route, error, atPhase) {
    return !this.isActive() ? { status: "cancelled" } : handlePipelineFailure(route, error, atPhase, NavigationTransaction2.createTransactionContext(this));
  }
  /** Builds engine orchestration context for one navigation transaction. */
  static createTransactionContext(transaction) {
    const { transactionId, signal, from, to, action, transitionPlan } = transaction;
    return {
      transaction: {
        from,
        to,
        action,
        plan: transitionPlan
      },
      transactionId,
      transactionSignal: signal,
      router: transaction.engine.router,
      hookRegistry: transaction.engine.hooksRegistry,
      viewCommitTracker: transaction.viewCommitTracker,
      isJobActive: () => transaction.isActive(),
      ...transaction.dataSnapshot && { dataSnapshot: transaction.dataSnapshot },
      reportHookError: (hookError, parent) => {
        transaction.engine.reportNavigationHookError(hookError, parent);
      }
    };
  }
  async runWithStagedViewRollback(runPipeline) {
    const rollbackStagedViews = () => {
      rollbackUncommittedViews(this.transitionPlan, this.viewCommitTracker);
    };
    this.signal.addEventListener("abort", rollbackStagedViews, { once: true });
    let result;
    try {
      result = await runPipeline();
      return result ?? { status: "navigationSucceeded" };
    } finally {
      this.signal.removeEventListener("abort", rollbackStagedViews);
      if (this.shouldRollbackAfterRun(result)) rollbackStagedViews();
    }
  }
  shouldRollbackAfterRun(result) {
    if (this.viewCommitTracker.isViewCommitted()) return false;
    if (this.isAborted) return false;
    return result?.status === "cancelled";
  }
};

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/match/canonical-index-href.js
function applyCanonicalIndexFolderHref(pathname, search, hash, node) {
  let canonicalPathname = pathname;
  if (node.isIndex && node.parent && pathname !== "/") canonicalPathname = pathname.endsWith("/") ? pathname : `${pathname}/`;
  return {
    pathname: canonicalPathname,
    href: joinAppHref({
      pathname: canonicalPathname,
      search,
      hash
    })
  };
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/redirect/match-step.js
function resolveRedirectHref(node, rawTarget) {
  return resolveDocumentHrefParts(resolvePattern(node.parent?.pattern ?? null, rawTarget.trim())).href;
}
function lookupNavigationStep(matcher, href, nodes, preservedSearch, preservedHash) {
  const { pathname } = resolveDocumentHrefParts(href);
  const found = matcher.matchPath(stripTrailingSlash(pathname), nodes);
  if (!found) return null;
  if (found.node.route.type === "redirect") return {
    kind: "redirect",
    href: resolveRedirectHref(found.node, found.node.route.redirect)
  };
  const canonical = applyCanonicalIndexFolderHref(pathname, preservedSearch, preservedHash, found.node);
  return {
    ...matcher.buildMatchedRouteInfo(canonical.href, canonical.pathname, preservedSearch, preservedHash, found.node, found.params),
    kind: "matched",
    viaRedirect: false
  };
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/redirect/redirect-resolver.js
function navigationVisitKey(href) {
  return stripTrailingSlash(resolveDocumentHrefParts(href).pathname);
}
function createRedirectionContext(href, replace = false) {
  const originalUrlParts = typeof href === "string" ? resolveDocumentHrefParts(href) : href;
  return {
    originalUrlParts,
    stepHref: originalUrlParts.href,
    visitedPathnames: /* @__PURE__ */ new Set([stripTrailingSlash(originalUrlParts.pathname)]),
    viaRedirect: false,
    historyReplace: replace,
    blockingPhasesCompleted: false
  };
}
function tryApplyRedirectStep(redirection, nextHref, step) {
  if (step >= 5) return {
    status: "redirect-error",
    code: "redirect-depth-exceeded",
    href: redirection.stepHref
  };
  const nextKey = navigationVisitKey(nextHref);
  if (redirection.visitedPathnames.has(nextKey)) return {
    status: "redirect-error",
    code: "redirect-cycle",
    href: nextHref
  };
  redirection.visitedPathnames.add(nextKey);
  redirection.stepHref = nextHref;
  redirection.viaRedirect = true;
  return null;
}
function applyRedirectArrivalFlag(redirection, target) {
  return redirection.viaRedirect || target.viaRedirect ? {
    ...target,
    viaRedirect: true
  } : target;
}
function depthExceeded(redirection) {
  return {
    status: "redirect-error",
    code: "redirect-depth-exceeded",
    href: redirection.stepHref
  };
}
function followDeclarativeRedirects(matcher, href, nodes) {
  const redirection = createRedirectionContext(href);
  for (let step = 0; step <= 5; step++) {
    const matchStep = lookupNavigationStep(matcher, redirection.stepHref, nodes, redirection.originalUrlParts.search, redirection.originalUrlParts.hash);
    if (!matchStep) return {
      status: "unmatched",
      href: redirection.stepHref
    };
    if (matchStep.kind === "redirect") {
      const error = tryApplyRedirectStep(redirection, matchStep.href, step);
      if (error) return error;
      continue;
    }
    return {
      status: "resolved",
      target: applyRedirectArrivalFlag(redirection, matchStep)
    };
  }
  return depthExceeded(redirection);
}
async function followRedirectsWithGuardWalk(resolverCtx, input) {
  const redirection = createRedirectionContext(input.href, input.options.replace ?? false);
  for (let step = 0; step <= 5; step++) {
    const matchStep = lookupNavigationStep(resolverCtx.matcher, redirection.stepHref, resolverCtx.getMatchableNodes(), redirection.originalUrlParts.search, redirection.originalUrlParts.hash);
    if (!matchStep) return {
      status: "unmatched",
      href: redirection.stepHref
    };
    if (matchStep.kind === "redirect") {
      const error = tryApplyRedirectStep(redirection, matchStep.href, step);
      if (error) return error;
      continue;
    }
    const target = applyRedirectArrivalFlag(redirection, matchStep);
    const transitionPlan = buildTransitionPlan(input.from, target);
    const blockingOutcome = transitionPlan.needsBlockingWalk ? await runBlockingWalkProbe(resolverCtx, input, target, redirection, transitionPlan) : resolveWithoutBlockingWalkProbe(target, redirection);
    if (!blockingOutcome.done) {
      const error = tryApplyRedirectStep(redirection, blockingOutcome.href, step);
      if (error) return error;
      continue;
    }
    return blockingOutcome.result;
  }
  return depthExceeded(redirection);
}
function resolveWithoutBlockingWalkProbe(target, redirection) {
  return {
    done: true,
    result: {
      status: "resolved",
      target,
      replace: redirection.historyReplace || target.viaRedirect,
      skipBlockingPhases: redirection.blockingPhasesCompleted
    }
  };
}
async function runBlockingWalkProbe(resolverCtx, input, target, redirection, transitionPlan) {
  const probe = new NavigationTransaction(0, {
    from: input.from,
    to: target,
    href: target.href,
    hash: target.hash,
    action: input.action,
    options: input.options
  }, () => !resolverCtx.isActive(), resolverCtx.engine);
  probe.transitionPlan = transitionPlan;
  const walkResult = await probe.runRedirectCollapse();
  redirection.blockingPhasesCompleted = true;
  if (walkResult?.status === "redirect") {
    redirection.historyReplace = redirection.historyReplace || (walkResult.replace ?? input.action === "pop");
    return {
      done: false,
      href: walkResult.url
    };
  }
  if (walkResult) return {
    done: true,
    result: {
      status: "terminal",
      result: walkResult,
      probe
    }
  };
  return {
    done: true,
    result: {
      status: "resolved",
      target,
      replace: redirection.historyReplace || target.viaRedirect,
      skipBlockingPhases: true
    }
  };
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/navigation/navigation-coordinator.js
var NavigationCoordinator = class {
  constructor(host) {
    this.openNavigations = /* @__PURE__ */ new Map();
    this.host = host;
    this.activeTransaction = null;
    this.activeTransactionId = 0;
    this.activeNavigationAttemptId = 0;
    this.resolveAbort = null;
  }
  /**
  * Full navigation entry: resolve redirect chain, plan, then run the pipeline when needed.
  * Hash-only and anchor fast paths stay in the engine.
  */
  async navigate(href, action, options) {
    const resolved = resolveDocumentHrefParts(href);
    const attempt = this.beginNavigation(resolved.href);
    if (attempt === null) return;
    try {
      const chain = await followRedirectsWithGuardWalk({
        engine: this.host.engine,
        matcher: this.host.matcher,
        getMatchableNodes: () => this.host.getMatchableNodes(),
        isActive: () => this.isAttemptCurrent(attempt)
      }, {
        href: resolved,
        from: this.host.getCommittedRoute(),
        action,
        options
      });
      if (!this.isAttemptCurrent(attempt)) return;
      if (chain.status !== "resolved") {
        this.activeTransaction?.cancel();
        this.activeTransaction = null;
      }
      if (chain.status === "redirect-error") {
        this.host.handleRedirectError(chain.code, chain.href, action, options);
        return;
      }
      if (chain.status === "terminal") {
        this.host.finalizeResolveTerminal(chain.result, chain.probe);
        return;
      }
      if (chain.status === "unmatched") {
        this.host.handleUnmatchedNavigation(chain.href, action, options);
        return;
      }
      const found = chain.target;
      const slashFix = found.href !== resolved.href;
      const historyOptions = {
        ...options,
        replace: chain.replace || found.viaRedirect || slashFix || options.replace
      };
      if (slashFix && !historyOptions.syncHistory && (action === "system" || action === "pop")) this.host.commitPopSlashFix(found.href);
      await this.run({
        from: this.host.getCommittedRoute(),
        to: found,
        action,
        href: found.href,
        hash: found.hash,
        options: historyOptions,
        skipBlockingPhases: chain.skipBlockingPhases
      });
    } finally {
      this.settleNavigation(attempt);
    }
  }
  /** Returns true when a newer transaction or {@link invalidate} superseded this one. */
  isTransactionStale(transactionId) {
    return this.activeTransactionId !== transactionId;
  }
  /** Whether a navigation attempt for this href is still open. */
  hasOpenNavigation(href) {
    return this.openNavigations.has(href);
  }
  invalidate() {
    this.activeTransaction?.cancel();
    this.activeTransaction = null;
    this.resolveAbort?.abort();
    this.resolveAbort = null;
    this.openNavigations.clear();
    this.activeNavigationAttemptId++;
    this.activeTransactionId++;
  }
  /**
  * Runs one navigation transaction after redirect resolution.
  * Also used directly in unit tests for pipeline / planning behavior.
  */
  async run(options) {
    const plan = this.plan(options);
    if (plan.action === "noop") return;
    if (plan.action === "cancel-pending") {
      const pending = this.activeTransaction;
      pending?.cancel();
      this.activeTransaction = null;
      this.host.restoreCommittedNavState(pending);
      return;
    }
    this.activeTransactionId++;
    const next = new NavigationTransaction(this.activeTransactionId, options, this.isTransactionStale.bind(this), this.host.engine);
    const resources = this.host.engine.resourceGraph;
    const sharedBufferHold = this.activeTransaction ? resources.pinSharedBufferFor(options.to) : null;
    if (this.activeTransaction) this.activeTransaction.cancel();
    this.activeTransaction = next;
    try {
      const result = await next.run();
      this.processResult(result, next);
    } finally {
      sharedBufferHold?.unpin();
      if (this.activeTransaction === next) this.activeTransaction = null;
    }
  }
  isAttemptCurrent(attempt) {
    return !attempt.signal.aborted && this.activeNavigationAttemptId === attempt.id;
  }
  /** Registers one open navigation attempt; used by {@link navigate} and integration tests. */
  beginNavigation(href) {
    if (this.openNavigations.has(href)) return null;
    this.resolveAbort?.abort();
    this.resolveAbort = new AbortController();
    const attempt = {
      href,
      id: ++this.activeNavigationAttemptId,
      signal: this.resolveAbort.signal
    };
    this.openNavigations.set(href, attempt);
    return attempt;
  }
  /** Releases one open navigation attempt after {@link navigate} or test harness settles. */
  settleNavigation(attempt) {
    if (this.openNavigations.get(attempt.href) === attempt) this.openNavigations.delete(attempt.href);
  }
  /** Observe ({@link NavigationPulse.settle}), then apply terminal side effects. */
  processResult(result, transaction) {
    this.host.engine.pulse.settle(transaction.transactionId, result);
    if (!this.host.isRunning) return;
    this.host.applyTerminalOutcome(result, transaction);
  }
  plan(options) {
    const { from, to, href } = options;
    if (!(from != null && isSameNavigationTarget(from, to))) return { action: "run" };
    if (this.getConflictingPendingHref(href) !== null) return { action: "cancel-pending" };
    return {
      action: "noop",
      reason: "already-active"
    };
  }
  /** Another href is still resolving or its pipeline has not settled yet. */
  getConflictingPendingHref(excludingHref) {
    if (this.activeTransaction !== null && this.activeTransaction.href !== excludingHref) return this.activeTransaction.href;
    for (const openHref of this.openNavigations.keys()) if (openHref !== excludingHref) return openHref;
    return null;
  }
};

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/navigation/navigation-outcome.js
function navigationIdentityFromTx(tx) {
  return {
    action: tx.action,
    href: tx.href,
    fromHref: tx.from?.href ?? null,
    historyOptions: tx.historyOptions,
    historyCommitted: tx.historyCommitted
  };
}
function applyNavigationOutcome(result, identity2, ctx) {
  switch (result.status) {
    case "navigationSucceeded":
      return;
    case "cancelled":
      applyHistoryIfNeeded({ status: "cancelled" }, identity2, ctx.provider);
      return;
    case "redirect": {
      const replace = result.replace ?? (!!identity2.historyCommitted || identity2.action === "pop");
      ctx.navigateTo(result.url, replace ? "replace" : "push", {
        replace,
        syncHistory: true
      });
      return;
    }
    case "error":
      applyHistoryIfNeeded(result, identity2, ctx.provider);
      applyFailureEffects(result.failure, ctx);
      return;
  }
}
function applyFailureEffects(failure, ctx) {
  if (failure.isNotFound) {
    ctx.onNotFound?.(failure);
    ctx.setPrev(null);
    return;
  }
  if (failure.viewCommitted) ctx.setPrev(failure.to);
}
function applyHistoryIfNeeded(result, identity2, provider) {
  if (identity2.historyCommitted && identity2.action !== "pop") return;
  applyTransactionHistory(result, identity2.action, identity2.href, identity2.fromHref, identity2.historyOptions, provider);
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/navigation/navigation-pulse.js
var NavigationPulse = class {
  constructor(bus) {
    this.bus = bus;
  }
  /** Emits `navigation:start` + `node:deactivate` for exit routes. */
  begin(tx) {
    const id = tx.transactionId;
    this.bus.emit({
      type: "navigation:start",
      id,
      from: tx.from,
      to: tx.to,
      action: tx.action
    });
    for (const route of tx.transitionPlan.exitRoutes) this.bus.emit({
      type: "node:deactivate",
      id,
      nodeId: route.pattern,
      pattern: route.pattern
    });
  }
  /** Emits `navigation:prepare:start`. */
  prepareStart(tx) {
    this.bus.emit({
      type: "navigation:prepare:start",
      id: tx.transactionId
    });
  }
  /** Emits `navigation:prepare:end`. */
  prepareEnd(tx) {
    this.bus.emit({
      type: "navigation:prepare:end",
      id: tx.transactionId
    });
  }
  /** Emits `load:start` per route. */
  loadStart(tx, routes) {
    const id = tx.transactionId;
    for (const route of routes) this.bus.emit({
      type: "load:start",
      id,
      nodeId: route.pattern,
      pattern: route.pattern
    });
  }
  /**
  * After `resourceGraph.load`: emits `load:end` on success, `load:error` when
  * `error.status === 'error'`; no-op when cancelled / other non-error status.
  */
  loadEnd(tx, routes, error, fallbackTo) {
    const id = tx.transactionId;
    if (error) {
      if (error.status === "error") {
        const failed = error.failure.to ?? fallbackTo;
        this.bus.emit({
          type: "load:error",
          id,
          nodeId: failed.pattern,
          pattern: failed.pattern,
          error: error.failure.error
        });
      }
      return;
    }
    for (const route of routes) this.bus.emit({
      type: "load:end",
      id,
      nodeId: route.pattern,
      pattern: route.pattern
    });
  }
  /**
  * Emits `navigation:url-aligned` when the address bar already matches the target
  * (`historyCommitted` write, or `system` / `pop`). Otherwise no-op.
  */
  alignUrl(tx) {
    const { from, to, action, hash, historyCommitted, transactionId } = tx;
    if (!historyCommitted && action !== "system" && action !== "pop") return;
    this.bus.emit({
      type: "navigation:url-aligned",
      id: transactionId,
      from,
      to,
      action,
      hash,
      source: historyCommitted ? "write" : "browser"
    });
  }
  /** Emits `navigation:nav-state-restore` for the committed route (cancel-pending stay). */
  restoreNavState(to) {
    this.bus.emit({
      type: "navigation:nav-state-restore",
      to
    });
  }
  /** Emits `navigation:commit:start`. */
  commitStart(tx) {
    this.bus.emit({
      type: "navigation:commit:start",
      id: tx.transactionId
    });
  }
  /** Emits `navigation:commit:end` + `node:activate` for enter routes. */
  commitEnd(tx) {
    const { from, to, action, hash, transactionId, transitionPlan } = tx;
    this.bus.emit({
      type: "navigation:commit:end",
      id: transactionId,
      from,
      to,
      action,
      hash
    });
    for (const route of transitionPlan?.enterRoutes ?? []) this.bus.emit({
      type: "node:activate",
      id: transactionId,
      nodeId: route.pattern,
      pattern: route.pattern
    });
  }
  /**
  * Terminal **observe** hook: maps {@link TransactionResult} to bus events only
  * (`navigation:finish` | `cancel` | `redirect` | `error`). No history / `prev` / callbacks.
  *
  * Callers apply engine side effects separately (after or around this emit).
  */
  settle(id, result) {
    switch (result.status) {
      case "navigationSucceeded":
        this.bus.emit({
          type: "navigation:finish",
          id
        });
        return;
      case "cancelled":
        this.bus.emit({
          type: "navigation:cancel",
          id
        });
        return;
      case "redirect":
        this.bus.emit({
          type: "navigation:redirect",
          id,
          url: result.url,
          replace: result.replace ?? false
        });
        return;
      case "error":
        this.bus.emit({
          type: "navigation:error",
          id,
          failure: result.failure
        });
    }
  }
};

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/navigation/unmount-prev-on-not-found.js
function unmountPrevOnNotFound(input) {
  if (!input.from) return;
  const leaf = getLeafMatch(input.from);
  PHASES.unmount.runRouteLifecycle(leaf.route, NavigationTransactionPipelinePhase.buildPhaseContext(PHASES.unmount.phase, leaf, {
    from: null,
    action: input.action,
    router: input.router,
    transactionId: 0,
    transactionSignal: new AbortController().signal
  }));
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/prefetch/policy.js
var VIEW_PREFETCH_MIN_CONFIDENCE = 0.8;
var DATA_PREFETCH_MIN_CONFIDENCE = 0.3;
var PrefetchPolicy = class {
  constructor(config = {}) {
    this.config = {
      ...ENGINE_DEFAULTS.prefetch,
      ...config
    };
  }
  normalizeHref(href) {
    const trimmed = href.trim();
    if (!trimmed || trimmed.startsWith("http") || trimmed.startsWith("//")) return null;
    if (trimmed.startsWith("#")) return null;
    return resolveDocumentHref(trimmed);
  }
  delayFor(mode) {
    switch (mode) {
      case "intent":
      case "render":
        return this.config.intentDelayMs;
      case "viewport":
        return this.config.viewportDelayMs;
      case "tap":
        return this.config.tapDelayMs;
      case "manual":
      case "none":
        return 0;
    }
  }
  confidenceFor(mode) {
    switch (mode) {
      case "none":
        return 0;
      case "intent":
        return 0.3;
      case "viewport":
        return 0.5;
      case "tap":
        return 0.85;
      case "render":
        return 0.9;
      case "manual":
        return 1;
    }
  }
  shouldPrefetchView(ctx) {
    if (ctx.mode === "manual" || ctx.mode === "tap") return true;
    return ctx.confidence >= VIEW_PREFETCH_MIN_CONFIDENCE;
  }
  shouldPrefetchData(ctx) {
    return ctx.confidence >= DATA_PREFETCH_MIN_CONFIDENCE;
  }
  skipReason(input) {
    const { href, mode, lastPrefetchAt, force } = input;
    if (mode === "none") return "disabled";
    if (force) return null;
    if (this.isSaveDataPreferred()) return "save-data";
    const normalized = this.normalizeHref(href);
    if (!normalized) return "invalid-href";
    const currentHref = this.config.currentHref?.() ?? "";
    if (currentHref && isHashOnlyChange(splitAppHref(normalized), splitAppHref(currentHref), { requireExistingHash: true })) return "hash-only";
    if (lastPrefetchAt !== void 0 && Date.now() - lastPrefetchAt < this.config.staleTimeMs) return "same-route-fresh";
    return null;
  }
  isSaveDataPreferred() {
    const connection = navigator.connection;
    return Boolean(connection?.saveData);
  }
};

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/prefetch/intent/bus.js
var PrefetchIntentBus = class {
  constructor() {
    this.listeners = /* @__PURE__ */ new Set();
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit(intent) {
    for (const listener of this.listeners) listener(intent);
  }
  destroy() {
    this.listeners.clear();
  }
};

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/user-actions/link-resolve.js
function findRouterLink(target, linksSelector) {
  if (!(target instanceof Element)) return null;
  const anchor = target.closest("a");
  if (!anchor?.matches(linksSelector)) return null;
  return anchor;
}
function readLinkHref(anchor) {
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("http") || href.startsWith("//") || href.startsWith("#")) return null;
  return href;
}
function resolveLinkHref(anchor, baseAppHref) {
  const raw = readLinkHref(anchor);
  if (!raw) return null;
  return resolveDocumentHref(raw, toDocumentResolutionBase(baseAppHref ?? getCurrentAppHref()));
}
function readRouterLinkFromEvent(event, linksSelector) {
  const anchor = findRouterLink(event.target, linksSelector);
  if (!anchor) return null;
  const href = resolveLinkHref(anchor);
  return href ? {
    anchor,
    href
  } : null;
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/user-actions/link-prefetch-intent.js
var LinkPrefetchIntentTracker = class {
  constructor(config) {
    this.listening = false;
    this.handlers = config.handlers;
    this.linksSelector = config.linksSelector ?? ENGINE_DEFAULTS.linksSelector;
    this.resolveMode = config.resolveMode;
  }
  start() {
    if (this.listening) return;
    this.listening = true;
    document.addEventListener("mouseover", this.onLinkIntent, { capture: true });
    document.addEventListener("mouseout", this.onLinkLeave, { capture: true });
    document.addEventListener("focusin", this.onLinkIntent, { capture: true });
    document.addEventListener("focusout", this.onLinkLeave, { capture: true });
    document.addEventListener("touchstart", this.onLinkTouch, {
      capture: true,
      passive: true
    });
  }
  /** Pause intent listeners; handlers stay for a later {@link start}. */
  stop() {
    if (!this.listening) return;
    this.listening = false;
    document.removeEventListener("mouseover", this.onLinkIntent, { capture: true });
    document.removeEventListener("mouseout", this.onLinkLeave, { capture: true });
    document.removeEventListener("focusin", this.onLinkIntent, { capture: true });
    document.removeEventListener("focusout", this.onLinkLeave, { capture: true });
    document.removeEventListener("touchstart", this.onLinkTouch, { capture: true });
    this.handlers.cancelIntent();
  }
  onLinkIntent(event) {
    this.scheduleFromEvent(event, false);
  }
  onLinkLeave(event) {
    const anchor = findRouterLink(event.target, this.linksSelector);
    if (!anchor) return;
    const href = resolveLinkHref(anchor);
    if (!href) return;
    const related = "relatedTarget" in event ? event.relatedTarget : null;
    if (related instanceof Element && anchor.contains(related)) return;
    this.handlers.cancelIntent(href);
  }
  onLinkTouch(event) {
    this.scheduleFromEvent(event, true);
  }
  scheduleFromEvent(event, touch) {
    const link = readRouterLinkFromEvent(event, this.linksSelector);
    if (!link) return;
    const mode = this.resolveMode(link.anchor, link.href, touch);
    if (!mode) return;
    this.handlers.scheduleIntent(link.href, mode);
  }
};
__decorate([bind], LinkPrefetchIntentTracker.prototype, "onLinkIntent", null);
__decorate([bind], LinkPrefetchIntentTracker.prototype, "onLinkLeave", null);
__decorate([bind], LinkPrefetchIntentTracker.prototype, "onLinkTouch", null);

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/prefetch/intent/link-source.js
var LinkIntentSource = class {
  constructor(bus, config) {
    this.tracker = new LinkPrefetchIntentTracker({
      linksSelector: config.linksSelector,
      resolveMode: config.resolveMode,
      handlers: {
        scheduleIntent: (href, mode) => {
          bus.emit({
            type: "schedule",
            href,
            mode,
            source: "link"
          });
        },
        cancelIntent: (href) => {
          bus.emit({
            type: "cancel",
            href,
            source: "link"
          });
        }
      }
    });
  }
  start() {
    this.tracker.start();
  }
  stop() {
    this.tracker.stop();
  }
  /** Same as {@link stop} — tracker has no extra teardown beyond pausing listeners. */
  destroy() {
    this.stop();
  }
};

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/prefetch/plan.js
var PrefetchPlanResolver = class {
  constructor(deps) {
    this.policy = new PrefetchPolicy();
    this.cache = /* @__PURE__ */ new Map();
    this.deps = deps;
  }
  resolve(href) {
    const normalized = this.policy.normalizeHref(href);
    if (!normalized) return null;
    const nodes = this.deps.getMatchableNodes();
    const from = this.resolveCurrentLeaf(nodes);
    const planKey = this.planCacheKey(normalized, from);
    const generation = this.deps.getRegistryGeneration();
    const cached = this.cache.get(planKey);
    if (cached && cached.generation === generation) return cached.plan;
    const outcome = followDeclarativeRedirects(this.deps.matcher, normalized, nodes);
    if (outcome.status !== "resolved") return null;
    const target = outcome.target;
    const transition = buildTransitionPlan(from, target);
    const plan = {
      href: target.href,
      pathname: target.pathname,
      search: target.search,
      hash: target.hash,
      leaf: target,
      chain: getActiveChain(target),
      enterRoutes: transition.enterRoutes,
      lca: transition.lca,
      registryGeneration: generation
    };
    this.cache.set(planKey, {
      generation,
      plan
    });
    return plan;
  }
  clear() {
    this.cache.clear();
  }
  resolveCurrentLeaf(nodes) {
    const currentHref = this.deps.currentHref?.();
    if (!currentHref) return null;
    const normalized = this.policy.normalizeHref(currentHref);
    if (!normalized) return null;
    const outcome = followDeclarativeRedirects(this.deps.matcher, normalized, nodes);
    return outcome.status === "resolved" ? outcome.target : null;
  }
  planCacheKey(href, from) {
    return `${href}|from:${from?.href ?? ""}`;
  }
};

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/prefetch/store.js
var IntentScheduler = class {
  constructor() {
    this.timers = /* @__PURE__ */ new Map();
  }
  schedule(key, delayMs, run) {
    this.cancel(key);
    if (delayMs <= 0) {
      run();
      return;
    }
    const timer = setTimeout(() => {
      this.timers.delete(key);
      run();
    }, delayMs);
    this.timers.set(key, timer);
  }
  cancel(key) {
    if (key === void 0) {
      for (const timer2 of this.timers.values()) clearTimeout(timer2);
      this.timers.clear();
      return;
    }
    const timer = this.timers.get(key);
    if (timer) clearTimeout(timer);
    this.timers.delete(key);
  }
  has(key) {
    return this.timers.has(key);
  }
  destroy() {
    this.cancel();
  }
};
var PrefetchRunStore = class {
  constructor(config = {}) {
    this.scheduler = new IntentScheduler();
    this.inflight = /* @__PURE__ */ new Map();
    this.records = /* @__PURE__ */ new Map();
    this.config = {
      ...ENGINE_DEFAULTS.prefetch,
      ...config
    };
    this.policy = new PrefetchPolicy(this.config);
  }
  scheduleIntent(href, mode, run) {
    this.scheduler.schedule(href, this.policy.delayFor(mode), run);
  }
  cancelIntent(href) {
    if (href === void 0) {
      this.scheduler.destroy();
      for (const run of this.inflight.values()) run.abort.abort();
      this.inflight.clear();
      return;
    }
    const normalized = this.policy.normalizeHref(href);
    if (!normalized) return;
    this.scheduler.cancel(normalized);
    this.inflight.get(normalized)?.abort.abort();
  }
  getInflight(href) {
    return this.inflight.get(href);
  }
  setInflight(href, run) {
    this.inflight.set(href, run);
  }
  deleteInflight(href, abort) {
    if (this.inflight.get(href)?.abort === abort) this.inflight.delete(href);
  }
  isInflight(href) {
    return this.inflight.has(href);
  }
  isScheduled(href) {
    return this.scheduler.has(href);
  }
  recordSuccess(href) {
    this.records.set(href, { completedAt: Date.now() });
    this.pruneRecords();
  }
  clearRecords() {
    this.records.clear();
  }
  clearRecordsMatching(predicate) {
    for (const href of this.records.keys()) if (predicate(href)) this.records.delete(href);
  }
  lastCompletedAt(href) {
    return this.records.get(href)?.completedAt;
  }
  skipReason(href, mode, force) {
    return this.policy.skipReason({
      href,
      mode,
      lastPrefetchAt: this.records.get(href)?.completedAt,
      force
    });
  }
  destroy() {
    this.cancelIntent();
    this.records.clear();
  }
  pruneRecords() {
    const cutoff = Date.now() - this.config.maxAgeMs;
    for (const [href, record] of this.records) if (record.completedAt < cutoff) this.records.delete(href);
  }
};

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/prefetch/pipeline.js
var PrefetchPipeline = class {
  constructor(deps, config = {}, options = {}) {
    this.intentBus = new PrefetchIntentBus();
    this.deps = deps;
    this.config = {
      ...ENGINE_DEFAULTS.prefetch,
      ...config
    };
    this.policy = new PrefetchPolicy(this.config);
    this.store = new PrefetchRunStore(this.config);
    this.planResolver = new PrefetchPlanResolver({
      matcher: deps.matcher,
      getMatchableNodes: deps.getMatchableNodes,
      getRegistryGeneration: deps.getRegistryGeneration,
      currentHref: this.config.currentHref
    });
    this.unsubscribeIntent = this.intentBus.subscribe((intent) => this.handleIntent(intent));
    this.linkSource = new LinkIntentSource(this.intentBus, {
      linksSelector: options.linksSelector,
      resolveMode: (anchor, href, touch) => this.resolveModeForLink(anchor, href, touch)
    });
  }
  get intent() {
    return this.intentBus;
  }
  start() {
    this.linkSource.start();
  }
  /** Pause link intents; bus / store / plan resolver stay intact for a later {@link start}. */
  stop() {
    this.linkSource.stop();
  }
  scheduleIntent(href, mode) {
    this.handleIntent({
      type: "schedule",
      href,
      mode,
      source: "api"
    });
  }
  cancelIntent(href) {
    this.handleIntent({
      type: "cancel",
      href,
      source: "api"
    });
  }
  /** Clears prefetch freshness records so the next prefetch can run again. */
  resetPrefetchRecords(path) {
    if (!path) {
      this.store.clearRecords();
      return;
    }
    this.store.clearRecordsMatching((href) => href === path || href.startsWith(`${path}/`) || href.startsWith(`${path}?`) || href.startsWith(`${path}#`));
  }
  async prefetch(href, options = {}) {
    const mode = options.mode ?? "manual";
    const normalized = this.resolveRunnableHref(href, mode, {
      force: options.force,
      onSkip: true
    });
    if (!normalized) return;
    const existing = !options.force ? this.store.getInflight(normalized) : void 0;
    if (existing) return existing.promise;
    if (options.force) this.store.getInflight(normalized)?.abort.abort();
    const plan = this.planResolver.resolve(normalized);
    if (!plan) {
      this.config.onSkipped?.(normalized, "no-match");
      return;
    }
    const abort = new AbortController();
    const ctx = {
      signal: abort.signal,
      mode
    };
    const clearParentAbort = options.signal ? onAbort(options.signal, () => abort.abort()) : void 0;
    const runPromise = this.runResources(plan, ctx);
    const promise = runPromise.then(() => void 0, () => void 0);
    this.store.setInflight(normalized, {
      promise,
      abort
    });
    try {
      if (!await runPromise || abort.signal.aborted) return;
      this.store.recordSuccess(normalized);
    } catch (error) {
      if (!abort.signal.aborted) {
        this.config.onError?.(plan, error, ctx);
        if (mode === "manual") throw error;
      }
    } finally {
      clearParentAbort?.();
      this.store.deleteInflight(normalized, abort);
    }
  }
  isInflight(href) {
    const normalized = this.policy.normalizeHref(href);
    return normalized ? this.store.isInflight(normalized) : false;
  }
  isScheduled(href) {
    const normalized = this.policy.normalizeHref(href);
    return normalized ? this.store.isScheduled(normalized) : false;
  }
  destroy() {
    this.stop();
    this.unsubscribeIntent();
    this.intentBus.destroy();
    this.store.destroy();
    this.planResolver.clear();
  }
  resolveModeForLink(anchor, href, touch) {
    return resolvePrefetchMode({
      anchor,
      route: this.planResolver.resolve(href)?.leaf.route,
      routerDefault: this.config.defaultMode,
      touch
    });
  }
  handleIntent(intent) {
    this.config.onIntent?.(intent);
    if (intent.type === "cancel") {
      this.store.cancelIntent(intent.href);
      return;
    }
    const resolvedMode = intent.mode ?? this.config.defaultMode ?? "intent";
    const normalized = this.resolveRunnableHref(intent.href, resolvedMode, { onSkip: true });
    if (!normalized) return;
    this.store.scheduleIntent(normalized, resolvedMode, () => void this.prefetch(normalized, { mode: resolvedMode }));
  }
  resolveRunnableHref(href, mode, opts) {
    const normalized = this.policy.normalizeHref(href);
    if (!normalized) {
      if (opts.onSkip) this.config.onSkipped?.(href, "invalid-href");
      return null;
    }
    const skip = this.store.skipReason(normalized, mode, opts.force);
    if (skip) {
      if (opts.onSkip) this.config.onSkipped?.(normalized, skip);
      return null;
    }
    return normalized;
  }
  async runResources(plan, ctx) {
    if (ctx.signal.aborted) return false;
    const planCtx = {
      mode: ctx.mode,
      confidence: this.policy.confidenceFor(ctx.mode)
    };
    if (!this.deps.planner.planResources(plan, planCtx).length) {
      const reason = this.deps.planner.explainEmptyPlan?.(plan, planCtx) ?? "no-targets";
      this.config.onSkipped?.(plan.href, reason);
      return false;
    }
    this.deps.speculation?.hint(plan, ctx);
    this.config.onStart?.(plan, ctx);
    try {
      await this.raceWithAbort(this.deps.runSpeculativePrepare(plan, { signal: ctx.signal }), ctx.signal);
    } catch (error) {
      if (ctx.signal.aborted || this.isAbortError(error)) return false;
      throw error;
    }
    if (ctx.signal.aborted) return false;
    this.config.onComplete?.(plan, ctx);
    return true;
  }
  isAbortError(error) {
    return error instanceof DOMException && error.name === "AbortError";
  }
  raceWithAbort(promise, signal) {
    if (signal.aborted) return Promise.reject(new DOMException("Prefetch aborted", "AbortError"));
    return new Promise((resolve, reject) => {
      const clear = onAbort(signal, () => {
        reject(new DOMException("Prefetch aborted", "AbortError"));
      });
      promise.then((value) => {
        clear();
        resolve(value);
      }, (error) => {
        clear();
        reject(error);
      });
    });
  }
};

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/prefetch/resources.js
var DefaultPrefetchResourcePlanner = class {
  constructor(options = {}, policy = new PrefetchPolicy()) {
    this.policy = policy;
    this.viewEnabled = options.view ?? true;
    this.dataEnabled = options.data ?? true;
  }
  planResources(plan, ctx) {
    const resources = [];
    const view = this.planView(plan, ctx);
    if (view) resources.push(view);
    const data = this.planData(plan, ctx);
    if (data) resources.push(data);
    return resources;
  }
  explainEmptyPlan(plan, ctx) {
    const hasViewTargets = plan.enterRoutes.some((route) => this.routeHasView(route));
    if (this.viewEnabled && hasViewTargets && !this.policy.shouldPrefetchView(ctx)) return "low-confidence";
    const hasDataTargets = plan.enterRoutes.some((route) => route.route.hasLoad);
    if (this.dataEnabled && hasDataTargets && !this.policy.shouldPrefetchData(ctx)) return "low-confidence";
    return "no-targets";
  }
  planView(plan, ctx) {
    if (!this.viewEnabled || !this.policy.shouldPrefetchView(ctx)) return null;
    const targets = plan.enterRoutes.filter((route) => this.routeHasView(route));
    if (!targets.length) return null;
    return {
      kind: "view",
      targets,
      priority: ctx.confidence >= 0.8 ? "high" : "normal"
    };
  }
  planData(plan, ctx) {
    if (!this.dataEnabled || !this.policy.shouldPrefetchData(ctx)) return null;
    const targets = plan.enterRoutes.filter((route) => route.route.hasLoad);
    if (!targets.length) return null;
    return {
      kind: "data",
      targets,
      priority: "high"
    };
  }
  routeHasView(routeInfo) {
    return routeInfo.route.hasViewContent;
  }
};

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/resource-graph/handoff-work-registry.js
var HandoffWorkRegistry = class {
  constructor() {
    this.entries = /* @__PURE__ */ new Map();
  }
  /**
  * Register a waiter on `key` and return a {@link HandoffWaiter} for that generation.
  *
  * @param key - Resource identity (e.g. `data:…` / `view:…`).
  * @param kind - Interest kind. Only `'navigation'` sets sticky `hadNavigation`.
  * @returns Waiter whose {@link HandoffWaiter.workSignal} is shared for this key’s current generation.
  */
  hold(key, kind) {
    const entry = this.entryFor(key);
    if (kind === "navigation") entry.hadNavigation = true;
    entry.refs++;
    let released = false;
    return {
      key,
      kind,
      workSignal: entry.controller.signal,
      release: () => {
        if (released) return;
        released = true;
        this.releaseEntry(key, entry);
      }
    };
  }
  /**
  * Number of active (unreleased) waiters for `key`.
  * `0` if the key is absent or only a prefetch-idle generation remains.
  * @internal Tests / diagnostics.
  */
  waiterCount(key) {
    return this.entries.get(key)?.refs ?? 0;
  }
  /** Abort every generation’s {@link HandoffWaiter.workSignal} and clear the map. */
  destroy() {
    for (const { controller } of this.entries.values()) controller.abort();
    this.entries.clear();
  }
  /**
  * Existing non-aborted generation for `key`, or create a new one.
  * If a map slot exists but its signal is already aborted, it is replaced.
  */
  entryFor(key) {
    const existing = this.entries.get(key);
    if (existing && !existing.controller.signal.aborted) return existing;
    const entry = {
      controller: new AbortController(),
      refs: 0,
      hadNavigation: false
    };
    this.entries.set(key, entry);
    return entry;
  }
  /**
  * Apply one {@link HandoffWaiter.release}. No-op if `entry` is not the current map value
  * (stale after abort / replace). Aborts and deletes when idle after navigation interest.
  */
  releaseEntry(key, entry) {
    if (this.entries.get(key) !== entry) return;
    entry.refs--;
    if (entry.refs > 0 || !entry.hadNavigation) return;
    entry.controller.abort();
    this.entries.delete(key);
  }
};

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/resource-graph/handoff-cache.js
var HandoffCache = class extends AuraResolvableSwrCache {
  constructor(options = {}) {
    const { ttl = ENGINE_DEFAULTS.sharedBufferOptions.ttl, max, gcSweepInterval = false, onRemove, onSettled } = options;
    super({
      max,
      gcTime: ttl,
      gcSweepInterval,
      invalidatePolicy: "remove",
      onRemove,
      write: (value) => !(typeof DocumentFragment !== "undefined" && value instanceof DocumentFragment),
      onSettled
    });
    this.work = new HandoffWorkRegistry();
  }
  /**
  * Register a work waiter for `key` (shared {@link HandoffWaiter.workSignal}).
  *
  * @param kind - {@link HandoffWaiterKind}. Only `'navigation'` sets sticky abort-on-idle.
  *   `'pin'` = supersede refcount bridge ({@link ResourceGraph.pinSharedBufferFor}),
  *   not a prepare mode and not a TTL lease.
  * @see HandoffWorkRegistry.hold
  */
  hold(key, kind) {
    return this.work.hold(key, kind);
  }
  /**
  * Active (unreleased) work-waiter count for `key`.
  * @internal @see HandoffWorkRegistry.waiterCount
  */
  waiterCount(key) {
    return this.work.waiterCount(key);
  }
  /**
  * Drop settled values and in-flight singleflight slots; abort all work generations.
  * Stale loads that settle after this call do not rewrite the store (epoch gate).
  */
  clear() {
    this.work.destroy();
    super.clear();
  }
  /** Abort outstanding work signals, then destroy the resolvable cache. */
  destroy() {
    this.work.destroy();
    super.destroy();
  }
};

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/resource-graph/resource-graph.js
var ResourceGraph = class {
  constructor(options) {
    this.sharedBuffer = options.sharedBuffer ?? new HandoffCache(options.sharedBufferOptions);
    this.dataGraph = options.dataGraph ?? new DataGraph(this.sharedBuffer, {
      hooks: options.hooks,
      cache: options.dataCacheOptions
    });
    this.viewGraph = options.viewGraph ?? new ViewGraph(this.sharedBuffer, {
      cache: options.viewCacheOptions,
      registry: options.viewRegistry
    });
  }
  load(enterRoutes, context) {
    this.branch = context.branch;
    this.transaction = context.transaction;
    this.enterRoutes = enterRoutes;
    return this.execute(this.buildLoadPlan());
  }
  /**
  * Invalidates load-hook cache entries in {@link DataGraph}.
  * Returns affected entry count; `-1` when a full invalidate matched no cached entries.
  */
  invalidateData(options = {}) {
    return this.dataGraph.invalidate(options);
  }
  /**
  * Invalidates view-loader payload cache in {@link ViewGraph}.
  * Returns affected entry count; `-1` when a full invalidate matched no cached entries.
  */
  invalidateView(options = {}) {
    return this.viewGraph.invalidate(options);
  }
  /**
  * Drop settled {@link sharedBuffer} keys for successfully entered routes.
  * Call from `navigationSucceeded` apply — not from {@link load}. Long `cache.*` untouched.
  */
  consumeSharedBufferFor(enterRoutes) {
    for (const match of enterRoutes) {
      const { dataKey, viewKey: viewKey2 } = match;
      if (dataKey && viewKey2) {
        const data = this.sharedBuffer.get(dataKey);
        if (data !== void 0) this.sharedBuffer.delete(viewKeyWithData(viewKey2, data));
      }
      if (viewKey2) this.sharedBuffer.delete(viewKey2);
      if (dataKey) this.sharedBuffer.delete(dataKey);
    }
  }
  /**
  * Abort shared prepare work, then destroy long-lived data/view caches.
  * Call once from engine teardown.
  */
  destroy() {
    this.sharedBuffer.destroy();
    this.dataGraph.destroy();
    this.viewGraph.destroy();
  }
  /**
  * Splits enter routes into data vs independent content buckets.
  */
  buildLoadPlan(enterRoutes = this.enterRoutes) {
    const dataRoutes = [];
    const viewRoutes = [];
    const viewWithDataRoutes = [];
    for (const matched of enterRoutes) {
      const { route } = matched;
      route.hasLoad && dataRoutes.push(matched);
      if (typeof route.layout === "string" ? route.layout.trim() : "") viewRoutes.push(matched);
      else if (route.view?.loader) route.viewLoaderNeedsData ? viewWithDataRoutes.push(matched) : viewRoutes.push(matched);
    }
    return {
      dataRoutes,
      viewRoutes,
      viewWithDataRoutes
    };
  }
  async execute(plan) {
    const { dataRoutes, viewRoutes, viewWithDataRoutes } = plan;
    const { transaction, enterRoutes } = this;
    const { signal, phaseMode: mode } = transaction;
    const dataPromise = dataRoutes.length ? this.dataGraph.load(dataRoutes, {
      branch: this.branch,
      transaction,
      mode
    }) : Promise.resolve({});
    const contentPromise = this.viewGraph.load(viewRoutes, signal, {
      mode,
      transaction
    });
    const [dataResult, viewResult] = await Promise.all([dataPromise, contentPromise]);
    if (dataResult.error) return { error: dataResult.error };
    if (viewResult.error) return { error: viewResult.error };
    const viewWithDataResult = await this.viewGraph.load(viewWithDataRoutes, signal, {
      data: (route) => dataResult.data?.get(route.dataKey),
      mode,
      transaction
    });
    if (viewWithDataResult.error) return { error: viewWithDataResult.error };
    if (mode === "prefetch") return {};
    return {
      ...dataResult.data && { data: dataResult.data },
      view: enterRoutes.map((match) => {
        const i = viewRoutes.indexOf(match);
        if (i >= 0) return viewResult.data?.[i]?.data ?? null;
        const j = viewWithDataRoutes.indexOf(match);
        if (j >= 0) return viewWithDataResult.data?.[j]?.data ?? null;
        return null;
      })
    };
  }
  /**
  * Pin handoff work generations for `to`’s data + view keys (active chain) across supersede.
  *
  * **When:** {@link NavigationCoordinator} calls this only if `activeTransaction` is already
  * set (A in flight). No active tx → no pin (idle click / first navigation). Order:
  * `pinSharedBufferFor(B)` → `cancel(A)` → assign B active → `await B.run()` →
  * `hold.unpin()` in `finally`.
  *
  * **Kind `'pin'`** (see {@link HandoffWaiterKind}):
  * - Increments `refs` so `cancel(A)` cannot abort shared work on **overlapping** keys
  *   (e.g. LCA parent) before B’s prepare takes a real `'navigation'` / `'prefetch'` hold.
  * - Does **not** set `hadNavigation`. If B exits before prepare (guard / redirect /
  *   cancel) while superseding, `unpin` must not fake “navigation prepare came and left”
  *   and kill prefetch-idle warmup on B’s keys.
  *
  * **Lifetime:** supersede window only — not handoff TTL (~30s), not until prefetch settles.
  * After `unpin`, registry abort policy is unchanged: a real `'navigation'` hold that
  * later finishes can still abort work.
  *
  * Pins base {@link MatchedRouteInfo.viewKey} (not `viewKeyWithData`) — enough for
  * independent content / layout across supersede. Data-bound view keys with a data
  * suffix are held by {@link ViewGraph} once load starts with payload.
  *
  * @returns Lease — only this handle’s {@link SharedBufferHold.unpin} drops these pin waiters.
  */
  pinSharedBufferFor(to) {
    const waiters = [];
    const seen = /* @__PURE__ */ new Set();
    for (const match of getActiveChain(to)) for (const key of [match.dataKey, match.viewKey]) {
      if (!key || seen.has(key)) continue;
      seen.add(key);
      waiters.push(this.sharedBuffer.hold(key, "pin"));
    }
    let released = false;
    return { unpin: () => {
      if (released) return;
      released = true;
      for (const waiter of waiters) waiter.release();
    } };
  }
};

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/user-actions/link-navigation.js
var LinkNavigationTracker = class {
  constructor(config = {}) {
    this.listening = false;
    this.linksSelector = config.linksSelector ?? ENGINE_DEFAULTS.linksSelector;
  }
  onNavigation(handler) {
    this.handler = handler;
  }
  start() {
    if (this.listening) return;
    this.listening = true;
    document.addEventListener("click", this.onDocumentClick, { capture: true });
  }
  /** Pause click capture; keeps {@link onNavigation} handler for a later {@link start}. */
  stop() {
    if (!this.listening) return;
    this.listening = false;
    document.removeEventListener("click", this.onDocumentClick, { capture: true });
  }
  destroy() {
    this.stop();
    this.handler = void 0;
  }
  onDocumentClick(event) {
    const anchor = findRouterLink(event.target, this.linksSelector);
    if (!anchor) return;
    const href = resolveLinkHref(anchor);
    if (!href) return;
    event.preventDefault();
    this.handler?.({
      href,
      action: "push",
      replace: false,
      syncHistory: true
    });
  }
};
__decorate([bind], LinkNavigationTracker.prototype, "onDocumentClick", null);

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/aura-routing-engine.js
var AuraRoutingEngine = class {
  /** Facade to {@link ResourceGraph.viewGraph} (AuraRouter / branch resolve). */
  get viewGraph() {
    return this.resourceGraph.viewGraph;
  }
  /** Facade to {@link ResourceGraph.dataGraph} (invalidate / tests). */
  get dataGraph() {
    return this.resourceGraph.dataGraph;
  }
  /** {@link NavigationHost.engine} — probe transactions and pipeline need `this`. */
  get engine() {
    return this;
  }
  constructor(router2, config = {}) {
    this.registry = new AuraRoutingRouteRegistry();
    this.matcher = new AuraRoutingUrlMatcher();
    this.events = new EventBus();
    this.pulse = new NavigationPulse(this.events);
    this.isRunning = false;
    this.router = router2;
    this.config = resolveAuraRoutingEngineConfig(config);
    this.hooksRegistry = defaultHookRegistry;
    this.resourceGraph = new ResourceGraph({
      hooks: this.hooksRegistry,
      viewGraph: this.config.viewGraph,
      viewRegistry: this.config.viewRegistry,
      viewCacheOptions: this.config.viewCache,
      dataCacheOptions: this.config.dataCache,
      sharedBufferOptions: this.config.sharedBufferOptions
    });
    this.provider = this.config.provider ?? new BrowserHistoryProvider();
    this.navigationCoordinator = new NavigationCoordinator(this);
    const onNavigation = (request) => {
      this.navigateTo(request.href, request.action, {
        replace: request.replace,
        syncHistory: request.syncHistory
      });
    };
    this.provider.onNavigation(onNavigation);
    this.linkNavigation = new LinkNavigationTracker({ linksSelector: this.config.linksSelector });
    this.linkNavigation.onNavigation(onNavigation);
    this.initPrefetch();
  }
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.provider.start();
    this.linkNavigation.start();
    this.prefetchPipeline?.start();
    this.navigateTo(this.provider.currentHref, "system", {
      replace: true,
      syncHistory: false
    });
  }
  /**
  * Pause input (history / link clicks / prefetch intents) and cancel in-flight work.
  * Keeps wiring so a later {@link start} resumes on the same instance.
  * For full teardown use {@link destroy}.
  */
  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    this.navigationCoordinator.invalidate();
    this.prefetchPipeline?.stop();
    this.linkNavigation.stop();
    this.provider.stop();
  }
  /**
  * Full teardown. Does not call {@link stop} — subsystem `destroy` already pauses listeners
  * where needed; calling both would re-stop / re-invalidate for nothing.
  */
  destroy() {
    if (this.isRunning) {
      this.isRunning = false;
      this.navigationCoordinator.invalidate();
    }
    this.prefetchPipeline?.destroy();
    this.linkNavigation.destroy();
    this.provider.destroy();
    this.matcher.destroy();
    this.registry.clear();
    this.prev = null;
    this.resourceGraph.destroy();
    this.events.destroy();
  }
  registerRoutes(routes) {
    this.registry.register(routes);
  }
  replaceRoutes(routes) {
    this.registry.replace(routes);
  }
  getMatchableNodes() {
    return this.registry.getMatchableNodes();
  }
  /**
  * Центральный метод навигации: match → processor → finalize.
  *
  * **Порядок history commit (push/replace, `syncHistory: true`):**
  * 1. `runGuards` — leave + guard (после redirect collapse в coordinator).
  * 2. `commitHistoryIfNeeded` → `notifyUrlAligned` — write URL (если нужно),
  *    затем chrome sync (active links / navigation-start) до load/render.
  * 3. `runLoads` — DataGraph / load hooks.
  * 4. render → `commitNavigation` (prev + late chrome sync, без повторного pushState).
  *
  * **Отмена до history commit:** URL не менялся (guard cancel / redirect).
  * **Load/render error после history commit (push/replace):** URL остаётся на target, rollback не делается (product policy).
  *
  * **Отмена при `pop` (Back/Forward) — особый случай:**
  * Браузер меняет адресную строку *до* `popstate`. К моменту `processor.run` `window.location`
  * уже указывает на `to`, а UI и `prevMatchedRouteInfo` могут ещё соответствовать `from`.
  *
  * Engine при `!ok` **не откатывает** history: `history.forward()` / `pushState` создают новые
  * записи в стеке и ломают ожидаемое поведение Back/Forward. Синхронизацию URL и UI должен
  * выполнить **processor / render**, в зависимости от причины отмены:
  *
  * - **Guard отменил** (например, несохранённая форма): оставить UI на `from`, вернуть URL
  *   через `replaceState(from.href)` или программный navigate с `replace: true`.
  * - **Ошибка load/render**: показать error UI, fallback или redirect; при необходимости
  *   явно выровнять URL с отображаемым состоянием.
  * - **Redirect из guard**: navigate на целевой URL (часто с `replace: true`), а не
  *   механический возврат к `from`.
  *
  * @param href — pathname + search (+ hash).
  * @param action — способ инициации; для `pop` и `system` передаётся `syncHistory: false`.
  * @param options.replace — `replaceState` вместо `pushState` (только при `syncHistory: true`).
  * @param options.syncHistory — history commit после успешного processor; `false` для `pop`
  *   и начальной загрузки, когда URL уже задан браузером.
  */
  async navigateTo(href, action, options) {
    const resolved = resolveDocumentHrefParts(href);
    if (resolved.hash && isHashOnlyChange(resolved, splitAppHref(this.provider.currentHref))) {
      this.finalizeHashOnlyNavigation(resolved.href, options, resolved.hash);
      return;
    }
    await this.navigationCoordinator.navigate(href, action, options);
  }
  prefetch(href, options) {
    return this.prefetchPipeline?.prefetch(href, options) ?? Promise.resolve();
  }
  /**
  * Invalidates a resource cache via {@link ResourceGraph}.
  * `options.cache`: `'data'` (default) | `'view'` | `'all'`.
  * Returns affected entry count; `-1` when a full invalidate matched no cached entries.
  */
  invalidate(options = {}) {
    this.resetPrefetchRecords(options);
    if (options.cache === "view") return this.resourceGraph.invalidateView(options);
    if (options.cache === "all") {
      const data = this.resourceGraph.invalidateData(options);
      const view = this.resourceGraph.invalidateView(options);
      if (data < 0 && view < 0) return -1;
      return (data < 0 ? 0 : data) + (view < 0 ? 0 : view);
    }
    return this.resourceGraph.invalidateData(options);
  }
  getCommittedRoute() {
    return this.prev;
  }
  commitPopSlashFix(href) {
    this.provider.commit(href, {
      replace: true,
      syncHistory: true
    });
  }
  /**
  * Terminal outcome from pre-commit redirect resolution (before pipeline run).
  * Probe txs use `id: 0` and never call {@link NavigationTransaction.run}.
  */
  finalizeResolveTerminal(result, probe) {
    if (!this.isRunning) return;
    this.pulse.settle(probe.transactionId, result);
    this.applyTerminalOutcome(result, probe);
  }
  handleUnmatchedNavigation(requestedHref, action, options) {
    unmountPrevOnNotFound({
      from: this.prev,
      action,
      router: this.router
    });
    this.settleAndApplyPreMatchFailure(NavigationFailure.notFound(requestedHref, this.prev, action), action, requestedHref, options);
  }
  handleRedirectError(code, href, action, options) {
    this.settleAndApplyPreMatchFailure(NavigationFailure.redirectError(code, href, this.prev, action), action, href, options);
  }
  /** Terminal apply (history / `prev` / redirect / sharedBuffer consume). Observe via {@link NavigationPulse.settle}. */
  applyTerminalOutcome(result, tx) {
    applyNavigationOutcome(result, navigationIdentityFromTx(tx), this.applyOutcomeContext());
    if (result.status === "navigationSucceeded") this.resourceGraph.consumeSharedBufferFor(tx.transitionPlan?.enterRoutes ?? []);
  }
  /**
  * cancel-pending stay: pending may have written the URL and early-synced nav state.
  * Roll address bar back when needed, then ask the host to re-sync active links / branch.
  */
  restoreCommittedNavState(pending) {
    const committed = this.prev;
    if (committed == null) return;
    if (pending?.historyCommitted) this.provider.rollback(committed.href);
    this.pulse.restoreNavState(committed);
  }
  /**
  * Write address bar when policy requires (`push` / `replace` + `syncHistory`).
  * Call {@link notifyUrlAligned} after this. Idempotent via `historyCommitted`.
  */
  commitHistoryIfNeeded(transition) {
    if (transition.historyCommitted) return;
    const { from, to, href, action, historyOptions } = transition;
    if (!historyOptions.syncHistory || action !== "push" && action !== "replace") return;
    if (from && isSameNavigationTarget(from, to)) return;
    applyTransactionHistory({ status: "navigationSucceeded" }, action, href, from?.href ?? null, historyOptions, this.provider);
    transition.historyCommitted = true;
  }
  /**
  * Address bar matches navigation target (`historyCommitted` write, or `system` / `pop`).
  * Delegates to {@link NavigationPulse.alignUrl} (`navigation:url-aligned`).
  */
  notifyUrlAligned(transition) {
    this.pulse.alignUrl(transition);
  }
  /**
  * View promoted: {@link NavigationPulse.commitEnd} (`commit:end` + `node:activate`),
  * then update `prev` and optional hash scroll.
  */
  commitNavigation(transition) {
    this.pulse.commitEnd(transition);
    if (transition.hash) this.scrollToHash?.(transition.hash);
    this.prev = transition.to;
  }
  reportNavigationHookError(hookError, parent) {
    this.config.onNavigationHookError?.({
      error: hookError,
      phase: "error",
      parent
    });
  }
  initPrefetch() {
    if (this.config.prefetch === false) return;
    const prefetchConfig = {
      ...this.config.prefetch,
      currentHref: () => this.provider.currentHref
    };
    const prefetchPolicy = new PrefetchPolicy(prefetchConfig);
    const runSpeculativePrepare = async (plan, ctx) => {
      if (ctx.signal.aborted) return;
      const probe = new NavigationTransaction(0, {
        from: this.prev,
        to: plan.leaf,
        href: plan.href,
        hash: plan.hash,
        action: "push",
        options: {
          replace: false,
          syncHistory: false
        },
        phaseMode: "prefetch"
      }, () => ctx.signal.aborted, this);
      const clearOnAbort = onAbort(ctx.signal, () => probe.cancel());
      try {
        await probe.runSpeculativePrepare();
      } finally {
        clearOnAbort();
      }
    };
    this.prefetchPipeline = new PrefetchPipeline({
      matcher: this.matcher,
      getMatchableNodes: () => this.registry.getMatchableNodes(),
      getRegistryGeneration: () => this.registry.generationId,
      planner: new DefaultPrefetchResourcePlanner({ view: true }, prefetchPolicy),
      runSpeculativePrepare
    }, prefetchConfig, { linksSelector: this.config.linksSelector });
  }
  resetPrefetchRecords(options) {
    if (!this.prefetchPipeline) return;
    if (options.path) {
      this.prefetchPipeline.resetPrefetchRecords(options.path);
      return;
    }
    if (!options.key && !options.match) this.prefetchPipeline.resetPrefetchRecords();
  }
  /** Observe → apply for pre-match failures (`id: 0`). */
  settleAndApplyPreMatchFailure(failure, action, href, options) {
    const result = failure.toResult();
    this.pulse.settle(0, result);
    applyNavigationOutcome(result, {
      action,
      href,
      fromHref: this.prev?.href ?? null,
      historyOptions: options
    }, this.applyOutcomeContext());
  }
  applyOutcomeContext() {
    return {
      provider: this.provider,
      onNotFound: this.config.onNotFound,
      setPrev: (prev) => {
        this.prev = prev;
      },
      navigateTo: (url, action, options) => {
        this.navigateTo(url, action, options);
      }
    };
  }
  /** Hash-only на том же path — без processor. */
  finalizeHashOnlyNavigation(href, options, hash) {
    this.provider.commit(href, options);
    if (this.prev) syncChainHref(this.prev, href, hash);
    this.config.onHashOnlyNavigation?.(href);
    if (hash) this.scrollToHash(hash);
  }
  scrollToHash(hash) {
    const id = hash.startsWith("#") ? hash.slice(1) : hash;
    if (!id) return;
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView();
    });
  }
};

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/hooks/define-hook.js
function defineRouteHook(nameOrDef, fn, meta) {
  if (typeof nameOrDef !== "string") return Object.freeze({ ...nameOrDef });
  const def = {
    name: nameOrDef,
    version: meta?.version ?? "1.0.0",
    fn
  };
  if (meta?.requires !== void 0) def.requires = meta.requires;
  return Object.freeze(def);
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/link-active/match.js
function matchLinkActiveParts(link, current) {
  if (link.hash) return {
    exact: link.pathname === current.pathname && link.search === current.search && link.hash === current.hash,
    prefix: false
  };
  if (current.hash) return {
    exact: false,
    prefix: false
  };
  const { pathname: linkPath, search: linkSearch } = link;
  const { pathname: currentPath, search: currentSearch } = current;
  if (linkSearch && linkSearch !== currentSearch) return {
    exact: false,
    prefix: false
  };
  const exact = linkSearch === currentSearch && linkPath === currentPath;
  let prefix = exact;
  if (!prefix && linkPath !== "/") {
    const len = linkPath.length;
    prefix = currentPath.length > len && currentPath.charCodeAt(len) === 47 && currentPath.startsWith(linkPath);
  }
  return {
    exact,
    prefix
  };
}
function matchLinkActive(linkHref, current) {
  return matchLinkActiveParts(splitAppHref(linkHref), current);
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/link-active/sync.js
function syncRouterActiveLinks(options) {
  const exactClasses = options.linkActiveClass?.split(/\s+/).filter(Boolean) ?? [];
  const prefixClasses = options.linkActiveBranchClass?.split(/\s+/).filter(Boolean) ?? [];
  if (!exactClasses.length && !prefixClasses.length) return;
  const { container, linksSelector, currentHref } = options;
  const current = splitAppHref(currentHref);
  for (const node of container.querySelectorAll(linksSelector)) {
    if (!(node instanceof HTMLAnchorElement)) continue;
    const linkHref = resolveLinkHref(node, currentHref);
    const { exact, prefix } = linkHref ? matchLinkActive(linkHref, current) : {
      exact: false,
      prefix: false
    };
    for (const c of exactClasses) node.classList.toggle(c, exact);
    for (const c of prefixClasses) node.classList.toggle(c, prefix);
    if (exact) node.setAttribute("aria-current", "page");
    else node.removeAttribute("aria-current");
  }
}

// node_modules/@auraui/router/dist/modules/aura-routing-engine/core/link-active/active-route-branch.js
function toActiveRouteBranch(chain) {
  return chain.map((e) => ({
    pattern: e.pattern,
    href: e.href
  }));
}

// node_modules/@auraui/router/dist/modules/aura-router/core/install.js
function installAuraRouter() {
  registerComponent(AuraOutlet);
  registerComponent(AuraRoute);
  registerComponent(AuraRouter);
}

// node_modules/@auraui/router/dist/modules/aura-router/core/outlet-resolver.js
function resolveAppOutlet(host) {
  const selector = host.outletSelector;
  if (selector) {
    const found = document.querySelector(selector);
    if (!isAuraOutlet(found)) throw new Error(`\`<aura-router outlet="${selector}">\` did not match an \`<${AuraOutlet.is}>\`.`);
    return found;
  }
  if (isAuraOutlet(host.previousElementSibling)) return host.previousElementSibling;
  if (isAuraOutlet(host.nextElementSibling)) return host.nextElementSibling;
  const nested = host.querySelector(AuraOutlet.is);
  if (isAuraOutlet(nested)) return nested;
  const created = document.createElement(AuraOutlet.is);
  host.parentNode?.insertBefore(created, host);
  return created;
}
function isAuraOutlet(el) {
  return el?.localName === AuraOutlet.is;
}

// node_modules/@auraui/router/dist/modules/aura-router/core/navigation-events.js
function emit(router2, type, detail, init) {
  return dispatchCustomEvent(router2, type, {
    ...init,
    detail: {
      ...detail,
      router: router2
    }
  });
}
var AURA_ROUTER_NAVIGATION_START = "navigation-start";
var AURA_ROUTER_NAVIGATION = "navigation";
var AURA_ROUTER_LOAD_START = "load-start";
var AURA_ROUTER_LOAD_END = "load-end";
var AURA_ROUTER_LOAD_ERROR = "load-error";
var AURA_ROUTER_NAVIGATION_COMPLETE = "navigation-complete";
var AURA_ROUTER_NAVIGATION_CANCEL = "navigation-cancel";
var AURA_ROUTER_NAVIGATION_REDIRECT = "navigation-redirect";
var AURA_ROUTER_NAVIGATION_ERROR = "navigation-error";
var AURA_ROUTER_NAVIGATION_HOOK_ERROR = "navigation-hook-error";
function toRouterNavigationErrorDetail(failure) {
  return {
    error: failure.error,
    href: failure.href,
    from: failure.from?.pathname ?? null,
    to: failure.to?.pathname ?? null,
    phase: failure.error.phase,
    viewCommitted: failure.viewCommitted,
    code: failure.error.code
  };
}
function dispatchNavigationError(router2, failure) {
  emit(router2, AURA_ROUTER_NAVIGATION_ERROR, toRouterNavigationErrorDetail(failure));
}
function dispatchNavigationHookError(router2, detail) {
  emit(router2, AURA_ROUTER_NAVIGATION_HOOK_ERROR, {
    error: detail.error,
    phase: "error",
    parent: {
      router: router2,
      ...toRouterNavigationErrorDetail(detail.parent)
    }
  });
  console.error("[error] hook failed:", detail.error);
}
var AURA_ROUTER_NOT_FOUND = "not-found";
function dispatchNotFound(router2, url, source) {
  return emit(router2, AURA_ROUTER_NOT_FOUND, {
    url,
    source
  }, { cancelable: source === "fallback" });
}
var AURA_ROUTER_DATA_INVALIDATED = "data-invalidated";

// node_modules/@auraui/router/dist/modules/aura-router/core/engine-bridge.js
function navigationDomDetail(from, to) {
  return {
    from: from?.pathname ?? null,
    to: to.href,
    pathname: to.pathname
  };
}
function connectRouterEngine(host, deps) {
  return {
    config: {
      onHashOnlyNavigation: deps.onHashOnlyNavigation,
      onNavigationHookError: (detail) => {
        dispatchNavigationHookError(host, detail);
      },
      onNotFound: (failure) => {
        deps.syncBranchAndActiveLinks(failure.href);
        if (dispatchNotFound(host, failure.href, "fallback")) deps.notFound.recover(failure.href);
      }
    },
    onEvent: (event) => onEngineEvent(host, deps, event)
  };
}
function onEngineEvent(host, deps, event) {
  const { syncBranchAndActiveLinks, scrollRestoration, notFound } = deps;
  switch (event.type) {
    case "navigation:url-aligned":
      syncBranchAndActiveLinks(event.to.href, event.to);
      emit(host, AURA_ROUTER_NAVIGATION_START, navigationDomDetail(event.from, event.to));
      return;
    case "load:start":
      emit(host, AURA_ROUTER_LOAD_START, {
        id: event.id,
        nodeId: event.nodeId,
        pattern: event.pattern
      });
      return;
    case "load:end":
      emit(host, AURA_ROUTER_LOAD_END, {
        id: event.id,
        nodeId: event.nodeId,
        pattern: event.pattern
      });
      return;
    case "load:error":
      emit(host, AURA_ROUTER_LOAD_ERROR, {
        id: event.id,
        nodeId: event.nodeId,
        pattern: event.pattern,
        error: event.error
      });
      return;
    case "navigation:commit:end":
      notFound.clear();
      if (isCatchAllRoutePattern(event.to.pattern)) dispatchNotFound(host, event.to.href, "route");
      scrollRestoration.apply({
        from: event.from,
        to: event.to,
        action: event.action,
        hash: event.hash
      });
      syncBranchAndActiveLinks(event.to.href, event.to);
      emit(host, AURA_ROUTER_NAVIGATION, navigationDomDetail(event.from, event.to));
      return;
    case "navigation:finish":
      emit(host, AURA_ROUTER_NAVIGATION_COMPLETE, { id: event.id });
      return;
    case "navigation:cancel":
      emit(host, AURA_ROUTER_NAVIGATION_CANCEL, {
        id: event.id,
        reason: event.reason
      });
      return;
    case "navigation:redirect":
      emit(host, AURA_ROUTER_NAVIGATION_REDIRECT, {
        id: event.id,
        url: event.url,
        replace: event.replace
      });
      return;
    case "navigation:error":
      if (event.failure.viewCommitted) notFound.clear();
      if (event.failure.isNotFound) return;
      dispatchNavigationError(host, event.failure);
      return;
    case "navigation:nav-state-restore":
      syncBranchAndActiveLinks(event.to.href, event.to);
      return;
    default:
      return;
  }
}

// node_modules/@auraui/router/dist/modules/aura-router/core/not-found-controller.js
var NOT_FOUND_VIEW_KEY = "__not-found__";
var configuredHandler = null;
var AuraRouterNotFoundController = class {
  constructor(router2) {
    this.handler = null;
    this.router = router2;
  }
  static configure(handler) {
    configuredHandler = handler ?? null;
  }
  setHandler(handler) {
    this.handler = handler;
  }
  /** Fallback recovery UI after cancelable `not-found` (unless preventDefault). */
  recover(url) {
    this.clear();
    const handler = this.handler ?? configuredHandler;
    if (handler) {
      handler(url, this.router);
      return;
    }
    const content = this.router.errorTemplate ? getTemplate(this.router.errorTemplate) : `Page not found: ${url}`;
    const handle = this.router.appOutlet.apply(content, {
      strategy: "replace",
      key: NOT_FOUND_VIEW_KEY
    });
    if (!handle) return;
    this.viewHandle = handle;
    handle.viewRoot.querySelectorAll("[data-not-found-url]").forEach((el) => {
      el.textContent = url;
    });
  }
  /** Drop mounted fallback view (disconnect / successful commit / committed error). */
  clear() {
    this.viewHandle?.destroy();
    this.viewHandle = void 0;
  }
};

// node_modules/@auraui/router/dist/modules/aura-router/core/scroll-restoration.js
var ScrollRestoration = class {
  constructor(container = window) {
    this.positions = /* @__PURE__ */ new Map();
    this.container = container;
  }
  clear() {
    this.positions.clear();
  }
  apply(ctx) {
    const { from, to, action, hash } = ctx;
    if (from?.route.scrollPolicy === "restore") this.positions.set(from.pathname + from.search, this.container.scrollY);
    if (hash) return;
    const policy = to.route.scrollPolicy;
    if (policy !== "top" && policy !== "restore") return;
    const y = policy === "restore" && action === "pop" ? this.positions.get(to.pathname + to.search) : 0;
    if (y === void 0) return;
    requestAnimationFrame(() => this.container.scrollTo(0, y));
  }
};

// node_modules/@auraui/router/dist/modules/aura-router/core/aura-router.js
var AuraRouter = class extends HTMLElement {
  constructor(..._args) {
    super(..._args);
    this.scrollRestoration = new ScrollRestoration();
    this.notFound = new AuraRouterNotFoundController(this);
    this._activeRouteBranch = [];
  }
  static {
    this.is = "aura-router";
  }
  /**
  * Matched branch root → leaf.
  * Also refreshed on url-align / nav-state-restore (not only after commit).
  */
  get activeRouteBranch() {
    return this._activeRouteBranch;
  }
  /** All descendant `<aura-route>` nodes (`querySelectorAll`, not only direct children). */
  get routes() {
    return this.querySelectorAll(AuraRoute.is);
  }
  /**
  * Outlet for fallback 404 / top-level mounts.
  * Resolve order: `outlet` attr → prev/next sibling → nested → create sibling before host.
  */
  get appOutlet() {
    return resolveAppOutlet(this);
  }
  /** Also registers `<aura-outlet>` and `<aura-route>`. */
  static install() {
    installAuraRouter();
  }
  static configure(options) {
    if (options.domCache) RouteDomCache.configure(options.domCache);
    if (options.viewCache) ViewGraph.configure(options.viewCache);
    if (options.dataCache) DataGraph.configure(options.dataCache);
    if ("notFoundHandler" in options) AuraRouterNotFoundController.configure(options.notFoundHandler);
  }
  static use(hookOrName, fnOrOptions, options) {
    if (typeof hookOrName === "string") {
      defaultHookRegistry.register(defineRouteHook(hookOrName, fnOrOptions), options ?? {});
      return;
    }
    defaultHookRegistry.register(hookOrName, fnOrOptions ?? {});
  }
  /** @returns `true` if a hook with that name was registered */
  static unuse(name) {
    return defaultHookRegistry.unregister(name);
  }
  /** Custom view loader on the shared {@link defaultLoaderRegistry}. */
  static registerLoader(id, fn, options) {
    defaultLoaderRegistry.register(id, fn, options);
  }
  /** @throws if `id` is unknown */
  static getLoader(id) {
    return defaultLoaderRegistry.get(id);
  }
  connectedCallback() {
    const engine = this.ensureEngine();
    if (engine.isRunning) engine.stop();
    customElements.whenDefined(AuraRoute.is).then(() => {
      if (!this.isConnected) return;
      this.refreshRoutes();
      this.ensureEngine().start();
    });
  }
  disconnectedCallback() {
    this.engine?.destroy();
    this.engine = void 0;
    this._activeRouteBranch = [];
    memoize.clear(this, "appOutlet");
    this.scrollRestoration.clear();
    this.notFound.clear();
  }
  /** Defaults: `replace: false` → history `push`; `syncHistory: true`. */
  navigate(path, options = {}) {
    const replace = options.replace ?? false;
    this.ensureEngine().navigateTo(path, replace ? "replace" : "push", {
      replace,
      syncHistory: options.syncHistory ?? true
    });
  }
  prefetch(href, options) {
    return this.ensureEngine().prefetch(href, options);
  }
  /**
  * Dispatches `data-invalidated` unless `options.cache === 'view'`.
  * @returns affected count; `-1` if a full invalidate hit an empty cache
  */
  invalidate(options) {
    const count = this.ensureEngine().invalidate(options);
    if (options?.cache !== "view") emit(this, AURA_ROUTER_DATA_INVALIDATED, { count });
    return count;
  }
  refreshRoutes() {
    this.ensureEngine().replaceRoutes(Array.from(this.routes));
  }
  /** Per-instance override (перекрывает configure и `error-template`). Только fallback. */
  setNotFoundHandler(handler) {
    this.notFound.setHandler(handler);
  }
  /** @internal Used by AuraRoute / RouteViewController. Not a supported app API. */
  resolveViewPort() {
    return this.ensureEngine().viewGraph;
  }
  ensureEngine() {
    if (!this.engine) {
      const { config, onEvent } = connectRouterEngine(this, {
        syncBranchAndActiveLinks: (href, to) => this.syncBranchAndActiveLinks(href, to),
        scrollRestoration: this.scrollRestoration,
        notFound: this.notFound,
        onHashOnlyNavigation: (href) => this.applyHashOnlyNavigation(href)
      });
      this.engine = new AuraRoutingEngine(this, {
        linksSelector: this.linksSelector,
        prefetch: resolvePrefetchEngineConfig(this.prefetchDomAttr),
        ...config
      });
      this.engine.events.subscribe(onEvent);
    }
    return this.engine;
  }
  syncBranchAndActiveLinks(href, to = null) {
    this._activeRouteBranch = to ? toActiveRouteBranch(to.chain ?? [to]) : [];
    this.syncActiveLinks(href);
  }
  /** Keep patterns, rewrite hrefs, refresh active links. */
  applyHashOnlyNavigation(href) {
    if (this._activeRouteBranch.length) this._activeRouteBranch = this._activeRouteBranch.map((e) => ({
      pattern: e.pattern,
      href
    }));
    this.syncActiveLinks(href);
  }
  /**
  * No-op when both active classes are unset.
  * Scan root: `linksContainerSelector` → `closest` (else this host); otherwise `ownerDocument`.
  */
  syncActiveLinks(href) {
    const { linkActiveClass, linkActiveBranchClass } = this;
    if (!linkActiveClass && !linkActiveBranchClass) return;
    syncRouterActiveLinks({
      container: this.linksContainerSelector ? this.closest(this.linksContainerSelector) ?? this : this.ownerDocument,
      linksSelector: this.linksSelector,
      linkActiveClass: linkActiveClass ?? void 0,
      linkActiveBranchClass: linkActiveBranchClass ?? void 0,
      currentHref: href
    });
  }
};
__decorate([attr({
  parser: parseNullableString,
  cached: true,
  name: "outlet"
})], AuraRouter.prototype, "outletSelector", void 0);
__decorate([attr({
  readonly: true,
  cached: true
})], AuraRouter.prototype, "errorTemplate", void 0);
__decorate([attr({
  readonly: true,
  cached: true
})], AuraRouter.prototype, "loadingTemplate", void 0);
__decorate([attr({
  readonly: true,
  cached: true
})], AuraRouter.prototype, "loadingBodyClass", void 0);
__decorate([attr({
  readonly: true,
  cached: true
})], AuraRouter.prototype, "loadingStartEvent", void 0);
__decorate([attr({
  readonly: true,
  cached: true
})], AuraRouter.prototype, "loadingEndEvent", void 0);
__decorate([attr({ defaultValue: "[aura-router-link]" })], AuraRouter.prototype, "linksSelector", void 0);
__decorate([attr({
  parser: parseNullableString,
  cached: true
})], AuraRouter.prototype, "linksContainerSelector", void 0);
__decorate([attr({
  parser: parseNullableString,
  cached: true
})], AuraRouter.prototype, "linkActiveClass", void 0);
__decorate([attr({
  parser: parseNullableString,
  cached: true
})], AuraRouter.prototype, "linkActiveBranchClass", void 0);
__decorate([attr({
  parser: parseScrollAttr,
  cached: true,
  name: "scroll"
})], AuraRouter.prototype, "scrollPolicy", void 0);
__decorate([attr({
  parser: parseNullableString,
  cached: true
})], AuraRouter.prototype, "extract", void 0);
__decorate([attr({
  parser: parsePrefetchAttr,
  cached: true,
  name: "prefetch"
})], AuraRouter.prototype, "prefetchDomAttr", void 0);
__decorate([attr({
  parser: parseMountStrategyAttr,
  cached: true
})], AuraRouter.prototype, "mountStrategy", void 0);
__decorate([memoize()], AuraRouter.prototype, "appOutlet", null);

// node_modules/@auraui/router/dist/modules/aura-route/core/aura-route.js
var AURA_ROUTE_LOADING_START = "aura-route-loading";
var AURA_ROUTE_LOADING_END = "aura-route-loading-end";
var idCounter = 0;
var AuraRoute = class AuraRoute2 extends HTMLElement {
  constructor(..._args) {
    super(..._args);
    this.uid = ++idCounter;
    this.viewReady = false;
    this.initGeneration = 0;
    this.passId = 0;
    this.loadingActive = false;
    this.loadingTemplateStaged = false;
  }
  static {
    this.is = "aura-route";
  }
  /** Attrs that feed {@link viewKeySuffix}; changes call {@link refresh}. */
  static get observedAttributes() {
    return [
      "layout",
      "view",
      "extract"
    ];
  }
  get nestedOutlet() {
    return this.viewController?.nestedOutlet ?? null;
  }
  get type() {
    if (this.redirect.trim()) return "redirect";
    if (this.hasChildrenRoutes) return "folder";
    return "page";
  }
  get hasChildrenRoutes() {
    return this.querySelector(`:scope > ${AuraRoute2.is}`);
  }
  get hasLayout() {
    return !!this.layout.trim();
  }
  get hasViewContent() {
    if (this.type === "redirect") return false;
    if (this.type === "folder") return this.hasLayout;
    return !!this.view;
  }
  get hasLeave() {
    return !!this.leave?.length;
  }
  get hasGuard() {
    return !!this.guard?.length;
  }
  get hasLoad() {
    return !!this.load?.length;
  }
  get hasUpdate() {
    return !!this.update?.length;
  }
  get hasTransitionIn() {
    return !!this.transitionIn;
  }
  get hasReady() {
    return !!this.transitionOut || !!this.ready?.length;
  }
  get hasAsyncContent() {
    if (this.hasLoad) return true;
    return isAsyncLoader(this.view?.loader);
  }
  /** Sync builtin view (`html` / `template` / `component`) without layout or async work. */
  get hasSyncContent() {
    if (this.type !== "page" || this.hasLayout || this.hasAsyncContent) return false;
    return isSyncLoader(this.view?.loader);
  }
  get hasDataCache() {
    return this.cache.data;
  }
  get hasViewCache() {
    return this.cache.view;
  }
  get hasDomCache() {
    return this.cache.dom;
  }
  get transition() {
    return this.initTransition();
  }
  get transitionIn() {
    return this.transition.in;
  }
  get transitionOut() {
    return this.transition.out;
  }
  /**
  * Suffix of `viewKey` / resource identity (`layout:template:…` / `view:…`).
  * Memoized; cleared in {@link refresh} when `layout` / `view` / `extract` change.
  */
  get viewKeySuffix() {
    const layout = this.layout.trim();
    if (layout) return `layout:template:${layout}`;
    const view = this.view;
    if (!view?.loader || !view.content) return null;
    const slot = `view:${view.loader}:${view.content}`;
    return view.loader === "url" && this.extract ? `${slot}::${this.extract}` : slot;
  }
  /**
  * Whether the view loader declares `needsData` (DataGraph payload in the cache key).
  * `undefined` when there is no view loader.
  */
  get viewLoaderNeedsData() {
    if (!this.view?.loader) return void 0;
    const loader = AuraRouter.getLoader(this.view?.loader);
    return loader.constructor.needsData || loader.needsData;
  }
  connectedCallback() {
    this.initGeneration++;
    const generation = this.initGeneration;
    this.viewReady = false;
    this.setupDone = this.init(generation);
  }
  disconnectedCallback() {
    this.passId++;
    this.initGeneration++;
    this.viewReady = false;
    if (this.loadingActive) this.hideLoading();
    this.viewController?.cancel();
  }
  attributeChangedCallback(_attrName, _oldVal, _newVal) {
    this.refresh();
  }
  refresh() {
    routeAttr.clear(this);
    memoize.clear(this, ["transition", "viewKeySuffix"]);
  }
  resolveAndMountView(routeInfo, options) {
    return this.setupDone.then(() => {
      this.throwIfInvalidAttrs();
      this.passId++;
      return this.viewController.resolveAndMountView(routeInfo, options);
    });
  }
  /** Sync branch-atomic mount — caller must finish branch resolve first. */
  mountResolvedView(routeInfo, options) {
    if (!this.viewReady || !this.viewController) return {
      status: "error",
      error: new DOMException("AuraRoute not initialized", "InvalidStateError")
    };
    this.throwIfInvalidAttrs();
    this.passId++;
    return this.viewController.mountResolvedView(routeInfo, options);
  }
  commitStagedView() {
    this.viewController?.commitStagedView();
  }
  revertInFlightView() {
    this.viewController?.revertInFlightView();
  }
  /** Validate route attrs for the detected {@link type}; throws on invalid combinations. */
  validateAttrs() {
    this.throwIfInvalidAttrs();
  }
  onLeave(ctx) {
  }
  onGuard(ctx) {
  }
  onLoad(ctx) {
  }
  /**
  * Prepare-window loading chrome: body class, start event, optional skeleton mount.
  * Called by the engine around `runLoads` (after guards → load end).
  *
  * `loading-template` is skipped when the route has a page transition — skeleton
  * would fight old→new animation; use `loading-body-class` / events instead.
  */
  showLoading(routeInfo) {
    if (this.loadingActive) return;
    this.loadingActive = true;
    if (this.loadingBodyClass) document.body.classList.add(this.loadingBodyClass);
    if (this.loadingStartEvent) dispatchCustomEvent(this, this.loadingStartEvent, { detail: { routeInfo } });
    if (this.transition.order !== null) return;
    if (!this.loadingTemplate || !this.viewReady || !this.viewController) return;
    try {
      this.passId++;
      this.viewController.mountLoadingTemplate(routeInfo, getTemplate(this.loadingTemplate));
      this.loadingTemplateStaged = true;
    } catch (error) {
      console.warn(`Failed to render loadingTemplate for route "${this.path}":`, error);
    }
  }
  /** Clears body class, end event, and staged `loading-template` from {@link showLoading}. */
  hideLoading() {
    if (!this.loadingActive) return;
    this.loadingActive = false;
    if (this.loadingTemplateStaged) {
      this.loadingTemplateStaged = false;
      this.viewController?.revertInFlightView();
    }
    if (this.loadingBodyClass) document.body.classList.remove(this.loadingBodyClass);
    if (this.loadingEndEvent) dispatchCustomEvent(this, this.loadingEndEvent);
  }
  onUpdate(ctx) {
    this.passId++;
  }
  onTransitionOut(ctx) {
  }
  onTransitionIn(ctx) {
  }
  onUnmount(ctx) {
    this.passId++;
    this.viewController?.onUnmount({ domCacheKey: domCacheKey(ctx.to, this.path) });
  }
  onReady(ctx) {
  }
  onError(ctx) {
  }
  /** Merges decl attrs with `transition` shortcut; `none`/`off`/`false` on decl opts out of inherited shortcut on that side. */
  initTransition() {
    const inMerged = this.transitionInDecl ?? this.transitionShortcut?.in;
    const outMerged = this.transitionOutDecl ?? this.transitionShortcut?.out;
    const inHooks = inMerged?.length ? inMerged : null;
    const outHooks = outMerged?.length ? outMerged : null;
    if (!this.transitionOrder && !inHooks && !outHooks) return NO_TRANSITION;
    return {
      order: this.transitionOrder ?? "parallel",
      in: inHooks,
      out: outHooks
    };
  }
  async init(generation) {
    await customElements.whenDefined(AuraRouter.is);
    if (generation !== this.initGeneration || !this.isConnected) throw new DOMException("AuraRoute init aborted", "AbortError");
    const router2 = this.closest(AuraRouter.is);
    if (!router2) throw new DOMException("aura-route should be inside aura-router", "NotFoundError");
    if (!this.path) throw new Error("AuraRoute must have a path attribute");
    const mountTarget = {
      appOutlet: () => router2.appOutlet,
      nestedOutlet: (routeInfo) => routeInfo.node?.parent?.route.nestedOutlet ?? null
    };
    this.viewController = new RouteViewController({
      route: this,
      view: router2.resolveViewPort(),
      cache: defaultDomCache,
      mountTarget
    }, () => this.passId);
    this.viewReady = true;
  }
  throwIfInvalidAttrs() {
    const path = this.path;
    if (this.type === "redirect") {
      if (this.hasChildrenRoutes) throw new Error(`AuraRoute redirect "${path}" cannot have nested child routes`);
      if (this.view) throw new Error(`AuraRoute redirect "${path}" cannot declare view`);
      if (this.hasLayout) throw new Error(`AuraRoute redirect "${path}" cannot declare layout`);
      return;
    }
    if (this.type === "folder") {
      if (this.view) throw new Error(`AuraRoute folder "${path}" cannot declare view \u2014 use nested child routes`);
      if (!this.hasLayout) throw new Error(`AuraRoute folder "${path}" has no layout`);
      return;
    }
    if (!this.view) throw new Error(`AuraRoute page "${path}" has no view`);
  }
};
__decorate([routeAttr({ inherit: false })], AuraRoute.prototype, "path", void 0);
__decorate([routeAttr({ inherit: false })], AuraRoute.prototype, "redirect", void 0);
__decorate([routeAttr({
  inherit: false,
  cached: false
})], AuraRoute.prototype, "layout", void 0);
__decorate([routeAttr({
  inherit: false,
  parser: parseViewAttr
})], AuraRoute.prototype, "view", void 0);
__decorate([routeAttr({ parser: parseInheritableNullableString })], AuraRoute.prototype, "extract", void 0);
__decorate([routeAttr({ parser: parseInheritableNullableString })], AuraRoute.prototype, "loadingTemplate", void 0);
__decorate([routeAttr({ parser: parseInheritableNullableString })], AuraRoute.prototype, "loadingBodyClass", void 0);
__decorate([routeAttr({
  parser: parseInheritableNullableString,
  defaultValue: AURA_ROUTE_LOADING_START
})], AuraRoute.prototype, "loadingStartEvent", void 0);
__decorate([routeAttr({
  parser: parseInheritableNullableString,
  defaultValue: AURA_ROUTE_LOADING_END
})], AuraRoute.prototype, "loadingEndEvent", void 0);
__decorate([routeAttr({ parser: parseInheritableNullableString })], AuraRoute.prototype, "errorTemplate", void 0);
__decorate([routeAttr({ parser: parseHookList })], AuraRoute.prototype, "leave", void 0);
__decorate([routeAttr({ parser: parseHookList })], AuraRoute.prototype, "guard", void 0);
__decorate([routeAttr({ parser: parseHookList })], AuraRoute.prototype, "load", void 0);
__decorate([routeAttr({ parser: parseHookList })], AuraRoute.prototype, "update", void 0);
__decorate([routeAttr({
  parser: parseTransitionShortcutAttr,
  name: "transition"
})], AuraRoute.prototype, "transitionShortcut", void 0);
__decorate([routeAttr({ parser: parseTransitionOrder })], AuraRoute.prototype, "transitionOrder", void 0);
__decorate([routeAttr({
  parser: parseHookList,
  name: "transition-out"
})], AuraRoute.prototype, "transitionOutDecl", void 0);
__decorate([routeAttr({
  parser: parseHookList,
  name: "transition-in"
})], AuraRoute.prototype, "transitionInDecl", void 0);
__decorate([routeAttr({ parser: parseHookList })], AuraRoute.prototype, "unmount", void 0);
__decorate([routeAttr({ parser: parseHookList })], AuraRoute.prototype, "ready", void 0);
__decorate([routeAttr({ parser: parseHookList })], AuraRoute.prototype, "error", void 0);
__decorate([routeAttr({ parser: parseParamChangeAttr })], AuraRoute.prototype, "paramChange", void 0);
__decorate([routeAttr({
  parser: parseScrollAttr,
  name: "scroll"
})], AuraRoute.prototype, "scrollPolicy", void 0);
__decorate([routeAttr({ parser: parsePrefetchAttr })], AuraRoute.prototype, "prefetch", void 0);
__decorate([routeAttr({ parser: parseMountStrategyAttr })], AuraRoute.prototype, "mountStrategy", void 0);
__decorate([routeAttr({ parser: parseCacheAttr })], AuraRoute.prototype, "cache", void 0);
__decorate([routeAttr({ parser: parseNumber })], AuraRoute.prototype, "cacheTime", void 0);
__decorate([routeAttr({ parser: parseNumber })], AuraRoute.prototype, "cacheRefresh", void 0);
__decorate([memoize()], AuraRoute.prototype, "transition", null);
__decorate([memoize()], AuraRoute.prototype, "viewKeySuffix", null);

// src/catalog.js
var ERAS = {
  dreams: "\u041C\u0435\u0447\u0442\u0430",
  dawn: "\u0420\u0430\u0441\u0441\u0432\u0435\u0442",
  flight: "\u041F\u043E\u043B\u0451\u0442",
  orbit: "\u041E\u0440\u0431\u0438\u0442\u0430"
};
var EVENTS = {
  tsiolkovsky: "\u0426\u0438\u043E\u043B\u043A\u043E\u0432\u0441\u043A\u0438\u0439",
  sputnik: "\u0421\u043F\u0443\u0442\u043D\u0438\u043A-1",
  gagarin: "\u0413\u0430\u0433\u0430\u0440\u0438\u043D",
  tereshkova: "\u0422\u0435\u0440\u0435\u0448\u043A\u043E\u0432\u0430",
  leonov: "\u041B\u0435\u043E\u043D\u043E\u0432",
  salyut: "\u0421\u0430\u043B\u044E\u0442",
  mir: "\u0421\u0442\u0430\u043D\u0446\u0438\u044F \xAB\u041C\u0438\u0440\xBB"
};
var BODIES = {
  earth: "\u0417\u0435\u043C\u043B\u044F",
  moon: "\u041B\u0443\u043D\u0430",
  venus: "\u0412\u0435\u043D\u0435\u0440\u0430",
  mars: "\u041C\u0430\u0440\u0441"
};
var MISSIONS = {
  "vostok-1": "\u0412\u043E\u0441\u0442\u043E\u043A-1",
  "luna-9": "\u041B\u0443\u043D\u0430-9",
  "venera-7": "\u0412\u0435\u043D\u0435\u0440\u0430-7",
  "mars-3": "\u041C\u0430\u0440\u0441-3"
};
var MODULES = {
  base: "\u0411\u0430\u0437\u043E\u0432\u044B\u0439 \u0431\u043B\u043E\u043A",
  kvant: "\u041A\u0432\u0430\u043D\u0442",
  "kvant-2": "\u041A\u0432\u0430\u043D\u0442-2",
  kristall: "\u041A\u0440\u0438\u0441\u0442\u0430\u043B\u043B",
  spektr: "\u0421\u043F\u0435\u043A\u0442\u0440",
  priroda: "\u041F\u0440\u0438\u0440\u043E\u0434\u0430"
};
var SCALES = {
  heliosphere: "\u0413\u0435\u043B\u0438\u043E\u0441\u0444\u0435\u0440\u0430",
  oort: "\u041E\u0431\u043B\u0430\u043A\u043E \u041E\u043E\u0440\u0442\u0430",
  "milky-way": "\u041C\u043B\u0435\u0447\u043D\u044B\u0439 \u041F\u0443\u0442\u044C",
  "local-group": "\u041C\u0435\u0441\u0442\u043D\u0430\u044F \u0433\u0440\u0443\u043F\u043F\u0430",
  observable: "\u041D\u0430\u0431\u043B\u044E\u0434\u0430\u0435\u043C\u0430\u044F \u0412\u0441\u0435\u043B\u0435\u043D\u043D\u0430\u044F"
};
var KEYS = {
  callsign: "orbit-callsign",
  bounce: "orbit-guard-bounce"
};
var TOUR = [
  {
    id: "chronicle",
    label: "\u0425\u0440\u043E\u043D\u0438\u043A\u0430",
    href: "/chronicle",
    match: (p) => p === "/chronicle",
    nextLabel: "\u041A \u043F\u043E\u043B\u0451\u0442\u0443 \u0413\u0430\u0433\u0430\u0440\u0438\u043D\u0430",
    nextHref: "/chronicle/flight/gagarin",
    aura: "\u0425\u0430\u0431 \u0440\u0430\u0437\u0434\u0435\u043B\u0430: \u043E\u0431\u0437\u043E\u0440 \u0432\u0441\u0435\u0439 \u043B\u0435\u043D\u0442\u044B \u0434\u043E \u0432\u0445\u043E\u0434\u0430 \u0432 nested-\u044D\u043F\u043E\u0445\u0438."
  },
  {
    id: "event",
    label: "\u0421\u043E\u0431\u044B\u0442\u0438\u0435",
    href: "/chronicle/flight/gagarin",
    match: (p) => p === "/chronicle/flight/gagarin",
    nextLabel: "\u041C\u0438\u0441\u0441\u0438\u044F \u0412\u043E\u0441\u0442\u043E\u043A-1",
    nextHref: "/system/earth/missions/vostok-1",
    aura: "Nested: \u044D\u043F\u043E\u0445\u0430 \u043E\u0441\u0442\u0430\u0451\u0442\u0441\u044F, \u043C\u0435\u043D\u044F\u0435\u0442\u0441\u044F \u0441\u043E\u0431\u044B\u0442\u0438\u0435 (era-chrome)."
  },
  {
    id: "mission",
    label: "\u041C\u0438\u0441\u0441\u0438\u044F",
    href: "/system/earth/missions/vostok-1",
    match: (p) => p === "/system/earth/missions/vostok-1",
    nextLabel: "\u041D\u0430 \u0441\u0442\u0430\u043D\u0446\u0438\u044E \xAB\u041C\u0438\u0440\xBB",
    nextHref: "/mir/modules/base",
    aura: "\u0412\u043B\u043E\u0436\u0435\u043D\u043D\u0430\u044F \u043C\u0438\u0441\u0441\u0438\u044F \u0432 layout \u043F\u043B\u0430\u043D\u0435\u0442\u044B + extract \u0441 \u0441\u0435\u0440\u0432\u0435\u0440\u0430."
  },
  {
    id: "mir",
    label: "\xAB\u041C\u0438\u0440\xBB",
    href: "/mir/modules/base",
    match: (p) => p === "/mir/modules/base",
    nextLabel: "\u041A \u043C\u0430\u0441\u0448\u0442\u0430\u0431\u0430\u043C",
    nextHref: "/deep/heliosphere",
    aura: "Layout \u0441\u0442\u0430\u043D\u0446\u0438\u0438 + hook \u043F\u043E\u0434\u0441\u0432\u0435\u0447\u0438\u0432\u0430\u0435\u0442 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0439 \u043C\u043E\u0434\u0443\u043B\u044C."
  },
  {
    id: "deep",
    label: "\u041C\u0430\u0441\u0448\u0442\u0430\u0431",
    href: "/deep/heliosphere",
    match: (p) => p === "/deep/heliosphere",
    nextLabel: "\u0417\u0430 \u0433\u043E\u0440\u0438\u0437\u043E\u043D\u0442",
    nextHref: "/deep/horizon",
    aura: "\u041B\u0435\u0441\u0442\u043D\u0438\u0446\u0430 \u043C\u0430\u0441\u0448\u0442\u0430\u0431\u043E\u0432; \u0441\u0442\u0430\u0440\u0442 \u0432\u044B\u0448\u0435 \u043A\u0430\u0440\u0442\u044B \u043F\u043B\u0430\u043D\u0435\u0442."
  },
  {
    id: "horizon",
    label: "\u0413\u043E\u0440\u0438\u0437\u043E\u043D\u0442",
    href: "/deep/horizon",
    match: (p) => p === "/deep/horizon",
    nextLabel: "\u0412 \u0430\u0442\u043B\u0430\u0441",
    nextHref: "/",
    aura: 'guard="callsign" \u2014 \u0431\u0435\u0437 \u043F\u043E\u0437\u044B\u0432\u043D\u043E\u0433\u043E \u0440\u0435\u0434\u0438\u0440\u0435\u043A\u0442 \u043D\u0430 /briefing.'
  }
];
var NOTES = [
  {
    test: (p) => p === "/",
    text: "\u0421\u0442\u0430\u0440\u0442: template::home. \u041C\u0435\u043D\u044E \u0432\u0435\u0434\u0451\u0442 \u043D\u0430 \u0445\u0430\u0431\u044B \u0440\u0430\u0437\u0434\u0435\u043B\u043E\u0432, \u043D\u0435 \u0432 \u0441\u0435\u0440\u0435\u0434\u0438\u043D\u0443."
  },
  {
    test: (p) => p === "/about",
    text: 'MPA-\u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0430 /about \u0441 extract=".main".'
  },
  {
    test: (p) => p === "/chronicle",
    text: "\u0425\u0430\u0431 \u0445\u0440\u043E\u043D\u0438\u043A\u0438: \u0432\u0441\u044F \u043B\u0435\u043D\u0442\u0430 \u043D\u0430 \u043E\u0434\u043D\u043E\u043C \u044D\u043A\u0440\u0430\u043D\u0435, \u0434\u0430\u043B\u044C\u0448\u0435 \u2014 nested \u044D\u043F\u043E\u0445\u0438."
  },
  {
    test: (p) => p === "/system",
    text: "\u0425\u0430\u0431 \u0441\u0438\u0441\u0442\u0435\u043C\u044B: \u0432\u044B\u0431\u043E\u0440 \u043F\u043B\u0430\u043D\u0435\u0442\u044B \u0437\u0434\u0435\u0441\u044C, \u043D\u0435 \u043D\u0430 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0435 \u0417\u0435\u043C\u043B\u0438."
  },
  {
    test: (p) => p === "/deep",
    text: '\u0425\u0430\u0431 \u043C\u0430\u0441\u0448\u0442\u0430\u0431\u043E\u0432 \u0432\u043D\u0443\u0442\u0440\u0438 deep-layout (path=".").'
  },
  {
    test: (p) => p.startsWith("/fleet"),
    text: "\u0421\u043F\u0440\u0430\u0432\u043E\u0447\u043D\u0438\u043A /fleet \u2014 \u0432\u043D\u0435 \u0433\u043B\u0430\u0432\u043D\u043E\u0433\u043E \u043C\u0435\u043D\u044E, cache \u043D\u0430 \u0441\u043F\u0438\u0441\u043A\u0435."
  },
  {
    test: (p) => /\/chronicle\/[^/]+\/[^/]+/.test(p),
    text: "\u0421\u043E\u0431\u044B\u0442\u0438\u0435 \u0432\u043D\u0443\u0442\u0440\u0438 layout \u044D\u043F\u043E\u0445\u0438 (ready/update = era-chrome)."
  },
  {
    test: (p) => p.startsWith("/chronicle/"),
    text: "\u0425\u0440\u043E\u043D\u0438\u043A\u0430: nested layout + breadcrumbs \u043D\u0430 \u0445\u0430\u0431 /chronicle."
  },
  {
    test: (p) => /\/system\/[^/]+\/missions\//.test(p),
    text: "\u041C\u0438\u0441\u0441\u0438\u044F \u0432\u043D\u0443\u0442\u0440\u0438 layout \u043F\u043B\u0430\u043D\u0435\u0442\u044B (system-chrome)."
  },
  {
    test: (p) => p.startsWith("/system/"),
    text: "\u041F\u043B\u0430\u043D\u0435\u0442\u0430: layout + \u0441\u043F\u0438\u0441\u043E\u043A \u043C\u0438\u0441\u0441\u0438\u0439; \u0445\u0430\u0431 \u0432\u044B\u0431\u043E\u0440\u0430 \u2014 /system."
  },
  {
    test: (p) => p.startsWith("/mir"),
    text: "\u0421\u0442\u0430\u043D\u0446\u0438\u044F \xAB\u041C\u0438\u0440\xBB: schema layout + loading-template \u0434\u043B\u044F \u043C\u043E\u0434\u0443\u043B\u0435\u0439."
  },
  {
    test: (p) => p === "/deep/horizon",
    text: 'guard="callsign" \u2014 \u0431\u0435\u0437 sessionStorage \u0440\u0435\u0434\u0438\u0440\u0435\u043A\u0442 \u043D\u0430 \u0431\u0440\u0438\u0444\u0438\u043D\u0433.'
  },
  {
    test: (p) => p.startsWith("/deep/"),
    text: "\u041C\u0430\u0441\u0448\u0442\u0430\u0431\u044B /deep/:scaleId \u2014 \u043E\u0442 \u0433\u0435\u043B\u0438\u043E\u0441\u0444\u0435\u0440\u044B \u0432\u0432\u0435\u0440\u0445, \u0431\u0435\u0437 \u0434\u0443\u0431\u043B\u044F \u043F\u043B\u0430\u043D\u0435\u0442."
  },
  {
    test: (p) => p === "/briefing",
    text: "\u0414\u043E\u043F\u0443\u0441\u043A: \u0444\u043E\u0440\u043C\u0430 \u2192 sessionStorage. \u041D\u0435 \u0448\u0430\u0433 \u0442\u0443\u0440\u0430, \u0430 unlock \u0434\u043B\u044F guard."
  }
];

// src/main.js
var pathOf = () => window.location.pathname.replace(/\/$/, "") || "/";
var router = () => document.querySelector("aura-router");
var $ = (sel, root = document) => root.querySelector(sel);
function crumb(label, href) {
  return href ? `<a href="${href}" aura-router-link>${label}</a>` : `<span aria-current="page">${label}</span>`;
}
function renderCrumbs(parts) {
  const el = $("[data-crumbs]");
  if (!el) return;
  el.innerHTML = parts.map(([label, href]) => crumb(label, href)).join('<span class="crumb-sep" aria-hidden="true">/</span>');
}
function setText(sel, text) {
  const el = $(sel);
  if (el && el.textContent !== text) el.textContent = text;
}
function setHref(sel, href) {
  const el = $(sel);
  if (!el) return;
  if (el.getAttribute("href") !== href) el.setAttribute("href", href);
  el.toggleAttribute("aura-router-link", true);
}
function markActive(rootSel, attr2, value) {
  const root = $(rootSel);
  if (!root) return;
  for (const link of root.querySelectorAll(`[${attr2}]`)) {
    link.classList.toggle("active", link.getAttribute(attr2) === value);
  }
}
var callsignGuard = defineRouteHook("callsign", async () => {
  if (sessionStorage.getItem(KEYS.callsign)) return;
  sessionStorage.setItem(KEYS.bounce, "1");
  return { type: "redirect", url: "/briefing", replace: true };
});
var eraChrome = defineRouteHook("era-chrome", async (ctx) => {
  const { eraId, eventId } = ctx.to.params || {};
  if (!eraId) return;
  const name = ERAS[eraId] || eraId;
  setText("[data-layout-title]", name);
  setHref('[data-nav="overview"]', `/chronicle/${eraId}`);
  const parts = [
    ["\u0410\u0442\u043B\u0430\u0441", "/"],
    ["\u0425\u0440\u043E\u043D\u0438\u043A\u0430", "/chronicle"]
  ];
  if (eventId) {
    parts.push([name, `/chronicle/${eraId}`]);
    parts.push([EVENTS[eventId] || eventId]);
  } else {
    parts.push([name]);
  }
  renderCrumbs(parts);
});
var systemChrome = defineRouteHook("system-chrome", async (ctx) => {
  const { bodyId, id: missionId } = ctx.to.params || {};
  if (!bodyId) return;
  const name = BODIES[bodyId] || bodyId;
  setText("[data-layout-title]", name);
  setHref('[data-nav="overview"]', `/system/${bodyId}`);
  const parts = [
    ["\u0410\u0442\u043B\u0430\u0441", "/"],
    ["\u0421\u0438\u0441\u0442\u0435\u043C\u0430", "/system"]
  ];
  if (missionId) {
    parts.push([name, `/system/${bodyId}`]);
    parts.push([MISSIONS[missionId] || missionId]);
  } else {
    parts.push([name]);
  }
  renderCrumbs(parts);
});
var mirChrome = defineRouteHook("mir-chrome", async (ctx) => {
  const moduleId = ctx.to.params?.moduleId;
  const path = ctx.to.pathname || "";
  setText(
    "[data-layout-title]",
    moduleId ? MODULES[moduleId] || moduleId : "\u0421\u0442\u0430\u043D\u0446\u0438\u044F \xAB\u041C\u0438\u0440\xBB"
  );
  const parts = [
    ["\u0410\u0442\u043B\u0430\u0441", "/"],
    ["\u0421\u0442\u0430\u043D\u0446\u0438\u044F \xAB\u041C\u0438\u0440\xBB", "/mir"]
  ];
  if (moduleId) parts.push([MODULES[moduleId] || moduleId]);
  renderCrumbs(parts);
  const onOverview = path === "/mir" || path === "/mir/";
  markActive("[data-mir-map]", "data-module", onOverview ? "" : moduleId || "");
});
var deepChrome = defineRouteHook("deep-chrome", async (ctx) => {
  const { scaleId } = ctx.to.params || {};
  const path = ctx.to.pathname || "";
  const isHorizon = path === "/deep/horizon";
  const isHub = path === "/deep" || path === "/deep/";
  const title = isHorizon ? "\u0417\u0430 \u0433\u043E\u0440\u0438\u0437\u043E\u043D\u0442\u043E\u043C" : isHub ? "\u041C\u0430\u0441\u0448\u0442\u0430\u0431\u044B" : SCALES[scaleId] || scaleId || "\u041C\u0430\u0441\u0448\u0442\u0430\u0431\u044B";
  setText("[data-layout-title]", title);
  const parts = [
    ["\u0410\u0442\u043B\u0430\u0441", "/"],
    ["\u041C\u0430\u0441\u0448\u0442\u0430\u0431\u044B", isHub ? void 0 : "/deep"]
  ];
  if (isHorizon) parts.push(["\u0413\u043E\u0440\u0438\u0437\u043E\u043D\u0442"]);
  else if (!isHub && scaleId) parts.push([SCALES[scaleId] || scaleId]);
  renderCrumbs(parts.filter((p) => p[0]));
  markActive(
    "[data-scale-rail]",
    "data-scale",
    isHorizon ? "horizon" : isHub ? "" : scaleId || ""
  );
});
AuraRouter.use(callsignGuard);
AuraRouter.use(eraChrome);
AuraRouter.use(systemChrome);
AuraRouter.use(mirChrome);
AuraRouter.use(deepChrome);
AuraRouter.install();
function syncTour() {
  const rail = $("[data-tour-rail]");
  const steps = $("[data-tour-steps]");
  const next = $("[data-tour-next]");
  if (!rail || !steps || !next) return;
  const path = pathOf();
  const idx = TOUR.findIndex((s) => s.match(path));
  if (idx < 0) {
    rail.hidden = true;
    return;
  }
  rail.hidden = false;
  steps.innerHTML = TOUR.map((s, i) => {
    const state = i < idx ? "is-done" : i === idx ? "is-current" : "is-todo";
    return `<li class="${state}"><a href="${s.href}" aura-router-link><span>${i + 1}</span>${s.label}</a></li>`;
  }).join("");
  next.textContent = TOUR[idx].nextLabel;
  next.setAttribute("href", TOUR[idx].nextHref);
}
function syncNote() {
  const note = $("[data-dev-note]");
  if (!note) return;
  const path = pathOf();
  const tour = TOUR.find((s) => s.match(path));
  const found = NOTES.find((n) => n.test(path));
  note.textContent = tour?.aura || found?.text || "\u0421\u043C\u043E\u0442\u0440\u0438\u0442\u0435 nested layouts, extract, cache \u0438 guard \u043D\u0430 \u0434\u0440\u0443\u0433\u0438\u0445 \u0448\u0430\u0433\u0430\u0445 \u043C\u0430\u0440\u0448\u0440\u0443\u0442\u0430.";
}
function syncGuardBanner() {
  if (!sessionStorage.getItem(KEYS.bounce)) {
    const host2 = $("[data-guard-banner]");
    if (host2) host2.hidden = true;
    return;
  }
  const host = $("[data-guard-banner]");
  if (!host) return;
  host.hidden = false;
  sessionStorage.removeItem(KEYS.bounce);
}
function syncChrome() {
  syncTour();
  syncNote();
  syncGuardBanner();
}
function bindChrome() {
  const el = router();
  if (!el || el.dataset.chromeBound) return;
  el.dataset.chromeBound = "1";
  for (const ev of ["navigation-complete", "navigation", "load-end"]) {
    el.addEventListener(ev, syncChrome);
  }
  syncChrome();
}
document.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-briefing-form]");
  if (!form) return;
  event.preventDefault();
  const callsign = String(new FormData(form).get("callsign") || "").trim();
  if (!callsign) return;
  sessionStorage.setItem(KEYS.callsign, callsign);
  sessionStorage.removeItem(KEYS.bounce);
  router()?.navigate("/deep/horizon");
});
document.addEventListener("click", (event) => {
  if (!event.target.closest("[data-callsign-reset]")) return;
  sessionStorage.removeItem(KEYS.callsign);
  router()?.navigate("/");
});
bindChrome();
queueMicrotask(bindChrome);
