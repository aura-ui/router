import hljs from 'highlight.js/lib/core';
import xml from 'highlight.js/lib/languages/xml';
import 'highlight.js/styles/atom-one-dark.min.css';

hljs.registerLanguage('html', xml);

export function highlightDemoCode(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('code[data-code-from]').forEach((codeEl) => {
    if (codeEl.dataset.highlighted === 'true') return;

    const templateId = codeEl.dataset.codeFrom;
    if (!templateId) return;

    const tpl = root.querySelector(`#${CSS.escape(templateId)}`) as HTMLTemplateElement | null;
    if (!tpl) return;

    const source = tpl.innerHTML.trim().replace(/^\n/, '');
    codeEl.innerHTML = hljs.highlight(source, { language: 'html' }).value;
    codeEl.classList.add('hljs');
    codeEl.dataset.highlighted = 'true';
  });
}
