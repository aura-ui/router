import type { AURARoute } from '../../../aura-route/core/aura-route';
import type { RouteLifecycleContext, RouteErrorContext } from '../../../aura-route-hooks/core';

const noop = (): void => {};

/** Минимальный route для engine-тестов без DOM. */
export function createTestRoute(path: string, overrides: Partial<AURARoute> = {}): AURARoute {
  const base = {
    path,
    enter: null,
    entering: null,
    load: null,
    entered: null,
    leave: null,
    leaving: null,
    left: null,
    reentered: null,
    error: null,
    onEnter: noop as (ctx: RouteLifecycleContext) => void,
    onEntering: noop,
    onLoad: noop,
    onEntered: noop,
    onLeave: noop,
    onLeaving: noop,
    onLeft: noop,
    onReentered: noop,
    onError: noop as (ctx: RouteErrorContext) => void,
    render: async () => {},
    cancelPendingRender: noop,
  };

  return { ...base, ...overrides } as unknown as AURARoute;
}
