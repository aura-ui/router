# Recipes

Use these focused examples when you need a working pattern without reading the complete guide first. Each recipe includes the minimum configuration, important behaviour, and a related implementation in [`playground/`](../../playground/).

For your first migration, start with [Static site → SPA in 10 minutes](../tutorial.md). Return here when you need one specific pattern.

| Recipe                                          | Use it when                                        |
| ----------------------------------------------- | -------------------------------------------------- |
| [Auth guard](./auth.md)                         | A route or layout requires sign-in                 |
| [Nested layout](./nested.md)                    | Several pages share one mounted layout             |
| [Prefetch & cache](./prefetch-cache.md)         | Links should prepare early and reuse loaded work   |
| [Not found & navigation errors](./not-found.md) | The app needs a 404 page and failure UI            |
| [First-paint reference](./first-paint.md)       | You need flat or nested server-HTML adoption rules |

<details>
<summary>Run the playground locally</summary>

The playground uses a packed build of the local router. Run once from the repository root:

```bash
npm install
npm run build
node -e "require('fs').mkdirSync('playground/dist', { recursive: true })"
npm pack --pack-destination playground/dist

cd playground
npm install
npm run dev
```

Later runs only need `cd playground` followed by `npm run dev`.

</details>

For complete API details, use the [Guide](../guide.md).
