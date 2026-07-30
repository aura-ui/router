## Summary

<!-- Why this change exists; 1–3 short bullets. Call out breaking / pre-alpha API changes. -->

## Test plan

- [ ] `npm test` (or N/A)
- [ ] `npm run check` when build, packaging, or public entry may be affected (lint + `build:smoke`)
- [ ] Manual: `playground/` and/or relevant recipe path, if navigation / hydrate / cache UX changed

## Checklist

- [ ] Tests added/updated under the Jest suite (or N/A)
- [ ] User-facing docs: `README.md`, `docs/guide.md`, and/or `docs/recipes/` when behavior or public HTML/API surface changed
- [ ] `LIMITATIONS.md` if a known gap was added, removed, or narrowed
- [ ] `CHANGELOG.md` for user-visible changes (Keep a Changelog; skip pure chore/ci/docs-only unless notable)
- [ ] `ROADMAP.md` only when shipped/planned status actually changed
- [ ] `SECURITY.md` if the trust model, XSS surface, or reporting path changed
- [ ] `playground/` updated when it is the reference for the changed behavior
