import { AURA_VIEW_ROOT_ATTR } from '../../../modules/aura-outlet/core/aura-outlet';
import { AuraRouter } from '../../../modules/aura-router/core';
import { defineRouteHook } from '../../../modules/aura-routing-engine/core/hooks/define-hook';
import type { RouteHookContext } from '../../../modules/aura-routing-engine/core/hooks/types';

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const DEMO_VIEW_ENTERING = 'demo-view-entering';
const DEMO_VIEW_STAGED = 'data-demo-staged';

/** Сдвиг при входе — мягкое замедление к концу. */
const FADE_IN_MOVE_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';
/** Opacity при входе — заметный fade с начала, вместе со сдвигом. */
const FADE_IN_OPACITY_EASING = 'ease-out';
/** Мягкий выход — ускорение к концу. */
const FADE_OUT_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';
const FADE_IN_MS = 520;
const FADE_OUT_MS = 300;
const FADE_IN_FROM_X = '2.25rem';
const FADE_OUT_TO_X = '-0.875rem';

function getViewRoots(outlet: ParentNode): HTMLElement[] {
  return [...outlet.querySelectorAll<HTMLElement>(`[${AURA_VIEW_ROOT_ATTR}]`)];
}

function resolveTransitionRoot(ctx: RouteHookContext): HTMLElement | null {
  const router = ctx.router as AuraRouter;
  const outlet = router.appOutlet;
  if (!outlet) return null;

  const roots = getViewRoots(outlet);
  if (!roots.length) return null;

  if (ctx.phase === 'transitionIn') return roots[roots.length - 1] ?? null;
  if (ctx.phase === 'transitionOut') return roots[0] ?? null;
  return null;
}

function cancelRootAnimations(root: HTMLElement): void {
  root.getAnimations().forEach((animation) => animation.cancel());
}

function clearPresentation(root: HTMLElement): void {
  cancelRootAnimations(root);
  root.classList.remove(DEMO_VIEW_ENTERING);
  root.removeAttribute(DEMO_VIEW_STAGED);
  root.style.removeProperty('opacity');
  root.style.removeProperty('transform');
  root.style.removeProperty('will-change');
}

function syncStagedViewAttr(outlet: ParentNode): void {
  const roots = getViewRoots(outlet);
  roots.forEach((root, index) => {
    const isStagedIncoming = roots.length > 1 && index === roots.length - 1;
    if (isStagedIncoming && !root.classList.contains(DEMO_VIEW_ENTERING)) {
      root.setAttribute(DEMO_VIEW_STAGED, '');
    } else {
      root.removeAttribute(DEMO_VIEW_STAGED);
    }
  });
}

/** Помечает staged incoming до transitionIn — без конфликта с WAAPI. */
export function installDemoStagedViewObserver(root: ParentNode = document): void {
  const outlet = root.querySelector('.demo-site[data-demo-scenario="animations"] .demo-site-outlet');
  if (!outlet) return;

  const observer = new MutationObserver(() => syncStagedViewAttr(outlet));
  observer.observe(outlet, { childList: true });
  syncStagedViewAttr(outlet);
}

async function waitForNextFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function primeEnterRoot(root: HTMLElement, fromTransform: string): Promise<void> {
  root.classList.add(DEMO_VIEW_ENTERING);
  root.removeAttribute(DEMO_VIEW_STAGED);
  root.style.opacity = '0';
  root.style.transform = fromTransform;
  // Два кадра — браузер фиксирует стартовую позицию до animate().
  await waitForNextFrame();
  await waitForNextFrame();
}

async function runEnterPresentationAnimation(
  root: HTMLElement,
  fromTransform: string,
  signal: AbortSignal,
): Promise<void> {
  if (REDUCED_MOTION) return;

  cancelRootAnimations(root);
  root.style.removeProperty('opacity');
  root.style.removeProperty('transform');
  root.style.willChange = 'opacity, transform';

  const duration = FADE_IN_MS;
  const fill = 'both' as const;
  const opacityAnim = root.animate(
    [{ opacity: 0 }, { opacity: 1 }],
    { duration, easing: FADE_IN_OPACITY_EASING, fill },
  );
  const transformAnim = root.animate(
    [{ transform: fromTransform }, { transform: 'translate3d(0, 0, 0)' }],
    { duration, easing: FADE_IN_MOVE_EASING, fill },
  );

  const animations = [opacityAnim, transformAnim];
  const abort = () => animations.forEach((animation) => animation.cancel());
  signal.addEventListener('abort', abort, { once: true });

  try {
    await Promise.all(animations.map((animation) => animation.finished));
    animations.forEach((animation) => animation.commitStyles());
  } catch {
    // superseded or cancelled
  } finally {
    signal.removeEventListener('abort', abort);
    root.style.removeProperty('will-change');
    if (!signal.aborted) {
      root.style.opacity = '1';
      root.style.transform = 'translate3d(0, 0, 0)';
      root.classList.remove(DEMO_VIEW_ENTERING);
    }
  }
}

async function runPresentationAnimation(
  root: HTMLElement,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
  signal: AbortSignal,
  finalize: 'clear' | 'hold-visible' = 'clear',
): Promise<void> {
  if (REDUCED_MOTION) return;

  cancelRootAnimations(root);
  root.style.willChange = 'opacity, transform';

  const animation = root.animate(keyframes, { ...options, fill: 'forwards' });
  const abort = () => animation.cancel();
  signal.addEventListener('abort', abort, { once: true });

  try {
    await animation.finished;
    animation.commitStyles();
  } catch {
    // superseded or cancelled
  } finally {
    signal.removeEventListener('abort', abort);
    root.style.removeProperty('will-change');
    if (!signal.aborted) {
      if (finalize === 'hold-visible') {
        root.style.opacity = '1';
        root.style.transform = 'translate3d(0, 0, 0)';
        root.classList.remove(DEMO_VIEW_ENTERING);
      } else {
        root.style.removeProperty('opacity');
        root.style.removeProperty('transform');
        root.classList.remove(DEMO_VIEW_ENTERING);
      }
    }
  }
}

export const fadeHook = defineRouteHook('fade', async (ctx) => {
  const root = resolveTransitionRoot(ctx);
  if (!root) return;

  const signal = ctx.transactionSignal;

  if (ctx.phase === 'transitionIn') {
    const fromTransform = `translate3d(${FADE_IN_FROM_X}, 0, 0)`;
    await primeEnterRoot(root, fromTransform);
    await runEnterPresentationAnimation(root, fromTransform, signal);
    return;
  }

  if (ctx.phase === 'transitionOut') {
    root.classList.remove(DEMO_VIEW_ENTERING);
    const startOpacity = Number.parseFloat(getComputedStyle(root).opacity);
    const fromOpacity = Number.isFinite(startOpacity) ? startOpacity : 1;
    const toTransform = `translate3d(${FADE_OUT_TO_X}, 0, 0)`;

    root.style.opacity = String(fromOpacity);
    root.style.transform = 'translate3d(0, 0, 0)';

    await runPresentationAnimation(
      root,
      [
        { opacity: fromOpacity, transform: 'translate3d(0, 0, 0)' },
        { opacity: 0, transform: toTransform },
      ],
      { duration: FADE_OUT_MS, easing: FADE_OUT_EASING },
      signal,
    );
  }
});

export const slideHook = defineRouteHook('slide', async (ctx) => {
  const root = resolveTransitionRoot(ctx);
  if (!root) return;

  const signal = ctx.transactionSignal;

  if (ctx.phase === 'transitionIn') {
    const fromTransform = 'translate3d(0, 1rem, 0)';
    await primeEnterRoot(root, fromTransform);
    await runEnterPresentationAnimation(root, fromTransform, signal);
    return;
  }

  if (ctx.phase === 'transitionOut') {
    clearPresentation(root);

    await runPresentationAnimation(
      root,
      [
        { opacity: 1, transform: 'translate3d(0, 0, 0)' },
        { opacity: 0, transform: 'translate3d(0, -0.5rem, 0)' },
      ],
      { duration: FADE_OUT_MS, easing: FADE_OUT_EASING },
      signal,
    );
  }
});

/** Registers reference transition hooks used by animation demo scenarios. */
export function installDemoTransitionHooks(root: ParentNode = document): void {
  AuraRouter.use(fadeHook);
  AuraRouter.use(slideHook);
  installDemoStagedViewObserver(root);
}
