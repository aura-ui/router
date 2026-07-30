import { AuraOutlet, AURA_VIEW_ROOT_ATTR } from '../../../aura-outlet/core/aura-outlet';
import { AuraRoutingEngine } from '../aura-routing-engine';
import { resolveDocumentHrefParts } from '../link-active';
import type { MatchedRouteInfo } from '../match/url-matcher';

type HydrateStep = {
  entry: MatchedRouteInfo;
  outlet: AuraOutlet;
  root: HTMLElement;
};

/**
 * - `adopted` — SSR markup matched the route chain and was adopted.
 * - `structure-error` — route matched, but nested SSR structure is invalid
 *   (missing outlet / view-root). Caller must keep SSR and defer CSR remount.
 * - `fallback` — no usable match / redirect / adopt failure → normal init navigate.
 */
export type HydrateResult =
  | { status: 'adopted'; leaf: MatchedRouteInfo }
  | { status: 'structure-error'; leaf: MatchedRouteInfo }
  | { status: 'fallback' };

/**
 * Adopt server markup into the matched route chain without fetch/remount.
 */
export async function hydrate(
  initialView: HTMLElement,
  engine: AuraRoutingEngine,
  rootOutlet: AuraOutlet,
): Promise<HydrateResult> {
  const { pathname, search, hash, href } = resolveDocumentHrefParts(location.href);
  const found = engine.matcher.matchPath(pathname, engine.getMatchableNodes());
  if (!found || found.node.route.type === 'redirect') return { status: 'fallback' };

  const leaf = engine.matcher.buildMatchedRouteInfo(
    href,
    pathname,
    search,
    hash,
    found.node,
    found.params,
  );
  const chain = leaf.chain ?? [leaf];

  const plan = buildHydratePlan(chain, initialView, rootOutlet);
  if (!plan) return { status: 'structure-error', leaf };

  try {
    await Promise.all(plan.map((step) => step.entry.route.whenReady()));
    for (const step of plan) {
      const handle = step.outlet.adopt(step.root, step.entry.viewKey ?? step.entry.pathname);
      step.entry.route.adopt(handle, step.entry);
    }
  } catch {
    return { status: 'fallback' };
  }

  return { status: 'adopted', leaf };
}

/** Dry-run: validate server markup for the full chain before any adopt. */
function buildHydratePlan(
  chain: readonly MatchedRouteInfo[],
  initialView: HTMLElement,
  rootOutlet: AuraOutlet,
): HydrateStep[] | null {
  const plan: HydrateStep[] = [];
  let outlet: AuraOutlet = rootOutlet;
  let root: HTMLElement | null = initialView;

  for (let i = 0; i < chain.length; i++) {
    const entry = chain[i]!;
    if (!root) return null;

    plan.push({ entry, outlet, root });
    if (i === chain.length - 1) break;

    const nested = peekChildOutlet(root);
    if (!nested) return null;

    const nextRoot = nested.querySelector<HTMLElement>(`:scope > [${AURA_VIEW_ROOT_ATTR}]`);
    if (!nextRoot) return null;

    outlet = nested;
    root = nextRoot;
  }

  return plan;
}

function peekChildOutlet(viewRoot: HTMLElement): AuraOutlet | null {
  return viewRoot.querySelector(`:scope > ${AuraOutlet.is}`) as AuraOutlet | null;
}
