// 1. Получает from и to роут - его задача прогнать все фазы from и to роута
// 2. Запускает механизм построение маршрута транзакций (отдельный компонент TransitionPath)
// этот механизм возвращает массив роутов с которых надо уйти и масив роутов в которые надо войти
// 3. запускает фазы роутов согласно общей схеме жизненного цикла
// guards-> pre-handler -> handler -> post-handler
// 4. обработка фаз идет в phase-dispatcher компоненте (он вызывает хуки роута конкретного)
// необходимо будет заранее обработать какие хуки существуют, чтобы не гонять их все если они пустые

import { buildRoadMap } from './aura-routing-transition-map';
import type { MatchedRouteInfo } from './aura-routing-engine';
import { AuraRoutingPhaseHandler } from './aura-routing-phase-handler';
import { AuraRoutingProcessorJobManager } from './aura-routing-processor-job-manager';
import type { GuardResult } from './types';

type ProcessorResponse =
  | { status: 'committed' }
  | { status: 'cancelled';}
  | { status: 'redirect'; url: string; replace?: boolean }
  | { status: 'error'; error: unknown };

export class AuraRoutingProcessor {
  private jobManager: AuraRoutingProcessorJobManager;

  constructor() {
    this.jobManager = new AuraRoutingProcessorJobManager();
  }

  async run({ from, to }: {from: MatchedRouteInfo | null, to :MatchedRouteInfo}):Promise<ProcessorResponse>{
    const {exitRoutes, enterRoutes, reentered} = buildRoadMap(from, to);

    const job = this.jobManager.begin();
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

    result = await this.runCommitPhase(enterRoutes, isJobActive, job);
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
        try {

        const blocked = await this.runBlockingPhase(() =>
          AuraRoutingPhaseHandler.runPhase('leave',routeInfo, isJobActive)
        );
        if (blocked) return blocked;
        route.afterLeave(routeInfo);
      } catch (error) {
        return this.failWithError(routeInfo, error, isJobActive);
      }
      }
    }

    for (const routeInfo of enterRoutesInfo) {
      const {route} = routeInfo;
      if(route.enter) {
        route.onEnter(routeInfo);
        try {
          const outcome = await this.runBlockingPhase(() =>
            AuraRoutingPhaseHandler.runPhase('enter', routeInfo, isJobActive),
          );
          if (outcome) return outcome;
        } catch (error) {
          return this.failWithError(routeInfo, error, isJobActive);
        }
      }

      if(route.load) {
        route.onLoad(routeInfo);
        try {
          const outcome = await this.runBlockingPhase(() =>
            AuraRoutingPhaseHandler.runPhase('load', routeInfo, isJobActive),
          );
          if (outcome) return outcome;
        } catch (error) {
          return this.failWithError(routeInfo, error, isJobActive);
        }
      }
    }

  }

  async runPreCommitPhases(enterRoutesInfo:MatchedRouteInfo[],isJobActive:any){
    for (const routeInfo of enterRoutesInfo) {
      const { route } = routeInfo;
      if (!route.entering) continue;
      route.onEntering(routeInfo);
      try {
        await AuraRoutingPhaseHandler.runPhase('entering', routeInfo, isJobActive);
      } catch (error) {
        return this.failWithError(routeInfo, error, isJobActive);
      }
    }
  }

  async runCommitPhase(enterRoutesInfo:MatchedRouteInfo[], isJobActive:any, job:any){
    for (const routeInfo of enterRoutesInfo) {
      try {
        const response = await AuraRoutingPhaseHandler.runRenderPhase(routeInfo, job);
        if (response === 'aborted' || !isJobActive()) {
          return  { status: 'cancelled'}
        }
      } catch (error) {
        console.error(`render phase failed:`, error);
        return undefined;
       //return this.failWithError(routeInfo, error, isJobActive);
      }
    }
  }

  async runPostCommitPhases(exitRoutesInfo: MatchedRouteInfo[],enterRoutesInfo:MatchedRouteInfo[], isJobActive:any){
    for (const routeInfo of exitRoutesInfo) {
      const {route} = routeInfo;
      if(route.leaving) {
        await this.runPhaseSafe('leaving', routeInfo, isJobActive);
        route.onLeaving(routeInfo);
      }
      if(route.left) {
        await this.runPhaseSafe('left', routeInfo, isJobActive);
      }
      route.onLeft(routeInfo);
    }

    for (const routeInfo of enterRoutesInfo) {
      const { route } = routeInfo;
      if (!route.entered) continue;
      const result = await this.runPhaseSafe('entered', routeInfo, isJobActive);
      route.onEntered(routeInfo);
      const redirect = this.applyRedirect(result);
      if (redirect) return redirect;
    }

  }

  private async runReenteredOnly(enterRoutesInfo:MatchedRouteInfo[], isJobActive:any): Promise<any> {
    for (const routeInfo of enterRoutesInfo) {
      const { route } = routeInfo;
      if (!route.reentered) continue;
      try {
        const result = await AuraRoutingPhaseHandler.runPhase('reentered', routeInfo, isJobActive);
        route.onReentered(routeInfo);
        const redirect = this.applyRedirect(result);
        if (redirect) return redirect;
      } catch (error) {
        return this.failWithError(routeInfo, error, isJobActive);
      }
    }
  }

  /** Blocking guard: cancel or redirect — returns `true` when navigation must stop. */
  private async runBlockingPhase(run: () => Promise<GuardResult>): Promise<any> {
    const result = await run();
    if (result === false) return { status: 'cancelled'};
    return this.applyRedirect(result);
  }

  private applyRedirect(result: GuardResult): ProcessorResponse | false {
    if (typeof result === 'string') {
      return { status: 'redirect', url: result };
    }
    if (result && typeof result === 'object' && 'url' in result) {
      return {
        status: 'redirect',
        url: result.url,
        ...(result.replace !== undefined && { replace: result.replace }),
      };
    }
    return false;
  }


  private async failWithError(
    routeInfo: MatchedRouteInfo,
    error: unknown,
    isJobActive: () => boolean,
  ): Promise<ProcessorResponse> {
    routeInfo.route.onError({ ...routeInfo, error }); // onError ждёт ctx с .error
    try {
      await AuraRoutingPhaseHandler.runPhase('error', routeInfo, isJobActive, {error});
    } catch (hookError) {
      console.error(hookError); // error-hook упал — не зацикливаться
    }
    return { status: 'error', error };
  }

  private async runPhaseSafe(
    phase: string,
    routeInfo: MatchedRouteInfo,
    isJobActive: () => boolean,
  ): Promise<GuardResult> {
    try {
      return await AuraRoutingPhaseHandler.runPhase(phase, routeInfo, isJobActive);
    } catch (error) {
      console.error(`[${phase}] hook failed after commit:`, error);
      return undefined;
    }
  }
}