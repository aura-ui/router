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

/**
 * Extracts a DOM subtree from an HTML string as a markup string.
 *
 * Parses `html` with `DOMParser` (suitable for full documents and partials).
 *
 * @param html - Raw HTML response (e.g. from a `url` loader fetch).
 * @param selector - CSS selector for the element to extract.
 * @returns `outerHTML` of the first matching element, or `null` when nothing matches.
 */
export function extractHtmlFragment(html: string, selector: string): string | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.querySelector(selector)?.outerHTML ?? null;
}

/**
 * Applies route `extract` to an HTML string.
 * On miss, warns and returns `html` unchanged.
 */
export function applyHtmlExtract(html: string, extract: string | null | undefined): string {
  if (!extract) return html;
  const fragment = extractHtmlFragment(html, extract);
  if (fragment != null) return fragment;
  console.warn(`Nothing found for extract selector "${extract}" — using full HTML`);
  return html;
}
