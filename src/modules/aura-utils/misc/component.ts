/** Makes components registration inside customElements */
export const registerComponent = (Component: HTMLElement & { is: string }) => {
  const tagName = Component.is
  const constructor: any = customElements.get(tagName)
  if (constructor && (constructor !== Component || constructor.is !== tagName)) {
    throw new DOMException('Element tag already occupied or inconsistent', 'NotSupportedError')
  }
  if (constructor) return
  customElements.define(tagName, Component as any as CustomElementConstructor)
}