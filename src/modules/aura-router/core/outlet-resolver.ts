import { AuraOutlet } from '../../aura-outlet/core/aura-outlet';
import type { AuraRouter } from './aura-router';

/** Resolve order: `outlet` attr → siblings → nested → create sibling before host. */
export function resolveAppOutlet(host: AuraRouter): AuraOutlet {
  const selector = host.outletSelector;
  if (selector) {
    const found = document.querySelector(selector);
    if (!isAuraOutlet(found)) {
      throw new Error(`\`<aura-router outlet="${selector}">\` did not match an \`<${AuraOutlet.is}>\`.`);
    }
    return found;
  }

  if (isAuraOutlet(host.previousElementSibling)) return host.previousElementSibling;
  if (isAuraOutlet(host.nextElementSibling)) return host.nextElementSibling;

  const nested = host.querySelector(AuraOutlet.is);
  if (isAuraOutlet(nested)) return nested;

  const created = document.createElement(AuraOutlet.is) as AuraOutlet;
  host.parentNode?.insertBefore(created, host);
  return created;
}

function isAuraOutlet(el: Element | null | undefined): el is AuraOutlet {
  return el?.localName === AuraOutlet.is;
}
