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

/** Рендерит &lt;dl class="demo-route-facts"&gt; для view с data-demo-view. */
export function renderRouteFacts(root: ParentNode = document): void {
  const view = root.querySelector<HTMLElement>('.demo-site-view[data-demo-view]');
  if (!view) return;

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
