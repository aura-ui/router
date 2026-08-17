import { stringToHtml } from '../../misc/dom';

describe('stringToHtml', () => {
  it('parses an HTML string into a Document', () => {
    const doc = stringToHtml('<div id="x">hi</div>');
    expect(doc.querySelector('#x')?.textContent).toBe('hi');
  });
});
