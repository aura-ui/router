import { toKebabCase } from '../misc/format'

/** HTML attribute mapping configuration */
type BoolAttrConfig = {
  /** HTML attribute name. Uses kebab-cased variable name by default */
  name?: string;
  /** Create getter only */
  readonly?: boolean;
  /** Use data-* attribute */
  dataAttr?: boolean;
};

/**
 * `@attr` decorator: maps a property to an HTML attribute
 */
export const boolAttr = (config: BoolAttrConfig = {}) => {
  return (proto: Element, propName: string): void => {

    const attrName = config.dataAttr ? 'data-' : '' + toKebabCase(config.name || propName)

    function get(this: HTMLElement): boolean {
      return this.hasAttribute(attrName)
    }

    function set(this: HTMLElement, value: unknown): void {
      this.toggleAttribute(attrName, !!value)
    }

    Object.defineProperty(proto, propName, config.readonly ? { get } : { get, set })
  }
}
