# Known limitations

Honest gaps for the current **pre-alpha `0.0.1`** tree — public surface that can surprise authors. Shipped contract: [docs/guide.md](./docs/guide.md) · [SECURITY.md](./SECURITY.md). Planned work: [ROADMAP.md](./ROADMAP.md). History: [CHANGELOG.md](./CHANGELOG.md).

The public API may change before `0.1.0`.

## Status

- **Published on npm** — [`@auraui/router@0.0.1`](https://www.npmjs.com/package/@auraui/router). Still pre-alpha: pin exact versions; do not treat as a frozen production contract.
- **0.x semver** — expect breaking changes until `1.0.0`.
- **Docs may lag code** — trust shipped attrs on `<aura-route>` / [README](./README.md) / [guide](./docs/guide.md) over older design notes.

## Known gaps

### Data

- **`cache-refresh` does not revalidate on navigate** — the attr is accepted and stored as long-cache `staleTime`, but navigation uses cache `get`/`set` (not `resolve`), so there is no background refresh into the page. Only `cache-time` (`gcTime`) affects hit/miss today. Product SWR / `shouldRevalidate` / public `defer()` — ROADMAP 2.1.

### Prefetch

- **`viewport` / `render` prefetch modes parse but are not wired** — working modes: `intent`, `tap`, and `manual` (`router.prefetch`). Declaring `viewport` or `render` does not enable IntersectionObserver / render-time prefetch.
