/** Bubbling cancelable mouse init — default for anchor interaction tests. */
export const BUBBLING_MOUSE = { bubbles: true, cancelable: true } as const;

/** Mount `html` into `document.body` and dispatch a mouse event on the first `<a>`. */
export function dispatchAnchorMouseEvent(
  type: string,
  html: string,
  init: MouseEventInit = {},
): MouseEvent {
  document.body.innerHTML = html;
  const event = new MouseEvent(type, { ...BUBBLING_MOUSE, ...init });
  document.querySelector('a')!.dispatchEvent(event);
  return event;
}

export function clickAnchor(html: string, init: MouseEventInit = {}): MouseEvent {
  return dispatchAnchorMouseEvent('click', html, init);
}
