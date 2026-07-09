# View graph

View payload coordinator (parallel to `data-graph/`).

## Flow

```
route attrs → descriptor → PayloadCache? → Loader → ContentResult → ViewPayload
```

## Retention (three stores — one policy, separate backends)

| Store | Module | When |
|-------|--------|------|
| `PayloadCache` | `cache/` | `preserve.view` — string payloads |
| `ViewCache` | aura-route | detached DOM keep-alive |
| `DataGraph` | data-graph | `preserve.data` — load hooks |

## Layout

```
view-graph/
├── index.ts              # public barrel
├── content-graph.ts      # loadView, prefetch, invalidate, prefetch options
├── types.ts              # shared contracts (descriptor, context, payload)
├── cache/
│   ├── payload-cache.ts  # LRU + in-flight dedup
│   └── cache-key.ts      # stable payload cache keys
├── loader.ts             # Loader, FnLoader
├── registry.ts           # LoaderRegistry + default built-in set
├── environment.ts        # fetchText, createBrowserEnvironment
├── markup.ts             # routeSnapshot, componentMarkup
├── loaders/              # template, html, url, component, import, iframe
```

## Public API (`index.ts`)

- `ContentGraph`, `ContentGraphDeps`, `ContentPrefetchOptions`, `RouteContentSource`, `ContentLoadPort`
- `PayloadCache`, `payloadCacheKey`
- `LoaderRegistry`, `createLoaderRegistry`, `defaultLoaderRegistry`, `Loader`, `LoaderClass`, `LoaderFn`
- types: `ViewPayload`, `LoadContext`, `ContentDescriptor`, `ContentKind`, `ContentResult`, `ContentEnvironment`, `FetchText`

Built-in loaders, `markup`, and `environment` are internal — import by path or via `aura-routing-engine/core`.

## Extension

- class: extend `Loader`, then `registry.register(MyLoader)` or `registry.register(new MyLoader(env))`
- fn: `AuraRouter.registerLoader(type, fn)` → `registry.register(type, fn)`
