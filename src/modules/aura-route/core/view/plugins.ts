import type { ViewRenderPlugin } from './ports';

const LOADING_CLASS = 'aura-route-loading';

/** Body class while content resolves — no extra outlet mount. */
export function loadingBodyClass(className = LOADING_CLASS): ViewRenderPlugin {
  return {
    onLoadingStart() {
      document.body.classList.add(className);
    },
    onLoadingEnd() {
      document.body.classList.remove(className);
    },
  };
}

/** Dispatches `aura-route-loading` when route declares `loadingTemplate`. */
export function loadingEvent(target: EventTarget): ViewRenderPlugin {
  return {
    onLoadingStart(pass) {
      target.dispatchEvent(new CustomEvent('aura-route-loading', {
        detail: { pass },
        bubbles: true,
      }));
    },
  };
}
