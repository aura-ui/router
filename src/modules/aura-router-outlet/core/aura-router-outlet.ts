import { attr } from '../../aura-utils/decorators';
import { getTemplate } from '../../aura-utils/misc/dom';

export class AuraRouterOutlet extends HTMLElement {
  static is = 'aura-router-outlet';
  static observedAttributes = ['template'];

  @attr() template: string;

  connectedCallback(): void {
    this.render();
  }

  attributeChangedCallback(name: string): void {
    if (name === 'template') {
      this.render();
    }
  }

  render(): void {
    this.replaceChildren();
    if (!this.template) return;
    this.appendChild(getTemplate(this.template));
  }

  clear(): void {
    this.replaceChildren();
  }
}
