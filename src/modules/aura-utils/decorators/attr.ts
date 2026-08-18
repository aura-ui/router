/**
 * `@attr` decorator for custom elements: maps a class property to an HTML attribute.
 *
 * - **Get** — reads `getAttribute` (or an inherited value), applies {@link AttrParser}, optional `defaultValue`.
 * - **Set** — `setAttribute` / `removeAttribute` (unless `readonly`). On writable `cached` attrs, assignment
 *   also refreshes the cache; external `setAttribute` does not.
 * - **`cached: true`** — first read resolves DOM once per element; later reads return a frozen value
 *   without touching the DOM. Ancestor / external DOM changes do not invalidate the cache;
 *   call {@link attr.clear} to re-read.
 * - **`inherit`** — when the local attribute is absent, falls back to `closest('[attr]')` on ancestors.
 *   A present local attribute wins over inheritance. Inheritable attrs handle `none`/`off`/`false` in their
 *   {@link AttrParser}.
 */

import { parseString, toKebabCase } from '../misc/format';

/** `(raw attribute string | null) → typed property value` */
export type AttrParser<T> = (attr: string | null) => T | null;

const defaultParser = parseString as AttrParser<any>;

/** Element instance → cached property values (`cached: true` only). */
const cachesByEl = new WeakMap<HTMLElement, Map<string, unknown>>();

/** Returns the per-element property cache; creates it when `create` is true. */
function cacheOf(el: HTMLElement, create = false): Map<string, unknown> | undefined {
  let map = cachesByEl.get(el);
  if (!map && create) {
    map = new Map();
    cachesByEl.set(el, map);
  }
  return map;
}

/** Reads an attribute from the nearest ancestor that defines it (not from `element`). */
const getInherited = (el: HTMLElement, name: string, host?: string): string | null =>
  el.parentElement?.closest(host ? `${host}[${name}]` : `[${name}]`)?.getAttribute(name) ?? null;

/** `@attr` decorator configuration. */
export type AttrConfig<T = string> = {
  /** HTML attribute name. Uses kebab-cased property name by default. */
  name?: string;
  /** Expose getter only (no setter). */
  readonly?: boolean;
  /**
   * Ancestor inheritance. `true` — same attribute name on the nearest matching ancestor;
   * `string` — local attribute name unchanged, ancestor lookup uses this name instead.
   * Has no effect when omitted or falsy.
   */
  inherit?: boolean | string;
  /**
   * When `inherit` is on, `closest()` looks for this host tag with the attribute
   * (`aura-route[meta-title]`). Default: any ancestor (`[name]`).
   */
  inheritFrom?: string;
  /** Prefix attribute with `data-`. */
  dataAttr?: boolean;
  /** Value when the attribute is absent on DOM (`null` raw). Does not set an initial DOM attribute. */
  defaultValue?: T;
  /** Converts the raw attribute string to the property type. Default: {@link parseString}. */
  parser?: AttrParser<T>;
  /**
   * Cache the parsed value per element after the first read (no further DOM access).
   * Invalidate with {@link attr.clear}.
   */
  cached?: boolean;
};

/**
 * Property decorator: maps a field on a custom element to an HTML attribute.
 */
export const attr = <T = string>(config: AttrConfig<T> = {}) => {
  return (proto: Element, propName: string): void => {
    const name = (config.dataAttr ? 'data-' : '') + toKebabCase(config.name || propName);
    const inheritName = typeof config.inherit === 'string' ? config.inherit : name;
    const inherit = !!config.inherit;
    const inheritFrom = config.inheritFrom;
    const hasDefault = 'defaultValue' in config;
    const parser = config.parser || defaultParser;

    const readAttr = (el: HTMLElement): T | null => {
      const raw =
        !inherit || el.hasAttribute(name)
          ? el.getAttribute(name)
          : getInherited(el, inheritName, inheritFrom);
      const input = raw === null && hasDefault ? config.defaultValue : raw;
      return parser(input as string | null) as T | null;
    };

    const writeAttr = (el: HTMLElement, val: T): void => {
      val == null ? el.removeAttribute(name) : el.setAttribute(name, String(val));
    };

    let get: (this: HTMLElement) => T | null;
    let set: (this: HTMLElement, val: T) => void;

    if (config.cached) {
      get = function (this: HTMLElement): T | null {
        let map = cachesByEl.get(this);
        if (map?.has(propName)) return map.get(propName) as T | null;

        const val = readAttr(this);
        if (!map) {
          map = new Map();
          cachesByEl.set(this, map);
        }
        map.set(propName, val);
        return val;
      };
      set = function (this: HTMLElement, val: T): void {
        writeAttr(this, val);
        cacheOf(this, true)!.set(propName, readAttr(this));
      };
    } else {
      get = function (this: HTMLElement): T | null {
        return readAttr(this);
      };
      set = function (this: HTMLElement, val: T): void {
        writeAttr(this, val);
      };
    }

    Object.defineProperty(proto, propName, config.readonly ? { get } : { get, set });
  };
};

function clearAttrCache(target: object, prop?: PropertyKey | PropertyKey[]): void {
  if (Array.isArray(prop)) return prop.forEach((p) => attr.clear(target, p));
  if (typeof target === 'function') return;

  const el = target as HTMLElement;
  if (prop === undefined) {
    cachesByEl.delete(el);
    return;
  }

  cacheOf(el)?.delete(String(prop));
}

/** Invalidates cached `@attr({ cached: true })` values on an element instance. */
attr.clear = clearAttrCache;
