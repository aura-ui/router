/** Local + optional parent abort for one render pass. */
export class RenderSignal {
  private local = new AbortController();
  private parent?: AbortSignal;

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
