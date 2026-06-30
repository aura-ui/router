# TODO: Devtools / observability для кеша

> **Статус:** план / архитектура (не реализовано)  
> **Связь:** [CACHE_STORE_COMPARISON.md](../comparison/CACHE_STORE_COMPARISON.md) · [CONTENT_CACHE.md](./CONTENT_CACHE.md) · [FUTURE_PROOF_ENGINE.md §5](../FUTURE_PROOF_ENGINE.md) · [REACT_ROUTER_COMPARISON.md §P2#12](../comparison/REACT_ROUTER_COMPARISON.md)

---

## Зачем

В [CACHE_STORE_COMPARISON.md](../comparison/CACHE_STORE_COMPARISON.md) у TanStack — ✅ Devtools, у Aura — ❌. Это не «кеш плохой», а **нет способа в dev увидеть hit/miss, ключи и removal** без `console.log`.

Цель: parity с TanStack Router Devtools на уровне **кеша контента** (позже — общая панель с navigation timeline).

---

## Как это устроено (модель)

Devtools — **не внутри** `AuraCacheStore`. Три отдельные части:

```text
┌─────────────────┐     события      ┌──────────────────┐     читает      ┌─────────────────┐
│  AuraCacheStore │ ───────────────► │  буфер / EventBus │ ◄────────────── │  dev-панель     │
│  get/set/remove │   hit, miss, …   │  (последние N)    │                 │  таблица в DOM  │
└─────────────────┘                  └──────────────────┘                 └─────────────────┘
```

**Важно:** панель **сама не появится**. Нужно в dev:

1. включить emit событий из store (или DataCache);
2. подключить слушатель / буфер;
3. смонтировать UI и **передать** ссылки на `router` и `cache`.

Как у TanStack:

```tsx
<RouterProvider router={router}>
  <TanStackRouterDevtools router={router} />  {/* без этой строки панели нет */}
</RouterProvider>
```

Browser extension (React DevTools) — **другая** модель; для Aura пока не планируется.

---

## Шаг 0 — что есть сейчас

| Есть | Нет |
|------|-----|
| `cache.size` / `keys()` (без GC; могут включать GC-expired до `purgeExpired` или read) | список ключей / fresh\|stale |
| `onRemove` (cleanup DOM) | hit/miss/set события |
| `lookup()` → status | dev UI |
| `npm run bench:cache` | связь событий с маршрутом |

---

## Шаг 1 — события из store (API, план)

Добавить в `CacheStoreOptions` опциональный callback — **нулевая цена**, если не передан:

```ts
// aura-cache-store.ts (план)

export type CacheEventType =
  | 'get:hit'
  | 'get:miss'
  | 'set'
  | 'remove:lru'
  | 'remove:gc'
  | 'invalidate:stale'
  | 'invalidate:remove'
  | 'clear';

export type CacheEvent = {
  type: CacheEventType;
  key: string;
  at: number;
};

export type CacheStoreOptions<T> = {
  // ...существующие опции
  onCacheEvent?: (event: CacheEvent) => void;
};
```

Внутри `get` / `set` / `removeNode` / `invalidate`:

```ts
private emit(event: Omit<CacheEvent, 'at'>): void {
  this.onCacheEvent?.({ ...event, at: Date.now() });
}

// в get():
if (entry) {
  this.emit({ type: 'get:hit', key });
  // ...
} else {
  this.emit({ type: 'get:miss', key });
}
```

Снимок для панели (без дампа value — только метаданные):

```ts
export type CacheEntrySnapshot = {
  key: string;
  status: 'fresh' | 'stale';
  storedAt: number;
  ageMs: number;
};

// публичный метод (dev / opt-in)
snapshot(now = Date.now()): CacheEntrySnapshot[];
```

**Критерий готовности шага 1:** unit-тесты на `onCacheEvent` для hit, miss, LRU remove, `clear`.

---

## Шаг 2 — буфер событий (dev-only модуль)

Файл: `src/examples/demo/devtools/cache-event-log.ts` (или `src/modules/aura-cache-store/dev/event-log.ts`).

```ts
import type { CacheEvent } from '../../modules/aura-cache-store/core/aura-cache-store';

const MAX = 200;
const log: CacheEvent[] = [];

export function pushCacheEvent(event: CacheEvent): void {
  log.push(event);
  if (log.length > MAX) log.shift();

  window.dispatchEvent(
    new CustomEvent('aura-cache', { detail: event }),
  );
}

export function getCacheLog(): readonly CacheEvent[] {
  return log;
}

export function clearCacheLog(): void {
  log.length = 0;
}
```

Подключение к store:

```ts
import { pushCacheEvent } from './devtools/cache-event-log';

const cache = new AuraCacheStore<string>({
  max: 100,
  onCacheEvent: pushCacheEvent,
});
```

---

## Шаг 3 — простая dev-панель

Файл: `src/examples/demo/devtools/cache-devtools-panel.ts`.

```ts
import { getCacheLog, clearCacheLog } from './cache-event-log';
import type { AuraCacheStore } from '../../../modules/aura-cache-store/core/aura-cache-store';

const PANEL_ID = 'aura-cache-devtools';

export function mountCacheDevtools(cache: AuraCacheStore<unknown>): () => void {
  if (document.getElementById(PANEL_ID)) return () => {};

  const root = document.createElement('div');
  root.id = PANEL_ID;
  root.setAttribute('data-aura-devtools', 'cache');
  Object.assign(root.style, {
    position: 'fixed',
    bottom: '8px',
    right: '8px',
    width: '420px',
    maxHeight: '40vh',
    overflow: 'auto',
    font: '12px/1.4 monospace',
    background: '#1e1e1e',
    color: '#d4d4d4',
    border: '1px solid #444',
    borderRadius: '6px',
    padding: '8px',
    zIndex: '99999',
  });

  const title = document.createElement('div');
  title.textContent = 'Aura Cache Devtools';
  root.appendChild(title);

  const meta = document.createElement('div');
  root.appendChild(meta);

  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  root.appendChild(table);

  const btn = document.createElement('button');
  btn.textContent = 'Clear log';
  btn.onclick = () => clearCacheLog();
  root.appendChild(btn);

  document.body.appendChild(root);

  const render = (): void => {
    const events = getCacheLog();
    const snap = cache.snapshot?.() ?? [];

    meta.textContent = `events: ${events.length} · entries: ${cache.size} · snapshot: ${snap.length}`;

    const rows = events
      .slice()
      .reverse()
      .slice(0, 50)
      .map(
        (e) =>
          `<tr><td>${e.type}</td><td style="word-break:break-all">${e.key}</td></tr>`,
      )
      .join('');

    table.innerHTML = `
      <thead><tr><th>type</th><th>key</th></tr></thead>
      <tbody>${rows}</tbody>
    `;
  };

  const onBus = (): void => render();
  window.addEventListener('aura-cache', onBus);
  const timer = setInterval(render, 1000);

  render();

  return () => {
    clearInterval(timer);
    window.removeEventListener('aura-cache', onBus);
    root.remove();
  };
}
```

Панель рисует **ленту событий** и опционально `snapshot()` — без полного HTML в логе.

---

## Шаг 4 — регистрация в demo (только DEV)

`src/examples/demo/main.ts`:

```ts
// ...существующие импорты

if (import.meta.env.DEV) {
  void import('./devtools/cache-devtools-panel').then(({ mountCacheDevtools }) => {
    // когда DataCache появится — передать его .store
    // const DataCache = ...
    // mountCacheDevtools(DataCache.store);

    // временно: отдельный store для отладки
    import('../../modules/aura-cache-store/core/aura-cache-store').then(({ AuraCacheStore }) => {
      const debugCache = new AuraCacheStore<string>({ max: 50 });
      mountCacheDevtools(debugCache);
      (window as unknown as { __auraDebugCache: typeof debugCache }).__auraDebugCache = debugCache;
    });
  });
}
```

**Production:** блок под `import.meta.env.DEV` не попадает в бандл (Vite tree-shake) — панели нет, overhead нулевой.

Проверка в консоли после навигации (когда store связан с DataCache):

```js
__auraDebugCache.get('html:/users/1');
// в панели: get:hit или get:miss
```

---

## Шаг 5 — связь с роутером (после DataCache)

Когда есть `data-key.ts` и `DataCache`:

```ts
// data-cache.ts (план)
const key = buildKey(route, match);

const hit = store.lookup(key);
bus.emit({
  type: 'cache:lookup',
  key,
  routePath: match.fullPath,
  status: hit.status,
});

if (hit.status === 'fresh' || hit.status === 'stale') {
  return hit.value;
}
```

EventBus из [FUTURE_PROOF_ENGINE.md §5](../FUTURE_PROOF_ENGINE.md) — тот же поток, что navigation timeline. Панель подписывается на `cache:*` и `navigation:*`.

Регистрация **полной** панели:

```ts
mountAuraDevtools({
  router: document.querySelector('aura-router')!,
  dataCache,
  dataGraph, // опционально
});
```

Панель **не сканирует** страницу в поисках всех `AuraCacheStore` — вы передаёте экземпляры явно.

---

## Шаг 6 — полная панель (P2)

Расширения поверх шагов 1–5:

| Фича | Описание |
|------|----------|
| Вкладка Snapshot | таблица ключей: status, age, LRU-порядок |
| Вкладка Events | лента hit/miss/remove с фильтром по prefix |
| Invalidate | кнопки «stale prefix `data:`», «clear all» |
| Navigation | timeline: match → load → cache hit → render (EventBus) |
| Отдельный пакет | `@aura-ui/router-devtools` — tree-shaken из production |

Аналоги: [TanStack Router Devtools](https://tanstack.com/router/latest/docs/framework/react/devtools), [REACT_ROUTER_COMPARISON.md §P2#12](../comparison/REACT_ROUTER_COMPARISON.md).

---

## Что показывать / чего не показывать

| Показывать | Не показывать |
|------------|---------------|
| key, type события, fresh\|stale, age | полный HTML / DOM nodes |
| routePath после `buildKey` | значения с PII |
| счётчики hit/miss | лог в production |

---

## Критерии готовности

- [ ] `onCacheEvent` + `snapshot()` в `AuraCacheStore`
- [ ] Тесты на emit для hit, miss, remove, clear
- [ ] `cache-event-log.ts` + `mountCacheDevtools()` в demo под `import.meta.env.DEV`
- [ ] DataCache шлёт `cache:lookup` с route-aware key
- [ ] EventBus `cache:*` в engine (этап 7)
- [ ] Документация в module README: «как включить devtools в demo»

---

## Связанные документы

| Документ | Тема |
|----------|------|
| [CACHE_STORE_COMPARISON.md](../comparison/CACHE_STORE_COMPARISON.md) | сравнение пробелов, FAQ |
| [CONTENT_CACHE.md](./CONTENT_CACHE.md) | интеграция store в pipeline |
| [FUTURE_PROOF_ENGINE.md §5](../FUTURE_PROOF_ENGINE.md) | EventBus |
| [IMPLEMENTATION_STEPS.md](../IMPLEMENTATION_STEPS.md) | этап 7 — Platform polish |
