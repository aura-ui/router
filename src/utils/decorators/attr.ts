import { toKebabCase } from '../misc/format'

/** HTML attribute mapping configuration */
type AttrConfig<T = string> = {
  /** HTML attribute name. Uses kebab-cased variable name by default */
  name?: string;
  /** Create getter only */
  readonly?: boolean;
  /** Use data-* attribute */
  dataAttr?: boolean;
  /** Default property value. Used if no attribute is present on the element. Empty string by default. */
  defaultValue?: T;
};

/**
 * `@attr` decorator: maps a property to an HTML attribute
 */
export const attr = <T = string>(config: AttrConfig<T> = {}) => {
  return (proto: Element, propName: string): void => {

    const attrName = config.dataAttr ? 'data-' : '' + toKebabCase(config.name || propName)

    function get(this: HTMLElement): T | null {
      const value = this.getAttribute(attrName) as T | null
      if (value === null && 'defaultValue' in config) return config.defaultValue as T
      return value
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
