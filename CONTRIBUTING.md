# Contributing

Commit messages in this repository are checked automatically with [Commitlint](https://commitlint.js.org/) using [Conventional Commits](https://www.conventionalcommits.org/).

## Commit message format

```
<type>(<optional scope>): <short description>

[optional body]

[optional footer(s)]
```

The subject line (first line) must include a **type** prefix and a short description after a colon and space.

### Allowed types (prefixes)

Use one of these types at the start of the message. Pick the type that best matches the **main** change in the commit.

| Prefix | When to use |
|--------|-------------|
| `feat` | New user-visible behavior or API (feature). |
| `fix` | Bug fix or correction of incorrect behavior. |
| `docs` | Documentation only (README, comments meant as docs, guides). |
| `style` | Formatting, whitespace, semicolons, Prettier-only changes; no logic change. |
| `refactor` | Internal restructuring without changing external behavior. |
| `perf` | Performance improvements. |
| `test` | Adding or changing tests only. |
| `build` | Build system, bundler, packaging (e.g. Vite, `tsconfig`, npm scripts that affect the build). |
| `ci` | CI configuration (GitHub Actions, hooks setup if it is CI-related). |
| `chore` | Maintenance that does not fit above (deps bump, tooling, repo housekeeping). |
| `revert` | Reverts a previous commit (often `revert: <summary>` or generated revert message). |

### Scope (optional)

You may add a scope in parentheses after the type to narrow the area of change:

```
feat(router): add scroll restoration hook
fix(history): handle duplicate popstate
docs(readme): clarify SSR usage
```

Use a short, lowercase scope name (e.g. module or area of the codebase).

### Examples

Valid:

```
feat: add route guard callback
fix: prevent double navigation on same URL
docs: document lifecycle hooks
style: format sources with prettier
chore: bump devDependencies
```

Invalid (will fail the commit hook):

```
updated router
WIP
fixed stuff
```

### Local checks

- Validate the message from stdin: `echo "feat: example" | npx commitlint`
- Validate the last edited commit message file (during or after `git commit`): `npx commitlint --edit .git/COMMIT_EDITMSG`
- Husky runs Commitlint on `git commit` via `.husky/commit-msg`.

If you are unsure which type to use, prefer the smallest accurate label: `fix` for bugs, `feat` for new behavior, `chore` or `docs` for everything else that is not code logic.
