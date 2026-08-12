# Static site → SPA in 10 minutes

Add client-side navigation to two complete HTML pages. Direct visits and hard reloads still work; marked links update the page without a full reload.

> **Time:** About 10 minutes with a current LTS version of Node.js and npm already installed.
>
> **Prefer a ready project?** [Open the finished example in StackBlitz](https://stackblitz.com/github/aura-ui/router-playground) or view the [hosted demo](https://aura-ui.github.io/router-preview/).
>
> **No npm?** Jump to the [quick CDN test](#quick-test-without-npm).

## Before you start

This walkthrough uses two URLs:

```text
my-site/
├─ index.html
├─ about/
│  └─ index.html
└─ src/
   └─ main.js
```

Each URL must return a complete HTML page. Aura Router enhances those pages in the browser; it does not configure your server or static host.

## 1. Install

If the site does not have a `package.json`, run `npm init -y`. Then install Aura Router and Vite:

```bash
npm install --save-exact @auraui/router@0.1.0
npm install --save-dev vite
```

## 2. Add the Home page

Create `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Home</title>
    <script type="module" src="/src/main.js"></script>
  </head>
  <body>
    <nav aria-label="Main navigation">
      <a href="/" aura-router-link>Home</a>
      <a href="/about/" aura-router-link>About</a>
    </nav>

    <main id="content">
      <h1>Home</h1>
      <p>This is a complete HTML page.</p>
    </main>

    <aura-outlet></aura-outlet>

    <aura-router extract="#content">
      <aura-route path="/" view="/"></aura-route>
      <aura-route path="/about/" view="/about/"></aura-route>
    </aura-router>
  </body>
</html>
```

The links remain normal links. `extract="#content"` tells Aura which element to take from each complete HTML response.

## 3. Add the About page

Copy `index.html` to `about/index.html`, change `<title>` to `About`, and replace its `<main>`:

```html
<main id="content">
  <h1>About</h1>
  <p>This page also works as a direct URL.</p>
</main>
```

Keep the same `#content` selector, navigation, outlet, routes, and script in both pages.

## 4. Start Aura

Create `src/main.js`:

```js
import { AuraRouter } from '@auraui/router';

AuraRouter.install();
```

That is all the JavaScript required.

## 5. Run and verify

Start the development server:

```bash
npx vite
```

Open the local URL printed by Vite, then check:

1. Visit `/about/` directly and hard-reload it. The complete About page still works.
2. Click **Home**, then **About**. The URL and `#content` change without a full-page reload.
3. Optionally disable JavaScript and reload both URLs. The original links and HTML still work.

## What Aura changed

- On the initial load, Aura adopts the existing `#content` instead of requesting the current page again.
- On later marked-link clicks, Aura fetches the destination page and extracts its `#content`.
- Without Aura, the browser continues to follow the same real links normally.

## If it does not work

**A link performs a full reload:** confirm that it has `aura-router-link` and points to the same origin.

**The wrong markup appears:** every page response must contain the selector configured in `extract` (`#content` here).

**A direct URL returns 404:** configure your server or static host to return the complete page for that URL.

## Quick test without npm

If your HTML site is already served over HTTP, skip steps 1 and 4. Follow steps 2–3, but use this inline script in both pages instead of `<script type="module" src="/src/main.js"></script>`:

```html
<script type="module">
  import { AuraRouter } from 'https://esm.sh/@auraui/router@0.1.0';
  AuraRouter.install();
</script>
```

Use your existing server instead of `npx vite`, then perform the checks in step 5. `esm.sh` is a third-party CDN used here only for evaluation; prefer the npm setup for production.

## Next steps

- [Guide](./guide.md) — concepts and API details
- [Nested layouts](./recipes/nested.md) — preserve shared section UI
- [First-paint reference](./recipes/first-paint.md) — flat and nested adoption rules
