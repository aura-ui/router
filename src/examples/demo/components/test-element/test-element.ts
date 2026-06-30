export class TestElement extends HTMLElement {
  static is = 'test-element';

  protected connectedCallback() {
    const data = JSON.parse(this.getAttribute('aura-data') || '{}');
    const id = data.params?.id ?? '?';
    const names: Record<string, string> = {
      '1': 'Алекс',
      '2': 'Мария',
      '3': 'Иван',
      '4': 'Ольга',
    };
    const name = names[id] ?? `Гость ${id}`;

    this.innerHTML = `
      <article class="scene scene--row">
        <div class="user-card__avatar" aria-hidden="true">${name.charAt(0)}</div>
        <div>
          <p class="scene__eyebrow">Динамический URL</p>
          <h2 class="scene__title">${name}</h2>
          <p class="scene__text">Маршрут <code>/routing/user/${id}</code> — параметр <code>:id</code> передан в компонент через <code>aura-data</code>.</p>
          <div class="scene__links">
            <a href="/routing/user/1" data-router-link>User 1</a>
            <a href="/routing/user/2" data-router-link>User 2</a>
            <a href="/routing/user/3" data-router-link>User 3</a>
            <a href="/routing/user/4" data-router-link>User 4</a>
          </div>
        </div>
      </article>`;
  }
}
