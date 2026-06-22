export class AuraRoutingProcessorJob {
  readonly id: number;
  readonly signal: AbortSignal;

  private readonly controller: AbortController;

  constructor(id: number) {
    this.id = id;
    this.controller = new AbortController();
    this.signal = this.controller.signal;
  }

  get aborted(): boolean {
    return this.signal.aborted;
  }

  abort(reason?: unknown): void {
    if (!this.signal.aborted) {
      this.controller.abort(reason);
    }
  }
}