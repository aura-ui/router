import { AuraRouter } from './aura-router';
import { registerComponent } from '../../aura-utils/misc/component';
import { AuraRoute } from '../../aura-route/core/aura-route';
import { AuraRouterOutlet } from '../../aura-router-outlet/core/aura-router-outlet';
import { AuraOutlet } from '../../aura-outlet/core/aura-outlet';

export function registerAuraRouterComponents(): void {
  registerComponent(AuraOutlet);
  registerComponent(AuraRouterOutlet);
  registerComponent(AuraRoute);
  registerComponent(AuraRouter);
}
