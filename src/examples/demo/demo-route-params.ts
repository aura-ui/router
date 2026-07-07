/** Обновляет `[data-demo-param]` внутри scope (view или document). */
export function syncRouteParams(scope: ParentNode = document): void {
  const path = location.pathname;
  const search = new URLSearchParams(location.search);
  const hash = location.hash;

  scope.querySelectorAll<HTMLElement>('[data-demo-param]').forEach((el) => {
    const key = el.dataset.demoParam;
    if (!key) return;

    if (key === 'id') {
      const match =
        path.match(/\/users\/([^/]+)(?:\/|$)/)
        ?? path.match(/\/phase-update\/(?:remount|update)\/([^/]+)(?:\/|$)/);
      el.textContent = match?.[1] ?? '—';
      return;
    }

    if (key === 'tab') {
      el.textContent = search.get('tab') ?? 'info';
      return;
    }

    if (key === 'section') {
      el.textContent = hash.slice(1) || '—';
      return;
    }

    if (key === 'transition-order') {
      el.textContent = sessionStorage.getItem('demo-animations-transition-order') ?? 'parallel';
    }
  });
}
