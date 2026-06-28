import { parseString, toKebabCase } from '../misc/format';

type AttrParser<T> = (attr: string | null) => T | null;
type AttrCacheEntry<T> = {
  raw: string | null;
  value: T | null;
};

const defaultParser = parseString as AttrParser<any>;

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
  /** Specifies if attribute should be cached */
  cached?: boolean;
  /**
   * With `inherit`: `hasAttribute` on this element wins over ancestor lookup,
   * including empty string (`attr=""`). Use for explicit opt-out (e.g. `transition=""`).
   */
  allowEmpty?: boolean;
};

/** Inherited attr: first match on ancestors only (not `el`). */
const getInheritedAttr = ($el: HTMLElement, attrName: string): string | null =>
  $el.parentElement?.closest(`[${attrName}]`)?.getAttribute(attrName) ?? null;

/**
 * `@attr` decorator: maps a property to an HTML attribute
 */
export const attr = <T = string>(config: AttrConfig<T> = {}) => {
  return (proto: Element, propName: string): void => {

    const attrName = (config.dataAttr ? 'data-' : '') + toKebabCase(config.name || propName);
    const inheritedAttrName = typeof config.inherit === 'string' ? config.inherit : attrName;
    const cache = config.cached ? new WeakMap<HTMLElement, AttrCacheEntry<T>>() : null;
    const parse = config.parser || defaultParser;

    function get(this: HTMLElement): T | null {
      const rawValue = resolveAttrValue(this, attrName, inheritedAttrName, config);
      const cached = cache?.get(this);
      if (cached && cached.raw === rawValue) return cached.value;

      const valueToParse = (rawValue === null && hasDefaultValue(config))
        ? config.defaultValue
        : rawValue;

      const parsedValue = parse(valueToParse as string | null) as T | null;

      if (cache) {
        cache.set(this, { raw: rawValue, value: parsedValue });
      }

      return parsedValue;
    }

    function set(this: HTMLElement, value: T): void {
      if (value == null) {
        this.removeAttribute(attrName);
      } else {
        this.setAttribute(attrName, String(value));
      }
    }

    Object.defineProperty(proto, propName, config.readonly ? { get } : { get, set });
  };
};

function hasDefaultValue<T>(config: AttrConfig<T>): boolean {
  return 'defaultValue' in config;
}

function resolveAttrValue<T>(
  element: HTMLElement,
  attrName: string,
  inheritedAttrName: string,
  config: AttrConfig<T>,
): string | null {
  if (!config.inherit) {
    return element.getAttribute(attrName);
  }

  if (config.allowEmpty && element.hasAttribute(attrName)) {
    return element.getAttribute(attrName);
  }

  return element.getAttribute(attrName) || getInheritedAttr(element, inheritedAttrName);
}
