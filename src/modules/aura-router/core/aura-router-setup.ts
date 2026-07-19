import { AuraOutlet } from '../../aura-outlet/core/aura-outlet';
import { AuraRoute } from '../../aura-route/core/aura-route';
import { registerComponent } from '../../aura-utils/misc/component';

import { AuraRouter } from './aura-router';

export function registerAuraRouterComponents(): void {
  registerComponent(AuraOutlet);
  registerComponent(AuraRoute);
  registerComponent(AuraRouter);
}
