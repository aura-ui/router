import { AURA_VIEW_ROOT_ATTR } from '../../modules/aura-outlet/core/aura-outlet';
import { AURA_ROUTER_SSR_ATTR } from '../../modules/aura-router/core';

import { getViewMeta, type DemoRouteFact } from './demo-route-meta';
import { syncRouteParams } from './demo-route-params';

function appendFactValue(dd: HTMLElement, fact: DemoRouteFact): void {
  switch (fact.kind) {
    case 'code': {
      const code = document.createElement('code');
      code.textContent = fact.value;
      dd.appendChild(code);
      break;
    }
    case 'text':
      dd.textContent = fact.value;
      break;
    case 'html':
      dd.innerHTML = fact.value;
      break;
    case 'param': {
      const strong = document.createElement('strong');
      strong.dataset.demoParam = fact.param;
      strong.textContent = '—';
      dd.appendChild(strong);
      if (fact.hint) dd.append(` ${fact.hint}`);
      break;
    }
  }
}

function findFactsAnchor(view: HTMLElement): Element | null {
  const lead = view.querySelector('.demo-site-view__lead');
  if (lead) return lead;

  return view.querySelector('h1');
}

function findDemoViews(root: ParentNode): HTMLElement[] {
  const views: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();

  const pushFrom = (viewRoot: HTMLElement) => {
    const view = viewRoot.querySelector<HTMLElement>('.demo-site-view[data-demo-view]');
    if (view && !seen.has(view)) {
      seen.add(view);
      views.push(view);
    }
  };

  root.querySelectorAll('.demo-site-outlet').forEach((outlet) => {
    outlet.querySelectorAll<HTMLElement>(`:scope > [${AURA_VIEW_ROOT_ATTR}]`).forEach(pushFrom);
  });

  // Guide-shaped first paint: marker is a sibling of the outlet, not inside it.
  root.querySelectorAll<HTMLElement>(`[${AURA_ROUTER_SSR_ATTR}][${AURA_VIEW_ROOT_ATTR}]`).forEach(pushFrom);

  if (views.length) return views;

  const fallback = root.querySelector<HTMLElement>('.demo-site-view[data-demo-view]');
  return fallback ? [fallback] : [];
}

/** Facts + param placeholders для одного view (в т.ч. staged incoming). */
export function hydrateDemoView(view: HTMLElement): void {
  renderFactsForView(view);
  syncRouteParams(view);
}

/** Рендерит &lt;dl class="demo-route-facts"&gt; для одного view. */
export function renderFactsForView(view: HTMLElement): void {
  view.querySelector('.demo-route-facts')?.remove();

  const facts = getViewMeta(view.dataset.demoView);
  if (!facts?.length) return;

  const dl = document.createElement('dl');
  dl.className = 'demo-facts demo-route-facts';

  for (const fact of facts) {
    const dt = document.createElement('dt');
    dt.textContent = fact.term;
    const dd = document.createElement('dd');
    appendFactValue(dd, fact);
    dl.append(dt, dd);
  }

  const anchor = findFactsAnchor(view);
  if (anchor) anchor.after(dl);
  else view.prepend(dl);
}

/**
 * Рендерит facts для всех view в outlet (включая staged incoming во время transition).
 * Раньше брался только первый `.demo-site-view` — facts появлялись после анимации.
 */
export function renderRouteFacts(root: ParentNode = document): void {
  const views = findDemoViews(root);
  views.forEach((view) => hydrateDemoView(view));
}

/**
 * Сразу после mount staged view — до конца transitionIn.
 * Также ловит hydrate adopt: `data-aura-view-root` на marker / root
 * (в т.ч. sibling снаружи outlet — guide-shaped first paint).
 */
export function installDemoRouteFactsObserver(root: ParentNode = document): void {
  const observeTarget = (target: ParentNode) => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.target instanceof HTMLElement) {
          const node = mutation.target;
          if (!node.hasAttribute(AURA_VIEW_ROOT_ATTR)) continue;
          const view = node.querySelector<HTMLElement>('.demo-site-view[data-demo-view]');
          if (view) hydrateDemoView(view);
          continue;
        }

        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          if (!node.hasAttribute(AURA_VIEW_ROOT_ATTR)) return;

          const view = node.querySelector<HTMLElement>('.demo-site-view[data-demo-view]');
          if (view) hydrateDemoView(view);
        });
      }
    });

    observer.observe(target as Node, {
      childList: true,
      attributes: true,
      attributeFilter: [AURA_VIEW_ROOT_ATTR],
      subtree: true,
    });
  };

  const stages = root.querySelectorAll('.demo-site-stage');
  if (stages.length) {
    stages.forEach((stage) => observeTarget(stage));
    return;
  }

  root.querySelectorAll('.demo-site-outlet').forEach((outlet) => observeTarget(outlet));
}
