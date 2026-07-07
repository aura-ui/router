import { parseString, toKebabCase } from '../misc/format';

type AttrParser<T> = (attr: string | null) => T | null;

const defaultParser = parseString as AttrParser<any>;

const cachesByProto = new WeakMap<object, WeakMap<HTMLElement, Map<string, unknown>>>();

function cacheOf(proto: object, el: HTMLElement, create = false): Map<string, unknown> | undefined {
  let byEl = cachesByProto.get(proto);
  if (!byEl) {
    if (!create) return;
    byEl = new WeakMap();
    cachesByProto.set(proto, byEl);
  }

  let map = byEl.get(el);
  if (!map) {
    if (!create) return;
    map = new Map();
    byEl.set(el, map);
  }

  return map;
}

const getInherited = (el: HTMLElement, name: string): string | null =>
  el.parentElement?.closest(`[${name}]`)?.getAttribute(name) ?? null;

/** HTML attribute mapping configuration */
type AttrConfig<T = string> = {
  /** HTML attribute name. Uses kebab-cased variable name by default */
  name?: string;
  /** Create getter only */
  readonly?: boolean;
  /** Specifies the attribute inheritance behavior. */
  inherit?: boolean | string;
  /** Use data-* attribute */
  dataAttr?: boolean;
  /** Default property value. Used if no attribute is present on the element. */
  defaultValue?: T;
  /** Parser from attribute value */
  parser?: AttrParser<T>;
  /** First read resolves DOM; later reads use cache until {@link attr.clear}. */
  cached?: boolean;
  /** With inherit: local `attr=""` blocks ancestor lookup when true. */
  allowEmpty?: boolean;
};

/**
 * `@attr` decorator: maps a property to an HTML attribute.
 *
 * Use {@link attr.clear} to invalidate cached attrs on an element instance.
 */
export const attr = <T = string>(config: AttrConfig<T> = {}) => {
  return (proto: Element, propName: string): void => {

    const name = (config.dataAttr ? 'data-' : '') + toKebabCase(config.name || propName);
    const inheritName = typeof config.inherit === 'string' ? config.inherit : name;
    const inherit = !!config.inherit;
    const allowEmpty = !!config.allowEmpty;
    const hasDefault = 'defaultValue' in config;
    const parser = config.parser || defaultParser;

    const read = (el: HTMLElement): T | null => {
      let raw: string | null;
      if (!inherit) raw = el.getAttribute(name);
      else if (allowEmpty && el.hasAttribute(name)) raw = el.getAttribute(name);
      else raw = el.getAttribute(name) || getInherited(el, inheritName);

      const input = (raw === null && hasDefault) ? config.defaultValue : raw;
      return parser(input as string | null) as T | null;
    };

    const write = (el: HTMLElement, val: T): void => {
      val == null ? el.removeAttribute(name) : el.setAttribute(name, String(val));
    };

    if (config.cached) {
      function get(this: HTMLElement): T | null {
        const map = cacheOf(proto, this);
        if (map?.has(propName)) return map.get(propName) as T | null;

        const val = read(this);
        cacheOf(proto, this, true)!.set(propName, val);
        return val;
      }

      function set(this: HTMLElement, val: T): void {
        write(this, val);
        cacheOf(proto, this, true)!.set(propName, read(this));
      }

      Object.defineProperty(proto, propName, config.readonly ? { get } : { get, set });
      return;
    }

    function get(this: HTMLElement): T | null {
      return read(this);
    }

    function set(this: HTMLElement, val: T): void {
      write(this, val);
    }

    Object.defineProperty(proto, propName, config.readonly ? { get } : { get, set });
  };
};

function clearAttr(target: object, prop?: PropertyKey | PropertyKey[]): void {
  if (typeof target === 'function') return;

  const el = target as HTMLElement;
  const proto = Object.getPrototypeOf(target);

  if (prop === undefined) {
    cachesByProto.get(proto)?.delete(el);
    return;
  }

  if (Array.isArray(prop)) return prop.forEach((p) => attr.clear(target, p));

  cacheOf(proto, el)?.delete(String(prop));
}

/**
 * Clears cached attr values on an element instance; next read re-resolves from DOM.
 *
 * @param target - Element instance (not the class constructor).
 * @param prop - Optional property name, or an array of names. Omit to clear all cached attrs.
 */
attr.clear = clearAttr;
