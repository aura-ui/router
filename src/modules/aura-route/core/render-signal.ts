/**
 * Local + optional parent abort signals for one route render pass.
 * Parent is typically the navigation job signal from the routing engine.
 */
export class RouteRenderSignal {
  private local = new AbortController();
  private parent?: AbortSignal;

  /** Starts a new render pass; cancels any in-flight local work. */
  begin(parent?: AbortSignal): AbortSignal {
    this.cancel();
    this.local = new AbortController();
    this.parent = parent;
    return this.signal;
  }

  get signal(): AbortSignal {
    const { signal } = this.local;
    return this.parent ? AbortSignal.any([this.parent, signal]) : signal;
  }

  get aborted(): boolean {
    return this.signal.aborted;
  }

  cancel(): void {
    this.local.abort();
  }
}
