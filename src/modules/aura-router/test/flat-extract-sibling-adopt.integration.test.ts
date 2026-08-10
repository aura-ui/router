/** @jest-environment jsdom */

import { AuraOutlet } from '../../aura-outlet/core/aura-outlet';
import { AuraRouter } from '../core/aura-router';
import { installAuraRouter } from '../core/install';

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('flat extract adopt sibling of outlet (playground shape)', () => {
  beforeAll(() => {
    installAuraRouter();
  });

  beforeEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  it('removes adopted Index .main when navigating to template About', async () => {
    document.body.innerHTML = `
      <div class="main">
        <h1>Index</h1>
      </div>
      <aura-outlet></aura-outlet>
      <aura-router extract=".main" cache>
        <aura-route path="/" view="html::<div class='main'><h1>Index SPA</h1></div>"></aura-route>
        <aura-route path="/about" view="template::about-page"></aura-route>
      </aura-router>
      <template id="about-page">
        <div class="main">
          <h1>About</h1>
        </div>
      </template>
    `;

    await customElements.whenDefined(AuraRouter.is);
    await customElements.whenDefined(AuraOutlet.is);
    await flush();

    const indexMain = document.querySelector('.main');
    expect(indexMain?.textContent).toContain('Index');
    expect(indexMain?.hasAttribute('data-aura-view-root')).toBe(true);

    const router = document.querySelector(AuraRouter.is) as AuraRouter;
    router.navigate('/about', { replace: false, syncHistory: false });
    await flush();

    expect(document.body.textContent).toContain('About');
    expect(document.body.textContent).not.toContain('Index');
    expect(document.querySelectorAll('.main')).toHaveLength(1);
  });

  it('orphan server .main remains if boot never adopts (no extract)', async () => {
    const pageHtml = `
      <html><body>
        <div class="main"><h1>Index From Fetch</h1></div>
      </body></html>
    `;
    if (!('fetch' in globalThis)) {
      (globalThis as { fetch: typeof fetch }).fetch = jest.fn() as typeof fetch;
    }
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => pageHtml,
    } as Response);

    document.body.innerHTML = `
      <div class="main">
        <h1>Index Server</h1>
      </div>
      <aura-outlet></aura-outlet>
      <aura-router>
        <aura-route path="/" view="/"></aura-route>
        <aura-route path="/about" view="template::about-page"></aura-route>
      </aura-router>
      <template id="about-page">
        <div class="main"><h1>About</h1></div>
      </template>
    `;

    await customElements.whenDefined(AuraRouter.is);
    await flush();
    await flush();

    const router = document.querySelector(AuraRouter.is) as AuraRouter;
    router.navigate('/about', { replace: false, syncHistory: false });
    await flush();
    await flush();

    expect(document.body.textContent).toContain('Index Server');
    expect(document.body.textContent).toContain('About');
  });
});
