// 1. Получает from и to роут - его задача прогнать все фазы from и to роута
// 2. Запускает механизм построение маршрута транзакций (отдельный компонент TransitionPath)
// этот механизм возвращает массив роутов с которых надо уйти и масив роутов в которые надо войти
// 3. запускает фазы роутов согласно общей схеме жизненного цикла
// guards-> pre-handler -> handler -> post-handler
// 4. обработка фаз идет в phase-dispatcher компоненте (он вызывает хуки роута конкретного)
// необходимо будет заранее обработать какие хуки существуют, чтобы не гонять их все если они пустые


import { buildRoadMap } from './aura-routing-transition-map';
import type { MatchedRouteInfo, HistoryAction } from './aura-routing-engine';
import { AuraRoutingPhaseHandler } from './aura-routing-phase-handler';
import { AuraRoutingProcessorJobManager } from './aura-routing-processor-job-manager';
import type { GuardResult } from './types';

type NavigationOutcome =
  | { status: 'committed' }
  | { status: 'cancelled'; stayOn: 'from' }  // pop + guard: синхронизировать URL с from
  | { status: 'redirect'; url: string; replace?: boolean }
  | { status: 'error'; error: unknown };


export class AuraRoutingProcessor {
  private jobManager: AuraRoutingProcessorJobManager;

  constructor() {
    this.jobManager = new AuraRoutingProcessorJobManager();
  }

  async run({ from, to, action }: {from: MatchedRouteInfo, to :MatchedRouteInfo, action:HistoryAction}){
    const {exitRoutes, enterRoutes, reentered} = buildRoadMap(from, to);

    const job = this.jobManager.begin(action);
    const generation = this.jobManager.routerGeneration;
    const isJobActive  = () => !this.jobManager.isJobSuperseded(job, generation);

    if (reentered) {
      const result = await this.runReenteredOnly(enterRoutes, isJobActive);
      if(result) return result;
      return  { status: 'committed' }
    }

    let result = await this.runGuardsPhases(exitRoutes, enterRoutes, isJobActive);
    if(result) return result;

    result = await this.runPreCommitPhases(enterRoutes, isJobActive);
    if(result) return result;

    result = await this.runCommitPhase(enterRoutes, job);
    if(result) return result;

    result = await this.runPostCommitPhases(exitRoutes, enterRoutes, isJobActive);
    if(result) return result;

    return { status: 'committed' };
  }

  stop(){
    this.jobManager.invalidate();
  }

  async runGuardsPhases(exitRoutesInfo: MatchedRouteInfo[], enterRoutesInfo: MatchedRouteInfo[],isJobActive:any){

    //leave phase
    for (const routeInfo of exitRoutesInfo) {
      const {route} = routeInfo;
      if(route.leave) {
        const blocked = await this.runBlockingPhase(() =>
          AuraRoutingPhaseHandler.runPhase('leave',routeInfo, isJobActive)
        );
        route.afterLeave(routeInfo);
        if (blocked) return blocked;
      }
    }

    for (const routeInfo of enterRoutesInfo) {
      const {route} = routeInfo;
      if(route.enter) {
        const blocked = await this.runBlockingPhase(() =>
          AuraRoutingPhaseHandler.runPhase('enter',routeInfo, isJobActive)
        );
        route.onEnter(routeInfo);
        if (blocked) return blocked;
      }

      if(route.load) {
        const blocked = await this.runBlockingPhase(() =>
          AuraRoutingPhaseHandler.runPhase('load',routeInfo, isJobActive)
        );
        route.onLoad(routeInfo);
        if (blocked) return blocked;
      }
    }

  }

  async runPreCommitPhases(enterRoutesInfo:MatchedRouteInfo[],isJobActive:any){
    for (const routeInfo of enterRoutesInfo) {
      const {route} = routeInfo;
      if(route.entering) {
        const blocked = await this.runBlockingPhase(() =>
          AuraRoutingPhaseHandler.runPhase('entering',routeInfo, isJobActive)
        );
        route.onEntering(routeInfo);
        if (blocked) return blocked;
      }
    }
  }

  async runCommitPhase(enterRoutesInfo:MatchedRouteInfo[], job:any){
    for (const routeInfo of enterRoutesInfo) {
      await AuraRoutingPhaseHandler.runRenderPhase(routeInfo, job);
    }
  }

  async runPostCommitPhases(exitRoutesInfo: MatchedRouteInfo[],enterRoutesInfo:MatchedRouteInfo[], isJobActive:any){
    for (const routeInfo of exitRoutesInfo) {
      const {route} = routeInfo;
      if(route.leaving) {
        await AuraRoutingPhaseHandler.runPhase('leaving',routeInfo, isJobActive);
        route.onLeaving(routeInfo);
      }
      if(route.left) {
        await AuraRoutingPhaseHandler.runPhase('left',routeInfo, isJobActive);
        route.onLeft(routeInfo);
      }
    }

    for (const routeInfo of enterRoutesInfo) {
      const {route} = routeInfo;
      if(route.entered) {
        const result = await AuraRoutingPhaseHandler.runPhase('entered', routeInfo, isJobActive);
        route.onEntered(routeInfo);
        if (this.applyRedirect(result)) return result;
      }
    }

  }

  private async runReenteredOnly(enterRoutesInfo:MatchedRouteInfo[], isJobActive:any): Promise<boolean> {
    for (const routeInfo of enterRoutesInfo) {
      const {route} = routeInfo;
      if(route.reentered) {
        const result = await AuraRoutingPhaseHandler.runPhase('reentered', routeInfo, isJobActive);
        route.onReentered(routeInfo);
        if (this.applyRedirect(result)) return result;
      }
    }
  }

  /** Blocking guard: cancel or redirect — returns `true` when navigation must stop. */
  private async runBlockingPhase(run: () => Promise<GuardResult>): Promise<any> {
    const result = await run();
    if (result === false) return { status: 'cancelled'};
    return this.applyRedirect(result);
  }

  private applyRedirect(result: GuardResult): any {
    if (typeof result === 'string') {
      return { status: 'redirect', url: result }
    }
    return false;
  }
}