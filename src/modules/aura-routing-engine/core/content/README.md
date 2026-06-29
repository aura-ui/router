# Content layer

Loads view payloads for matched routes during navigation and prefetch.

## Flow

```
Route attrs → ContentLoadService.resolve → [cache] → LoaderFn → ViewPayload
```

## Layout

| Path | Role |
|------|------|
| `model/` | Types, preserve |
| `loaders/` | Registry, builtins, load context |
| `cache/` | LRU cache + cache keys |
| `transport/` | HTTP fetch |
| `content-load-service.ts` | Single orchestrator (render + prefetch) |

## Cache rules

- `preserve="view"` (or bare `preserve`) → view-loader payload cache (`html-src`, `html`, …) via router `DataCache`
- `preserve="data"` → `load` hook cache in DataGraph (separate store)
- Only string view payloads are cached in `DataCache`
- Abort → `null`; loader failure → `ContentLoadError`
- Configure view-loader LRU via `AuraRouter.configure({ dataCache: { max, gcTime } })`
