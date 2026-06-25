import { getTemplate } from '../../../aura-utils/misc';
import type { AuraRouteInterface } from '../aura-route';
import type { ViewMountState } from './outlet-adapter';
import type { RouteViewKind } from './view-controller.types';

/** Warn when a layout template has no nested `<aura-outlet>`. */
export function warnMissingLayoutOutlet(
  route: AuraRouteInterface,
  viewKind: RouteViewKind,
  result: ViewMountState,
): void {
  if (viewKind !== 'layout' || result.nestedOutlet) return;

  console.warn(
    `AuraRoute layout "${route.layout}" (path: ${route.path}) has no <aura-outlet>`,
  );
}

/** Error template when valid; otherwise fallback HTML for {@link mountRoute}. */
export function resolveErrorViewPayload(route: AuraRouteInterface, error: unknown): Node | string {
  if (route.errorTemplate) {
    try {
      return getTemplate(route.errorTemplate);
    } catch (templateError) {
      console.warn(`Failed to render errorTemplate for route "${route.path}":`, templateError);
    }
  }

  return buildFallbackErrorHtml(route.path, error);
}

function buildFallbackErrorHtml(routePath: string, error: unknown): string {
  console.error(`Error rendering AuraRoute (path: ${routePath}):`, error);

  const message = escapeHtml(error instanceof Error ? error.message : 'Error loading content');
  const stackTrace = escapeHtml(error instanceof Error ? error.stack ?? '' : '');

  return `<div class="aura-route-error">
      <h2>Content Loading Error</h2>
      <p>${message}</p>
      ${stackTrace ? `<pre class="error-stack">${stackTrace}</pre>` : ''}
    </div>`;
}

//todo move to utils
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
