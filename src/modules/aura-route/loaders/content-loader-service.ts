export class ContentLoaderService {
  public readonly isSSR: boolean;

  constructor(isSSR: boolean) {
    this.isSSR = isSSR;
  }

  async loadFromUrl(url: string, signal?: AbortSignal): Promise<string> {
    if (this.isSSR) {
      // Логика для SSR: используем node-fetch или аналогичный
      return await this.ssrFetch(url);
    } else {
      // Клиентская логика: обычный fetch
      const response = await fetch(url, { signal });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.text();
    }
  }

  private async ssrFetch(url: string): Promise<string> {
    // Реализация для SSR-окружения
    throw new Error('SSR fetch not implemented');
  }

  sanitizeHtml(html: string): string {
    // Реализация санитизации HTML
    return html; // упрощённо
  }

  createComponentHtml(tagName: string, options: any): string {
    const dataAttr = JSON.stringify(options);
    return `<${tagName} aura-data='${dataAttr}'></${tagName}>`;
  }
}
