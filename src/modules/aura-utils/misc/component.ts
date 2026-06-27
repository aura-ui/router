export type Registerable = CustomElementConstructor & { readonly is: string };

/** Makes components registration inside customElements */
export const registerComponent = (Component: Registerable): void => {
  const tagName = Component.is;
  const constructor = customElements.get(tagName);
  if (
    constructor &&
    (constructor !== Component || (constructor as Registerable).is !== tagName)
  ) {
    throw new DOMException('Element tag already occupied or inconsistent', 'NotSupportedError');
  }
  if (constructor) return;
  customElements.define(tagName, Component);
};
