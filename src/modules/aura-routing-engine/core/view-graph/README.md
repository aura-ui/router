# View graph

View payload coordinator (parallel to `data-graph/`).

## Flow

```
route attrs → descriptor → PayloadCache? → Loader → ViewLoadResult → ViewPayload
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
├── index.ts           # public barrel
├── view-graph.ts      # loadView, prefetch, invalidate
├── types.ts           # shared contracts (descriptor, context, payload)
├── cache/
│   ├── payload-cache.ts
│   └── cache-key.ts
├── loader.ts
├── registry.ts
├── environment.ts
├── markup.ts
└── loaders/           # template, html, url, component, import, iframe
```

## Public API (`index.ts`)

- `ViewGraph`, `ViewGraphDeps`, `ViewPrefetchOptions`, `RouteViewSource`, `ViewLoadPort`
- `PayloadCache`, `payloadCacheKey`
- `LoaderRegistry`, `createLoaderRegistry`, `defaultLoaderRegistry`, `Loader`, `LoaderClass`, `LoaderFn`
- types: `ViewPayload`, `ViewLoadContext`, `ViewDescriptor`, `ViewKind`, `ViewLoadResult`, `ViewLoaderEnv`, `FetchText`

Built-in loaders, `markup`, and `environment` are internal — import by path or via `aura-routing-engine/core`.

## Extension

- class: extend `Loader`, then `registry.register(MyLoader)` or `registry.register(new MyLoader(env))`
- fn: `AuraRouter.registerLoader(type, fn)` → `registry.register(type, fn)`
