import { escapeHtml, getTemplate } from '../../../aura-utils/misc';
import type { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import type { AuraRouteInterface } from '../types';
import type { ViewKind, ViewPayload } from './types';

const EMPTY_CONTENT = '<div>No content to display</div>';

export function emptyContent(): ViewPayload {
  return EMPTY_CONTENT;
}

export function resolveError(route: AuraRouteInterface, error: unknown): ViewPayload {
  if (route.errorTemplate) {
    try {
      return getTemplate(route.errorTemplate);
    } catch (templateError) {
      console.warn(`Failed to render errorTemplate for route "${route.path}":`, templateError);
    }
  }

  console.error(`Error rendering route (path: ${route.path}):`, error);
  const message = escapeHtml(error instanceof Error ? error.message : 'Error loading content');
  const stack = escapeHtml(error instanceof Error ? error.stack ?? '' : '');

  return `<div class="aura-route-error">
    <h2>Content Loading Error</h2>
    <p>${message}</p>
    ${stack ? `<pre class="error-stack">${stack}</pre>` : ''}
  </div>`;
}

export function warnMissingLayoutOutlet(
  route: AuraRouteInterface,
  viewKind: ViewKind,
  nestedOutlet: AuraOutlet | null,
): void {
  if (viewKind !== 'layout' || nestedOutlet) return;

  console.warn(
    `AuraRoute layout "${route.layout}" (path: ${route.path}) has no <aura-outlet>`,
  );
}

