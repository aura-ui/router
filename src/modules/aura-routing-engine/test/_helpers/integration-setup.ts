import { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';

import { resetHookMocks } from './jest/hook-mocks';

export type SetupViewIntegrationTestsOptions = {
  /** Also call {@link resetHookMocks} in `beforeEach`. Default: `true`. */
  resetHooks?: boolean;
};

/**
 * Standard `beforeAll` / `beforeEach` for outlet + view integration suites.
 * Call once at the top of a `describe` block.
 */
export function setupViewIntegrationTests(
  options: SetupViewIntegrationTestsOptions = {},
): void {
  const resetHooks = options.resetHooks ?? true;

  beforeAll(() => {
    if (!customElements.get(AuraOutlet.is)) {
      customElements.define(AuraOutlet.is, AuraOutlet);
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    if (resetHooks) resetHookMocks();
    document.body.replaceChildren();
  });
}
