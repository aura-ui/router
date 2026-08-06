/**
 * jsdom does not implement `window.scrollTo` (logs "Not implemented").
 * AuraRouter's Scroller defaults to `window` — silence the noise.
 */
window.scrollTo = () => undefined;
