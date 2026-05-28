export class TestElement extends HTMLElement {
  static is = 'test-element'

  protected connectedCallback() {
    this.innerHTML = 'test element'
  }
}
