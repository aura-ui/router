# Pre-release checklist: 0.1.0

> **Audience:** solo maintainer  
> **Goal:** npm-installable library + honest docs + demo — **no new subsystems**  
> **Status:** in progress (2026-07-02)

See [LIMITATIONS.md](../../LIMITATIONS.md) · [CHANGELOG.md](../../CHANGELOG.md)

---

## Must-have (ship blockers)

### A. Public API = code

- [x] README uses shipped attrs: `enter`, `load`, `after`, `leave`, `left`, `reenter`, `error`
- [x] Remove misleading `guard` / `ready` / `unmount` / `update` as primary API
- [x] [LIMITATIONS.md](../../LIMITATIONS.md) published
- [ ] Quick start verified by fresh clone (`npm install` → `npm run dev`)

### B. npm package surface

- [x] `src/index.ts` public entry
- [x] `package.json` `exports`, `types`, `files`
- [x] `npm run build` → `dist/` with `.d.ts`
- [ ] `npm pack` smoke test in empty Vite project

### C. Quality gate

- [x] GitHub Actions: `npm run build` + `npm test` on push/PR
- [ ] `npm run check` green before tag

### D. Demo (killer path)

Demo already covers (see `index.html`):

- [x] Nested layout (`/routing/users` + `users-layout`)
- [x] `enter="auth"` + `load="user-stats"` + `preserve="data"`
- [x] Prefetch `prefetch="intent"`
- [x] Catch-all 404
- [ ] Document invalidate flow in demo or story (optional polish)

### E. Release artifacts

- [x] `CHANGELOG.md` — 0.1.0 section
- [x] Version `0.1.0` in `package.json`
- [ ] Git tag `v0.1.0`
- [ ] `npm publish --access public` (manual)

---

## Explicitly OUT OF SCOPE for 0.1.0

- Search schema (`search` attr) — [SEARCH_SCHEMA.md](./SEARCH_SCHEMA.md)
- Branch context DI
- Devtools
- Engine migration 1.2
- SSR loaders
- `router.load()` refetch
- Incremental DOM

---

## Pre-tag command

```bash
npm run check:ci
npm pack
# tag after manual smoke test
```

---

## Success criteria (solo)

| Metric | Target |
|--------|--------|
| `import { AuraRouter } from '@aura-ui-web/router'` | works |
| README matches attrs | yes |
| Dogfood 2+ weeks on own project | post-release |
| External user runs demo | bonus |
