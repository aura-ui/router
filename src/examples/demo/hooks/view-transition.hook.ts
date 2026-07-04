import {
  defineRouteHook,
  type RouteHookContext,
  type RouteInstance,
} from '../../../modules/aura-routing-engine/core';
import type { AuraRouter } from '../../../modules/aura-router/core/aura-router';
import { AURA_VIEW_ROOT_ATTR, type AuraOutlet } from '../../../modules/aura-outlet/core/aura-outlet';

type TransitionKind = 'fade' | 'slide';

const DURATION_MS = 1000;

function getRootOutlet(ctx: RouteHookContext): AuraOutlet | null {
  const routeEl = ctx.route as RouteInstance & Element;
  const router = routeEl.closest?.('aura-router') as AuraRouter | null;
  return router?.appOutlet ?? null;
}

/** Active (outgoing) or staged (incoming) view root inside the router outlet. */
function resolveViewRoot(ctx: RouteHookContext): HTMLElement | null {
  const outlet = getRootOutlet(ctx);
  if (!outlet) return null;

  const roots = outlet.querySelectorAll<HTMLElement>(`:scope > [${AURA_VIEW_ROOT_ATTR}]`);
  if (!roots.length) return null;

  if (ctx.phase === 'transitionOut') {
    return roots.length > 1 ? roots[0]! : roots[roots.length - 1]!;
  }

  if (ctx.phase === 'transitionIn') {
    return roots[roots.length - 1]!;
  }

  return null;
}

function keyframes(kind: TransitionKind, phase: 'transitionIn' | 'transitionOut'): Keyframe[] {
  if (kind === 'slide') {
    return phase === 'transitionIn'
      ? [{ opacity: 0, transform: 'translateX(1.25rem)' }, { opacity: 1, transform: 'translateX(0)' }]
      : [{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: 'translateX(-1.25rem)' }];
  }

  return phase === 'transitionIn'
    ? [{ opacity: 0 }, { opacity: 1 }]
    : [{ opacity: 1 }, { opacity: 0 }];
}

function primeEnterAnimation(root: HTMLElement, kind: TransitionKind): void {
  if (kind === 'slide') {
    root.style.opacity = '0';
    root.style.transform = 'translateX(1.25rem)';
    return;
  }

  root.style.opacity = '0';
}

/** Resolves when the animation finishes or the navigation job is aborted. */
function waitForAnimation(animation: Animation, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    animation.cancel();
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const onAbort = (): void => {
      animation.cancel();
      resolve();
    };

    signal.addEventListener('abort', onAbort, { once: true });
    void animation.finished.then(
      () => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      },
      () => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      },
    );
  });
}

function createViewTransitionHook(name: TransitionKind) {
  return defineRouteHook({
    name,
    version: '1.0.0',
    fn: async (ctx) => {
      if (ctx.phase !== 'transitionIn' && ctx.phase !== 'transitionOut') return;
      if (ctx.transactionSignal.aborted) return;

      const root = resolveViewRoot(ctx);
      if (!root) {
        console.warn(`[${name}] no view root for phase ${ctx.phase} (${ctx.to.pathname})`);
        return;
      }

      if (ctx.phase === 'transitionIn') {
        primeEnterAnimation(root, name);
      }

      const animation = root.animate(keyframes(name, ctx.phase), {
        duration: DURATION_MS,
        easing: 'ease',
        fill: 'forwards',
      });

      await waitForAnimation(animation, ctx.transactionSignal);
    },
  });
}

export const fadeTransitionHook = createViewTransitionHook('fade');
export const slideTransitionHook = createViewTransitionHook('slide');
