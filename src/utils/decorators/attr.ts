import { toKebabCase } from '../misc/format'

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
  /** Specifies if attribute should be cached */
  cached?: boolean;
};

/** Gets attribute value from the closest element */
const getClosestAttr = <T = string>($el: HTMLElement, attrName: string): T | null => {
  const $closest = $el.closest(`[${attrName}]`)
  return $closest ? $closest.getAttribute(attrName) as T | null : null
}

/**
 * `@attr` decorator: maps a property to an HTML attribute
 */
export const attr = <T = string>(config: AttrConfig<T> = {}) => {
  return (proto: Element, propName: string): void => {

    const attrName = (config.dataAttr ? 'data-' : '') + toKebabCase(config.name || propName)
    const inheritAttrName = typeof config.inherit === 'string' ? config.inherit : attrName
    let cachedValue: T

    function get(this: HTMLElement): T | null {
      if (config.cached && cachedValue) return cachedValue

      const value = config.inherit ? this.getAttribute(attrName) || getClosestAttr(this, inheritAttrName) : this.getAttribute(attrName)

      const result = (value === null && 'defaultValue' in config)
        ? config.defaultValue
        : value

      if (config.cached) {
        cachedValue = result as T
      }

      return result as T | null
    }

    function set(this: HTMLElement, value: T): void {
      if (value == null) {
        this.removeAttribute(attrName)
      } else {
        this.setAttribute(attrName, String(value))
      }
    }

    Object.defineProperty(proto, propName, config.readonly ? { get } : { get, set })
  }
}
