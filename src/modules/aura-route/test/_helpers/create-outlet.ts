import { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';

/** Create `<aura-outlet>` and append it to `parent` (default: `document.body`). */
export function createOutlet(parent: ParentNode = document.body): AuraOutlet {
  const outlet = document.createElement(AuraOutlet.is) as AuraOutlet;
  parent.append(outlet);
  return outlet;
}

/**
 * Layout shell fragment with a nested `<aura-outlet>` (keep-alive / nested mount tests).
 */
export function layoutWithOutlet(
  headerTag = 'header',
): { fragment: DocumentFragment; nested: AuraOutlet } {
  const fragment = document.createDocumentFragment();
  const nested = document.createElement(AuraOutlet.is) as AuraOutlet;
  fragment.append(document.createElement(headerTag), nested);
  return { fragment, nested };
}
