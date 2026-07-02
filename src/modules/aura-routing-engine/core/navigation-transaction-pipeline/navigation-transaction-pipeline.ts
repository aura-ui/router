import { AuraRoutingEngine } from '../aura-routing-engine';
import { NavigationTransaction } from '../navigation-transaction/navigation-transaction';
import { type RoutePhase, type RoutePhaseDefinition } from '../lifecycle';

import {
  NavigationTransactionPipelinePhase,
  type PhaseError,
  type PhaseRunResult,
} from './navigation-transaction-pipeline-phase';

export class NavigationTransactionPipeline {

  private readonly engine: AuraRoutingEngine;
  private readonly transaction: NavigationTransaction;

  constructor(transaction: NavigationTransaction) {
    this.engine = transaction.engine;
    this.transaction = transaction;
  }

  run() {
  };

  reenter() {
  }

  guards() {
  }

  loads() {
  }

  render() {
  }

  renderWithTransitions() {
  }

  ready() {
  }


  async runPhase(data: RoutePhaseDefinition) {
    const matchedRoutes = this.transaction.plan[data.targetRoutes];

    for (const matchedRoute of matchedRoutes) {
      const result = await NavigationTransactionPipelinePhase.run(matchedRoute, data, this.transaction);
      if (NavigationTransactionPipelinePhase.isPhaseError(result)) {
        return await this.handlePhaseError(result);
      }
      if (result) return result;
    }

    return null;
  }

  private async handlePhaseError(failure: PhaseError): Promise<PhaseRunResult> {
    await NavigationTransactionPipelinePhase.runError(
      failure.route,
      failure.error,
      failure.failedPhase,
      this.transaction,
    );
    // здесь твоя политика — пока минимально:
    return { status: 'error', error: failure.error }; // или свой TransactionResult
  }
}