export class TestElement extends HTMLElement {
  static is = 'test-element'

  protected connectedCallback() {
    const data = JSON.parse(this.getAttribute('aura-data') || '');
    console.log(data)
    this.innerHTML = `
    <input type="text"/> 
    Welcome, user - ${data.params?.id}`
  }
}
