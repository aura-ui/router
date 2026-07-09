# Content graph

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
content-graph/
├── index.ts              # public barrel
├── content-graph.ts      # resolve, prefetch, invalidate orchestrator
├── prefetch.ts           # concurrent prefetch runner + options type
├── cache/
│   ├── index.ts
│   ├── payload-cache.ts  # LRU + in-flight dedup
│   ├── cache-key.ts      # stable payload cache keys
│   └── invalidate.ts     # payload cache key predicates
├── model/
│   ├── types.ts
│   ├── descriptor.ts
│   ├── context.ts
│   └── result.ts
└── runtime/
    ├── loader.ts         # abstract Loader, FnLoader
    ├── registry.ts       # LoaderRegistry
    ├── manifest.ts       # built-in loader list
    ├── environment.ts    # fetchText, createBrowserEnvironment
    └── loaders/          # template, html, url, component, import, iframe
```

## Extension

- class: extend `Loader`, `registry.register(instance)`
- fn: `AuraRouter.registerLoader` → `registerFn`
