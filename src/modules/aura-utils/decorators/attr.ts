import { parseString, toKebabCase } from '../misc/format';

type AttrParser<T> = (attr: T | null) => T | T[] | null;

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
    const inheritAttrName = typeof config.inherit === 'string' ? config.inherit : attrName;
    let cachedValue: T;

    function get(this: HTMLElement): T | null {
      if (config.cached && cachedValue) return cachedValue;

      let value: string | null;
      if (!config.inherit) {
        value = this.getAttribute(attrName);
      } else if ((config.allowEmpty) && this.hasAttribute(attrName)) {
        value = this.getAttribute(attrName);
      } else {
        value = this.getAttribute(attrName) || getInheritedAttr(this, inheritAttrName);
      }

      let result = (value === null && 'defaultValue' in config)
        ? config.defaultValue
        : value;

      result = (config.parser || parseString as AttrParser<any>)(result as T)

      if (config.cached) {
        cachedValue = result as T;
      }

      return result as T | null;
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
