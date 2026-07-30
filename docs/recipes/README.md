# Recipes

Short copy-paste patterns on top of the live [`playground/`](../../playground/). For the full API, see the [Guide](../guide.md).

| Recipe | Pattern |
| --- | --- |
| [Auth guard](./auth.md) | `guard` → redirect → protected layout |
| [Nested layout](./nested.md) | Parent `layout` + `<aura-outlet>` + `:id` |
| [Prefetch & cache](./prefetch-cache.md) | Link prefetch, `cache` / `cache-time` / `cache="off"` |
| [404 & errors](./not-found.md) | `path="*"` + `error-template` |
| [First paint (MPA→SPA)](./first-paint.md) | Server HTML + `aura-router-ssr` adopt |

```bash
cd playground && npm install && npm run dev
```
