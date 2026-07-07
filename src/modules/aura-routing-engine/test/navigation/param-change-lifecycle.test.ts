jest.mock('../../core/hooks/registry', () =>
  require('../helpers/jest/mock-hooks-registry').mockHooksRegistry());
jest.mock('../../core/view-mount/view-commit-render', () =>
  require('../helpers/jest/mock-view-commit-render').mockViewCommitRender());

import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import type { AuraRoutingEngine } from '../../core/aura-routing-engine';
import {
  createNestedUsersIdMatch,
  createNestedUsersIdSetup,
  createUsersIdMatch,
  createUsersIdNode,
} from '../helpers/create-dynamic-leaf-match';
import { createMockEngine } from '../helpers/create-mock-transaction';
import { runNavigationTransaction } from '../helpers/jest/navigation-fixtures';
import { mockRunPhaseHooks, mockRunViewCommit, resetPipelineMocks } from '../helpers/jest/pipeline-mocks';

async function runNavigation(
  from: MatchedRouteInfo,
  to: MatchedRouteInfo,
  engine: AuraRoutingEngine = createMockEngine(),
) {
  return runNavigationTransaction(from, to, engine);
}

describe('param-change lifecycle (RFC cases A/B/C)', () => {
  beforeEach(() => {
    resetPipelineMocks();
  });

  it('case A: same viewKey → UPDATE without render/unmount/ready', async () => {
    const phases: string[] = [];
    mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
      phases.push(ctx.phase);
    });

    const loadHook = jest.fn().mockResolvedValue({ userId: '2' });
    const engine = createMockEngine();
    engine.hooksRegistry.register({
      name: 'fetch-user',
      version: '1.0.0',
      fn: loadHook,
    });

    const node = createUsersIdNode({
      view: { type: 'html-src', content: 'partials/user-shell.html' },
      load: ['fetch-user'],
      update: ['apply-user'],
      ready: ['analytics'],
      unmount: ['teardown'],
    });
    const from = createUsersIdMatch('1', node);
    const to = createUsersIdMatch('2', node);

    const { transaction } = await runNavigation(from, to, engine);

    expect(transaction.transitionPlan.update).toBe(true);
    expect(mockRunViewCommit).not.toHaveBeenCalled();
    expect(phases).toEqual(['update']);
    expect(phases).not.toContain('unmount');
    expect(phases).not.toContain('ready');
    expect(loadHook).toHaveBeenCalledTimes(1);
  });

  it('case B: per-id viewKey → FULL with render, unmount, ready', async () => {
    const phases: string[] = [];
    mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
      phases.push(ctx.phase);
    });

    const node = createUsersIdNode({
      view: { type: 'html-src', content: 'content/user/{{id}}.html' },
      unmount: ['teardown'],
      ready: ['analytics'],
      update: ['apply-user'],
    });
    const from = createUsersIdMatch('1', node);
    const to = createUsersIdMatch('2', node);

    const { transaction } = await runNavigation(from, to);

    expect(transaction.transitionPlan.update).toBe(false);
    expect(mockRunViewCommit).toHaveBeenCalledTimes(1);
    expect(phases).toContain('unmount');
    expect(phases).toContain('ready');
    expect(phases).not.toContain('update');
  });

  it('case C: navigate override with same viewKey → FULL refetch', async () => {
    const phases: string[] = [];
    mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
      phases.push(ctx.phase);
    });

    const node = createUsersIdNode({
      paramChange: 'navigate',
      view: { type: 'html-src', content: 'partials/user-shell.html' },
      unmount: ['teardown'],
      ready: ['track-page'],
      update: ['apply-user'],
    });
    const from = createUsersIdMatch('1', node);
    const to = createUsersIdMatch('2', node);

    const { transaction } = await runNavigation(from, to);

    expect(transaction.transitionPlan.update).toBe(false);
    expect(from.resolvedView?.viewKey).toBe(to.resolvedView?.viewKey);
    expect(mockRunViewCommit).toHaveBeenCalledTimes(1);
    expect(phases).toContain('unmount');
    expect(phases).toContain('ready');
    expect(phases).not.toContain('update');
  });

  it('nested layout stays as lca on synthetic param remount', async () => {
    const { leaf } = createNestedUsersIdSetup({
      view: { type: 'html-src', content: 'content/user/{{id}}.html' },
      unmount: ['teardown'],
      ready: ['analytics'],
    });
    const from = createNestedUsersIdMatch('1', leaf);
    const to = createNestedUsersIdMatch('2', leaf);

    const { transaction } = await runNavigation(from, to);

    expect(transaction.transitionPlan.update).toBe(false);
    expect(transaction.transitionPlan.paramChangeRemount).toBe(true);
    expect(transaction.transitionPlan.exitRoutes).toHaveLength(1);
    expect(transaction.transitionPlan.lca?.pattern).toBe('/users');
    expect(transaction.transitionPlan.exitRoutes[0]!.pattern).toBe('/users/:id');
    expect(mockRunViewCommit).toHaveBeenCalledTimes(1);
  });
});

describe('param-change lifecycle by view type', () => {
  beforeEach(() => {
    resetPipelineMocks();
  });

  async function collectPhases(from: MatchedRouteInfo, to: MatchedRouteInfo) {
    const phases: string[] = [];
    mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
      phases.push(ctx.phase);
    });
    const { transaction } = await runNavigation(from, to);
    return { phases, transaction };
  }

  it.each([
    ['html', 'partials/user-shell.html'],
    ['component', 'user-profile'],
    ['component-src', 'user-profile'],
  ] as const)('%s static shell → UPDATE without render', async (type, content) => {
    const node = createUsersIdNode({
      view: { type, content },
      update: ['apply-user'],
      unmount: ['teardown'],
      ready: ['analytics'],
    });
    const from = createUsersIdMatch('1', node);
    const to = createUsersIdMatch('2', node);

    const { phases, transaction } = await collectPhases(from, to);

    expect(transaction.transitionPlan.update).toBe(true);
    expect(mockRunViewCommit).not.toHaveBeenCalled();
    expect(phases).toEqual(['update']);
    expect(phases).not.toContain('unmount');
    expect(phases).not.toContain('ready');
  });

  it.each([
    ['html', 'content/user/{{id}}.html'],
    ['component-src', 'widgets/user-{{id}}'],
  ] as const)('%s per-id ref → FULL with render', async (type, content) => {
    const node = createUsersIdNode({
      view: { type, content },
      unmount: ['teardown'],
      ready: ['analytics'],
      update: ['apply-user'],
    });
    const from = createUsersIdMatch('1', node);
    const to = createUsersIdMatch('2', node);

    const { phases, transaction } = await collectPhases(from, to);

    expect(transaction.transitionPlan.update).toBe(false);
    expect(mockRunViewCommit).toHaveBeenCalledTimes(1);
    expect(phases).toContain('unmount');
    expect(phases).toContain('ready');
    expect(phases).not.toContain('update');
  });

  it('layout-only leaf → UPDATE without render', async () => {
    const node = createUsersIdNode({
      layout: 'users-shell',
      view: { type: 'html-src', content: 'ignored.html' },
      update: ['sync-outlet'],
      unmount: ['teardown'],
      ready: ['analytics'],
    });
    const from = createUsersIdMatch('1', node);
    const to = createUsersIdMatch('2', node);

    expect(from.resolvedView).toBeNull();

    const { phases, transaction } = await collectPhases(from, to);

    expect(transaction.transitionPlan.update).toBe(true);
    expect(mockRunViewCommit).not.toHaveBeenCalled();
    expect(phases).toEqual(['update']);
  });
});
