// 1. Получает from и to роут - его задача прогнать все фазы from и to роута
// 2. Запускает механизм построение маршрута транзакций (отдельный компонент TransitionPath)
// этот механизм возвращает массив роутов с которых надо уйти и масив роутов в которые надо войти
// 3. запускает фазы роутов согласно общей схеме жизненного цикла
// guards-> pre-handler -> handler -> post-handler
// 4. обработка фаз идет в phase-dispatcher компоненте (он вызывает хуки роута конкретного)
// необходимо будет заранее обработать какие хуки существуют, чтобы не гонять их все если они пустые
// aura-routing-processor.ts — для контекста, не часть phase-executor

import { buildRoadMap } from './aura-routing-transition-map';
import {
  PhaseExecutor,
  type NavigationTransaction,
  type TransactionResult,
} from './aura-routing-phase-executor';
import type { MatchedRouteInfo } from './aura-routing-url-matcher';
import type { HistoryAction } from './aura-routing-history-navigator';
import { AuraRoutingProcessorJobManager } from './aura-routing-processor-job-manager';

export class AuraRoutingProcessor {
  private readonly jobManager = new AuraRoutingProcessorJobManager();
  private readonly phases = new PhaseExecutor();

  async run(input: {
    from: MatchedRouteInfo | null;
    to: MatchedRouteInfo;
    action: HistoryAction;
  }): Promise<TransactionResult> {
    const tx: NavigationTransaction = {
      ...input,
      plan: buildRoadMap(input.from, input.to),
    };

    const job = this.jobManager.begin();
    const generation = this.jobManager.routerGeneration;
    const ctx = {
      tx,
      job,
      isJobActive: () => !this.jobManager.isJobSuperseded(job, generation),
    };

    if (tx.plan.reentered) {
      const early = await this.phases.runReentered(ctx);
      return early ?? { status: 'committed' };
    }

    const steps = [
      () => this.phases.runPrepare(ctx),
      () => this.phases.runPreCommit(ctx),
      () => this.phases.runCommit(ctx),
      () => this.phases.runPostCommit(ctx),
    ] as const;

    for (const step of steps) {
      const result = await step();
      if (result) return result;
    }

    return { status: 'committed' };
  }

  stop(): void {
    this.jobManager.invalidate();
  }
}