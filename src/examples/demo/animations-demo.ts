import { AuraRoute } from '../../modules/aura-route/core/aura-route';
import type { TransitionOrderType } from '../../modules/aura-route/core/attr/transition-order-attr-parser';

const STORAGE_KEY = 'demo-animations-transition-order';
const ORDERS = new Set<TransitionOrderType>(['parallel', 'out-in', 'in-out']);

function readStoredOrder(): TransitionOrderType {
  const saved = sessionStorage.getItem(STORAGE_KEY);
  if (saved && ORDERS.has(saved as TransitionOrderType)) {
    return saved as TransitionOrderType;
  }
  return 'parallel';
}

function refreshRouteTransitions(router: Element): void {
  router.querySelectorAll(AuraRoute.is).forEach((node) => {
    if (!(node instanceof AuraRoute)) return;
    node.refresh();
  });
}

function applyTransitionOrder(router: Element, order: TransitionOrderType): void {
  router.setAttribute('transition-order', order);
  router.querySelectorAll(AuraRoute.is).forEach((node) => {
    node.setAttribute('transition-order', order);
  });
  refreshRouteTransitions(router);
  sessionStorage.setItem(STORAGE_KEY, order);
}

function syncPickerButtons(picker: ParentNode, order: TransitionOrderType): void {
  picker.querySelectorAll<HTMLButtonElement>('[data-demo-transition-order]').forEach((btn) => {
    const active = btn.dataset.demoTransitionOrder === order;
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

export function syncAnimationsOrderUi(root: ParentNode = document): void {
  const site = root.querySelector('.demo-site[data-demo-scenario="animations"]');
  if (!site) return;

  const order = readStoredOrder();
  syncPickerButtons(site, order);

  root.querySelectorAll<HTMLElement>('[data-demo-param="transition-order"]').forEach((el) => {
    el.textContent = order;
  });
}

/** Кнопки parallel / out-in / in-out в demo-site-bar сценария animations. */
export function installAnimationsDemoControls(root: ParentNode = document): void {
  const site = root.querySelector('.demo-site[data-demo-scenario="animations"]');
  if (!site) return;

  const router = site.querySelector('aura-router');
  const picker = site.querySelector('[data-demo-transition-order-picker]');
  if (!router || !picker) return;

  const setOrder = (order: TransitionOrderType) => {
    applyTransitionOrder(router, order);
    syncPickerButtons(picker, order);
    syncAnimationsOrderUi(root);
  };

  picker.addEventListener('click', (event) => {
    const btn = (event.target as Element).closest<HTMLButtonElement>('[data-demo-transition-order]');
    const order = btn?.dataset.demoTransitionOrder as TransitionOrderType | undefined;
    if (!order || !ORDERS.has(order)) return;
    setOrder(order);
  });

  setOrder(readStoredOrder());
}
