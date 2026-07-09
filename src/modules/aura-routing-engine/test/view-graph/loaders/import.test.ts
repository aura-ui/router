jest.mock('../../../../aura-utils/misc', () => ({
  ...jest.requireActual('../../../../aura-utils/misc'),
  loadAndRegisterComponent: jest.fn(),
}));

import { loadAndRegisterComponent } from '../../../../aura-utils/misc';
import { ImportLoader } from '../../../core/view-graph/loaders/import';
import { createBrowserEnvironment } from '../../../core/view-graph/environment';

const mockedLoad = loadAndRegisterComponent as jest.MockedFunction<typeof loadAndRegisterComponent>;

describe('ImportLoader', () => {
  beforeEach(() => {
    mockedLoad.mockResolvedValue('imported-widget');
  });

  afterEach(() => {
    mockedLoad.mockReset();
  });

  it('loads a module and returns component markup', async () => {
    const loader = new ImportLoader(createBrowserEnvironment());
    const result = await loader.load({
      content: './widgets/chart.js',
      kind: 'view',
      signal: new AbortController().signal,
      route: { href: '/charts', pattern: '/charts', params: { id: '1' } },
    });

    expect(mockedLoad).toHaveBeenCalledWith('./widgets/chart.js');
    expect(result?.kind).toBe('markup');
    if (result?.kind === 'markup') {
      expect(result.markup).toContain('<imported-widget');
      expect(result.markup).toContain('&quot;params&quot;:{&quot;id&quot;:&quot;1&quot;}');
    }
  });

  it('reuses cached tag for the same import path without reloading', async () => {
    const loader = new ImportLoader(createBrowserEnvironment());
    const signal = new AbortController().signal;
    const ctx = {
      content: './widgets/cached.js',
      kind: 'view' as const,
      signal,
      route: { href: '/cached', pattern: '/cached' },
    };

    await loader.load(ctx);
    await loader.load(ctx);

    expect(mockedLoad).toHaveBeenCalledTimes(1);
  });

  it('completes shared import when an earlier waiter aborts', async () => {
    const loader = new ImportLoader(createBrowserEnvironment());
    const prefetch = new AbortController();
    let releaseImport!: () => void;
    const importGate = new Promise<void>((resolve) => {
      releaseImport = resolve;
    });

    mockedLoad.mockImplementation(() => importGate.then(() => 'shared-widget'));

    const ctx = {
      content: './widgets/shared.js',
      kind: 'view' as const,
      route: { href: '/shared', pattern: '/shared' },
    };

    const prefetchLoad = loader.load({ ...ctx, signal: prefetch.signal });
    await Promise.resolve();
    const navLoad = loader.load({ ...ctx, signal: new AbortController().signal });

    prefetch.abort();
    releaseImport();

    await expect(prefetchLoad).resolves.toBeNull();
    await expect(navLoad).resolves.toEqual({
      kind: 'markup',
      markup: expect.stringContaining('<shared-widget'),
    });
    expect(mockedLoad).toHaveBeenCalledTimes(1);
  });

  it('returns null when aborted before load completes', async () => {
    const loader = new ImportLoader(createBrowserEnvironment());
    const controller = new AbortController();
    mockedLoad.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve('late-widget'), 30);
        }),
    );

    const promise = loader.load({
      content: './widgets/slow.js',
      kind: 'view',
      signal: controller.signal,
      route: { href: '/slow', pattern: '/slow' },
    });
    controller.abort();

    await expect(promise).resolves.toBeNull();
  });
});
