import { parseString, toKebabCase } from '../misc/format';

type AttrParser<T> = (attr: string | null) => T | null;

const defaultParser = parseString as AttrParser<any>;

/**
 * Class prototype → element instance → map of cached property values.
 * Only `cached: true` attrs write into this store.
 */
const instancePropCachesByProto = new WeakMap<object, WeakMap<HTMLElement, Map<string, unknown>>>();

function getInstancePropCache(proto: object, element: HTMLElement): Map<string, unknown> | undefined {
  return instancePropCachesByProto.get(proto)?.get(element);
}

function ensureInstancePropCache(proto: object, element: HTMLElement): Map<string, unknown> {
  let elementCaches = instancePropCachesByProto.get(proto);
  if (!elementCaches) {
    elementCaches = new WeakMap();
    instancePropCachesByProto.set(proto, elementCaches);
  }

  let propCache = elementCaches.get(element);
  if (!propCache) {
    propCache = new Map();
    elementCaches.set(element, propCache);
  }

  return propCache;
}

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
  /** Default property value. Used if no attribute is present on the element. Empty string by default. */
  defaultValue?: T;
  /** Parser from attribute value */
  parser?: AttrParser<T>;
  /**
   * Read and parse the attribute once per element instance; later reads return the cached value
   * without touching the DOM. Use {@link attr.clear} to drop the cache and re-read from the DOM.
   */
  cached?: boolean;
  /**
   * With `inherit`: `hasAttribute` on this element wins over ancestor lookup,
   * including empty string (`attr=""`). Use for explicit opt-out (e.g. `transition=""`).
   */
  allowEmpty?: boolean;
};

/** Reads an attribute from the nearest ancestor that defines it (not from `element`). */
function readAncestorAttrValue(element: HTMLElement, attrName: string): string | null {
  return element.parentElement?.closest(`[${attrName}]`)?.getAttribute(attrName) ?? null;
}

/** Resolves the raw DOM string for a property, with optional ancestor inheritance. */
function resolveAttrFromDom(
  element: HTMLElement,
  attrName: string,
  ancestorAttrName: string,
  inherit: boolean,
  allowEmpty: boolean,
): string | null {
  if (!inherit) {
    return element.getAttribute(attrName);
  }

  if (allowEmpty && element.hasAttribute(attrName)) {
    return element.getAttribute(attrName);
  }

  return element.getAttribute(attrName) || readAncestorAttrValue(element, ancestorAttrName);
}

/** Applies default-value fallback and parser to a raw DOM string. */
function parseAttrValue<T>(
  rawValue: string | null,
  hasDefault: boolean,
  defaultValue: T | undefined,
  parser: AttrParser<T>,
): T | null {
  const input = (rawValue === null && hasDefault) ? defaultValue : rawValue;
  return parser(input as string | null) as T | null;
}

/**
 * `@attr` decorator: maps a property to an HTML attribute
 */
export const attr = <T = string>(config: AttrConfig<T> = {}) => {
  return (proto: Element, propName: string): void => {

    const attrName = (config.dataAttr ? 'data-' : '') + toKebabCase(config.name || propName);
    const ancestorAttrName = typeof config.inherit === 'string' ? config.inherit : attrName;
    const inherit = !!config.inherit;
    const allowEmpty = !!config.allowEmpty;
    const hasDefault = 'defaultValue' in config;
    const defaultValue = config.defaultValue;
    const parser = config.parser || defaultParser;

    const readProperty = (element: HTMLElement): T | null =>
      parseAttrValue(
        resolveAttrFromDom(element, attrName, ancestorAttrName, inherit, allowEmpty),
        hasDefault,
        defaultValue,
        parser,
      );

    const writeProperty = (element: HTMLElement, value: T): void => {
      if (value == null) {
        element.removeAttribute(attrName);
      } else {
        element.setAttribute(attrName, String(value));
      }
    };

    if (config.cached) {
      function get(this: HTMLElement): T | null {
        const propCache = getInstancePropCache(proto, this);
        if (propCache?.has(propName)) {
          return propCache.get(propName) as T | null;
        }

        const value = readProperty(this);
        ensureInstancePropCache(proto, this).set(propName, value);
        return value;
      }

      function set(this: HTMLElement, value: T): void {
        writeProperty(this, value);
        ensureInstancePropCache(proto, this).set(propName, readProperty(this));
      }

      Object.defineProperty(proto, propName, config.readonly ? { get } : { get, set });
      return;
    }

    function get(this: HTMLElement): T | null {
      return readProperty(this);
    }

    function set(this: HTMLElement, value: T): void {
      writeProperty(this, value);
    }

    Object.defineProperty(proto, propName, config.readonly ? { get } : { get, set });
  };
};

function clearAttr(target: object, property: PropertyKey | PropertyKey[]): void {
  if (Array.isArray(property)) {
    property.forEach((prop) => attr.clear(target, prop));
    return;
  }

  if (typeof target === 'function') return;

  const proto = Object.getPrototypeOf(target);
  getInstancePropCache(proto, target as HTMLElement)?.delete(String(property));
}

/**
 * Drops the cached value for a `cached: true` attribute on one element instance.
 * The next read re-resolves the attribute from the DOM.
 *
 * @param target - Element instance (not the class constructor).
 * @param property - One property name, or an array of names.
 */
attr.clear = clearAttr;

function clearAllAttrs(target: object): void {
  if (typeof target === 'function') return;

  const proto = Object.getPrototypeOf(target);
  instancePropCachesByProto.get(proto)?.delete(target as HTMLElement);
}

/**
 * Drops every cached `cached: true` attribute on one element instance.
 */
attr.clearAll = clearAllAttrs;

function hasCachedAttr(target: object, property: PropertyKey): boolean {
  const proto = Object.getPrototypeOf(target);
  return getInstancePropCache(proto, target as HTMLElement)?.has(String(property)) ?? false;
}

/**
 * Reports whether a `cached: true` attribute has a stored value on this element instance.
 */
attr.has = hasCachedAttr;
