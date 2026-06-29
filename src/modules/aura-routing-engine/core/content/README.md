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

- `preserve="data"` → `descriptor.cache = true`
- Only string payloads are cached
- Abort → `null`; loader failure → `ContentLoadError`
