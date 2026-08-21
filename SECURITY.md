# Security policy

## Supported versions

We accept security reports for:

- The **latest published** `@auraui/router` release on [npm](https://www.npmjs.com/package/@auraui/router), and
- The **current default branch** of this repository (0.x; API may still change before `1.0.0`).

Older commits, forks, and unmodified demos are unsupported.

> 0.x: security fixes are best-effort. Pin exact versions in apps.

## Reporting a vulnerability

**Do not** open a public GitHub issue or discussion for security bugs.

Report via a [private GitHub security advisory](https://github.com/aura-ui/router/security/advisories/new).

Please include:

1. Package / commit (e.g. `@auraui/router@0.2.0` or a commit SHA)
2. Impact (what an attacker can do)
3. Minimal reproduction (HTML + JS)
4. Whether the attack needs attacker-controlled route markup or other already-trusted app config

There is no bug bounty and no fixed response SLA. We will acknowledge when we can and follow up on triage.

## Trust model

Aura Router runs in the browser and renders content from **app-supplied configuration**:

- `<aura-router>` / `<aura-route>` attributes (`view`, `layout`, `html::…`, `url` / `iframe` targets, `extract`, lifecycle attrs, …)
- Registered hooks and any HTML they cause the app to insert

That configuration is **trusted**, same as server-rendered templates. Putting attacker-controlled strings into those attrs without sanitization is an **application** vulnerability, not a router bug. See [guide — Views](./docs/guide/03-views-and-layouts.md#views) and this policy.

## Scope

**In scope**

Bugs in this library that increase impact even when route config is trusted, for example:

- Unexpected script execution or HTML injection from **library defaults** or internal handling (not from app-supplied `view` / `html::` content)
- Prototype pollution or similar issues reachable through the public API
- Open redirects or navigation behavior that bypasses guards the app correctly configured

**Out of scope**

- XSS or data exfiltration from untrusted values in route attrs, loader targets, or `extract` selectors
- Pointing `url` / `iframe` at untrusted origins (no allowlist by design)
- Issues only in `playground/` or other sample apps
- Denial of service against a host page, social engineering, or vulnerabilities solely in third-party dependencies
- Feature requests, API design, and docs gaps → [Issues](https://github.com/aura-ui/router/issues)

## Safe use

- Pin exact `@auraui/router` versions while on `0.0.x`
- Keep route markup and loader targets under your control
- Prefer same-origin `url` views; treat cross-origin `iframe::` / fetch targets as an explicit trust decision
