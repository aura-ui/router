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
      ref: './widgets/chart.js',
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
});
