import { AURA_VIEW_ROOT_ATTR } from '../../modules/aura-outlet/core/aura-outlet';
import { syncRouteParams } from './demo-route-params';
import { getViewMeta, type DemoRouteFact } from './demo-route-meta';

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

  root.querySelectorAll('.demo-site-outlet').forEach((outlet) => {
    outlet.querySelectorAll<HTMLElement>(`:scope > [${AURA_VIEW_ROOT_ATTR}]`).forEach((viewRoot) => {
      const view = viewRoot.querySelector<HTMLElement>('.demo-site-view[data-demo-view]');
      if (view) views.push(view);
    });
  });

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
 * Без этого блок demo-facts вставляется только на событии `navigation` (после анимации).
 */
export function installDemoRouteFactsObserver(root: ParentNode = document): void {
  root.querySelectorAll('.demo-site-outlet').forEach((outlet) => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          if (!node.hasAttribute(AURA_VIEW_ROOT_ATTR)) return;

          const view = node.querySelector<HTMLElement>('.demo-site-view[data-demo-view]');
          if (view) hydrateDemoView(view);
        });
      }
    });

    observer.observe(outlet, { childList: true });
  });
}
