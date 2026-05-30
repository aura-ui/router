/**
 * Dispatches custom event.
 */
export const dispatchCustomEvent = (el: EventTarget, eventName: string, eventInit?: CustomEventInit): boolean => {
  if (!eventName || !eventName.trim()) return true;

  const init = Object.assign({
    bubbles: true,
    composed: true,
    cancelable: true,
  }, eventInit || {});
  return el.dispatchEvent(new CustomEvent(eventName, init));
};