const USER_NAMES: Record<string, string> = {
  '1': 'Алекс',
  '2': 'Мария',
  '3': 'Иван',
  '4': 'Ольга',
};

let mountSeq = 0;

export class TestElement extends HTMLElement {
  static is = 'test-element';

  private mountIndex = 0;
  private updateCount = 0;

  protected connectedCallback(): void {
    mountSeq++;
    this.mountIndex = mountSeq;
    this.addEventListener('user-sync', this.onUserSync as EventListener);

    const data = JSON.parse(this.getAttribute('aura-data') || '{}');
    this.render(data.params?.id ?? '?');
  }

  protected disconnectedCallback(): void {
    this.removeEventListener('user-sync', this.onUserSync as EventListener);
  }

  private onUserSync = (event: Event): void => {
    const { id } = (event as CustomEvent<{ id: string }>).detail;
    this.updateCount++;
    this.render(id, { flash: true });
  };

  private render(id: string, opts?: { flash?: boolean }): void {
    const name = USER_NAMES[id] ?? `Гость ${id}`;
    const callout =
      this.updateCount > 0
        ? `<div class="scene__callout scene__callout--ok${opts?.flash ? ' is-flash' : ''}">
            Фаза <code>update</code>: view не перемонтировался (mount #${this.mountIndex}),
            хук синхронизировал UI — обновлений: ${this.updateCount}.
          </div>`
        : `<div class="scene__callout">
            Первый визит — полный pipeline (mount #${this.mountIndex}).
            Переключите User 1 ↔ User 2 и смотрите журнал «Конфиг».
          </div>`;

    this.innerHTML = `
      <article class="scene scene--row">
        <div class="user-card__avatar" aria-hidden="true">${name.charAt(0)}</div>
        <div>
          <p class="scene__eyebrow">update="user-sync" · :id</p>
          <h2 class="scene__title">${name}</h2>
          <p class="scene__text">
            Nested-маршрут <code>:id</code> под <code>/routing/users</code> →
            <code>/routing/users/${id}</code>. При смене <code>1</code> → <code>2</code>
            layout не размонтируется, срабатывает только фаза <code>update</code>.
          </p>
          <dl class="scene__facts">
            <div><dt>Mount</dt><dd>#${this.mountIndex}</dd></div>
            <div><dt>Updates</dt><dd>${this.updateCount}</dd></div>
          </dl>
          ${callout}
          <div class="scene__links">
            <a href="/routing/users/1" data-router-link>User 1</a>
            <a href="/routing/users/2" data-router-link>User 2</a>
            <a href="/routing/users/3" data-router-link>User 3</a>
            <a href="/routing/users/4" data-router-link>User 4</a>
            <a href="/routing/users" data-router-link>← Список</a>
          </div>
        </div>
      </article>`;

    if (opts?.flash) {
      requestAnimationFrame(() => {
        this.querySelector('.scene__callout')?.classList.remove('is-flash');
      });
    }
  }
}
