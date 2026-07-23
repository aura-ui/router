import { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import { AuraRoute } from '../../core/aura-route';

/** Idempotent `customElements.define` for `<aura-outlet>`. */
export function defineAuraOutlet(): void {
  if (!customElements.get(AuraOutlet.is)) {
    customElements.define(AuraOutlet.is, AuraOutlet);
  }
}

/** Idempotent `customElements.define` for `<aura-route>`. */
export function defineAuraRoute(): void {
  if (!customElements.get(AuraRoute.is)) {
    customElements.define(AuraRoute.is, AuraRoute);
  }
}

/** Idempotent `customElements.define` for `<aura-router>` (pass mock or real ctor). */
export function defineAuraRouter(ctor: CustomElementConstructor, is = 'aura-router'): void {
  if (!customElements.get(is)) {
    customElements.define(is, ctor);
  }
}
