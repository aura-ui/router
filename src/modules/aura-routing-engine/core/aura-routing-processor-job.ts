import type { HistoryAction } from './aura-routing-engine';

export class AuraRoutingProcessorJob {
  readonly id: number;
  readonly signal: AbortSignal;
  readonly navigationType: HistoryAction; //odo не относится к работе как таковой

  private readonly controller: AbortController;

  constructor(id: number, navigationType: HistoryAction = 'system') {
    this.id = id;
    this.navigationType = navigationType;
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