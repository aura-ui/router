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

/** Parse an HTML string into a `Document` (`DOMParser`). */
export function stringToHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}
