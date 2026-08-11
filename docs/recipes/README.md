# Recipes

Use these focused examples when you need a working pattern without reading the complete guide first. Each recipe includes the minimum configuration, important behaviour, and steps for testing it in [`playground/`](../../playground/).

| Recipe | Use it when |
| --- | --- |
| [Auth guard](./auth.md) | A route or layout requires sign-in |
| [Nested layout](./nested.md) | Several pages share one mounted layout |
| [Prefetch & cache](./prefetch-cache.md) | Links should prepare early and reuse loaded work |
| [Not found & navigation errors](./not-found.md) | The app needs a 404 page and failure UI |
| [First paint (MPA → SPA)](./first-paint.md) | Server HTML should become the first active route without refetching |

## One-time playground setup

The playground installs a packed build of the local router. From the repository root:

```bash
npm install
npm run build
node -e "require('fs').mkdirSync('playground/dist', { recursive: true })"
npm pack --pack-destination playground/dist

cd playground
npm install
npm run dev
```

After setup, later runs only need `cd playground` followed by `npm run dev`. Open the local URL printed by the server.

For complete attribute and API details, use the [Guide](../guide.md).
