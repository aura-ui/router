import { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import { AuraRoutingEngine } from '../aura-routing-engine';
import { resolveDocumentHrefParts } from '../link-active';
import type { MatchedRouteInfo } from '../match/url-matcher';

type HydrateStep = {
  entry: MatchedRouteInfo;
  outlet: AuraOutlet;
  root: HTMLElement;
};

/**
 * Adopt server markup into the matched route chain without fetch/remount.
 * @returns leaf match on success; `null` → caller should run a normal init navigate.
 */
export async function hydrate(
  initialView: HTMLElement,
  engine: AuraRoutingEngine,
  rootOutlet: AuraOutlet,
): Promise<MatchedRouteInfo | null> {
  const { pathname, search, hash, href } = resolveDocumentHrefParts(location.href);
  const found = engine.matcher.matchPath(pathname, engine.getMatchableNodes());
  if (!found || found.node.route.type === 'redirect') return null;

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
  if (!plan) return null;

  for (const step of plan) {
    await step.entry.route.whenReady();
    const handle = step.outlet.adopt(step.root, step.entry.viewKey ?? step.entry.pathname);
    step.entry.route.adopt(handle, step.entry);
  }

  return leaf;
}

/** Dry-run: validate server markup for the full chain before any reuse. */
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

    const nextRoot = nested.querySelector<HTMLElement>(':scope > [data-aura-view-root]');
    if (!nextRoot) return null;

    outlet = nested;
    root = nextRoot;
  }

  return plan;
}

function peekChildOutlet(viewRoot: HTMLElement): AuraOutlet | null {
  return viewRoot.querySelector(`:scope > ${AuraOutlet.is}`) as AuraOutlet | null;
}
