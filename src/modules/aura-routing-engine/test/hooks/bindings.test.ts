import type { RouteInstance } from '../../core';
import { PHASE_HTML_ALIAS, parsePhaseHooks, resolveHookNames } from '../../core/lifecycle/phase-attrs';

function route(overrides: Partial<RouteInstance> = {}): RouteInstance {
  const noop = (): void => {};
  return {
    path: '/',
    enter: null,
    transitionIn: null,
    load: null,
    afterHook: null,
    leave: null,
    transitionOut: null,
    error: null,
    hooks: null,
    onEnter: noop,
    onTransitionIn: noop,
    onLoad: noop,
    onAfter: noop,
    onLeave: noop,
    onTransitionOut: noop,
    onLeft: noop,
    onReenter: noop,
    onError: noop,
    transition: { order: null, in: null, out: null },
    ...overrides,
  };
}

describe('parsePhaseHooks', () => {
  it('parses phase::hook pairs with kebab-case phases', () => {
    expect(parsePhaseHooks('transition-in::fade-in, left::abort-polling')).toEqual({
      transitionIn: ['fade-in'],
      left: ['abort-polling'],
    });
  });

  it('groups multiple hooks for the same phase', () => {
    expect(parsePhaseHooks('after::analytics, after::track-extra')).toEqual({
      after: ['analytics', 'track-extra'],
    });
  });

  it('returns null for empty or invalid input', () => {
    expect(parsePhaseHooks(null)).toBeNull();
    expect(parsePhaseHooks('')).toBeNull();
    expect(parsePhaseHooks('no-separator, ::hook-only')).toBeNull();
    expect(parsePhaseHooks('after:analytics')).toBeNull();
  });
});

describe('resolveHookNames', () => {
  it('merges phase attr hooks before hooks map entries', () => {
    expect(
      resolveHookNames(
        route({ afterHook: ['analytics'], hooks: { after: ['track-extra'] } }),
        'after',
      ),
    ).toEqual(['analytics', 'track-extra']);
  });

  it('returns hooks-only phases without dedicated attrs (left, reenter)', () => {
    expect(
      resolveHookNames(route({ hooks: { left: ['abort-polling'], reenter: ['sync'] } }), 'left'),
    ).toEqual(['abort-polling']);
    expect(
      resolveHookNames(route({ hooks: { reenter: ['sync'] } }), 'reenter'),
    ).toEqual(['sync']);
  });

  it('reads transition hooks from route getters (aura-route)', () => {
    expect(
      resolveHookNames(
        route({ transitionIn: ['fade'], hooks: { transitionIn: ['extra'] } }),
        'transitionIn',
      ),
    ).toEqual(['fade', 'extra']);
  });
});

describe('PHASE_HTML_ALIAS', () => {
  it('maps camelCase and kebab-case phase names', () => {
    expect(PHASE_HTML_ALIAS['transition-in']).toBe('transitionIn');
    expect(PHASE_HTML_ALIAS.enter).toBe('enter');
  });
});
