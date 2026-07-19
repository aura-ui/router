/**
 * Clones the content of a `<template>` element by id from the live document.
 *
 * @param id - `id` attribute of the `<template>` element.
 * @returns Cloned `DocumentFragment` ready for DOM insertion.
 * @throws When the element is missing or is not a `<template>`.
 */
export const getTemplate = (id: string) => {
  const template = document.getElementById(id) as HTMLTemplateElement;
  if (!template) {
    throw new Error(`Template with id "${id}" not found`);
  }
  if (!(template instanceof HTMLTemplateElement)) {
    throw new Error(`Element with id "${id}" is not a template`);
  }
  return template?.content.cloneNode(true) as DocumentFragment;
};

/** `#id` only — no combinators, classes, or pseudo-elements. */
const SIMPLE_ID_SELECTOR = /^#[^.#[\]:>,+~\s]+$/;

/**
 * Extracts a DOM subtree from an HTML string as a markup string.
 *
 * Parses `html` with `DOMParser` (suitable for full documents and partials).
 * Simple `#id` selectors use `getElementById`; all other selectors use `querySelector`.
 *
 * @param html - Raw HTML response (e.g. from a `url` loader fetch).
 * @param selector - CSS selector for the root element whose children are injected.
 * @returns `innerHTML` of the first matching element.
 * @throws When no element matches `selector`.
 */
export function extractHtmlFragment(html: string, selector: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const node = SIMPLE_ID_SELECTOR.test(selector)
    ? doc.getElementById(selector.slice(1))
    : doc.querySelector(selector);

  if (!node) {
    throw new Error(`No element matches selector "${selector}"`);
  }

  return node.innerHTML;
}
