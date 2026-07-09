import { BUILTIN_LOADER_TYPES } from '../../../../aura-route/core/attr/view-attr-parser';
import type { ContentEnvironment } from '../model/types';
import type { Loader, LoaderClass } from './loader';
import { ComponentLoader } from './loaders/component';
import { HtmlLoader } from './loaders/html';
import { IframeLoader } from './loaders/iframe';
import { ImportLoader } from './loaders/import';
import { TemplateLoader } from './loaders/template';
import { UrlLoader } from './loaders/url';

/** Same order as {@link BUILTIN_LOADER_TYPES} in view-attr-parser. */
export const BUILTIN_LOADER_CLASSES = [
  TemplateLoader,
  HtmlLoader,
  UrlLoader,
  ComponentLoader,
  ImportLoader,
  IframeLoader,
] as const satisfies readonly LoaderClass[];

export function createDefaultLoaders(env: ContentEnvironment): Loader[] {
  return BUILTIN_LOADER_CLASSES.map((LoaderClass) => new LoaderClass(env));
}

export function getBuiltinLoaderTypeIds() {
  return BUILTIN_LOADER_TYPES;
}

export {
  TemplateLoader,
  HtmlLoader,
  UrlLoader,
  ComponentLoader,
  ImportLoader,
  IframeLoader,
};
