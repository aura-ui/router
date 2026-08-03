import { AuraOutlet } from '../../aura-outlet/core/aura-outlet';
import type { AuraRouter } from './aura-router';

/** Resolve order: `outlet` attr → first `<aura-outlet>` in document → create sibling before host. */
export function resolveAppOutlet(host: AuraRouter): AuraOutlet {
  const selector = host.outletSelector;
  if (selector) {
    const found = document.querySelector(selector);
    if (!isAuraOutlet(found)) {
      throw new Error(`\`<aura-router outlet="${selector}">\` did not match an \`<${AuraOutlet.is}>\`.`);
    }
    return found;
  }

  const found = document.querySelector<AuraOutlet>(AuraOutlet.is);
  if (found) return found;

  const created = document.createElement(AuraOutlet.is) as AuraOutlet;
  host.parentNode?.insertBefore(created, host);
  return created;
}

function isAuraOutlet(el: Element | null | undefined): el is AuraOutlet {
  return el?.localName === AuraOutlet.is;
}
