/** @jest-environment jsdom */

import { applyDocumentMeta } from '../core/document-meta';
import { DocumentTitlePreview } from '../core/document-meta-optimistic';

import { matchedRoute, resetDocumentMetaDom } from './_helpers/matched-route';

describe('DocumentTitlePreview', () => {
  let titlePreview: DocumentTitlePreview;

  beforeEach(() => {
    titlePreview = new DocumentTitlePreview();
  });

  afterEach(resetDocumentMetaDom);

  it('previews title and rolls back on matching cancel id', () => {
    document.title = 'Shell';
    titlePreview.preview(10, matchedRoute('/a', { metaTitle: 'A' }));
    expect(document.title).toBe('A');

    titlePreview.cancel(10);
    expect(document.title).toBe('Shell');
  });

  it('replaces preview for the same navigation id', () => {
    document.title = 'Shell';
    titlePreview.preview(10, matchedRoute('/a', { metaTitle: 'A' }));
    titlePreview.preview(10, matchedRoute('/b', { metaTitle: 'B' }));
    expect(document.title).toBe('B');

    titlePreview.cancel(10);
    expect(document.title).toBe('Shell');
  });

  it('does not cancel preview for a different navigation id', () => {
    document.title = 'Shell';
    titlePreview.preview(10, matchedRoute('/a', { metaTitle: 'A' }));
    titlePreview.cancel(11);
    expect(document.title).toBe('A');
  });

  it('ignores preview when route does not resolve explicit title', () => {
    document.title = 'Shell';
    titlePreview.preview(10, matchedRoute('/a'));
    expect(document.title).toBe('Shell');
  });

  it('restores stable title after overlapping previews are cancelled', () => {
    document.title = 'Shell';
    titlePreview.preview(1, matchedRoute('/slow', { metaTitle: 'Slow' }));
    titlePreview.preview(2, matchedRoute('/about', { metaTitle: 'About' }));
    expect(document.title).toBe('About');

    titlePreview.cancel(2);
    expect(document.title).toBe('Slow');

    titlePreview.cancel(1);
    expect(document.title).toBe('Shell');
  });

  describe('with applyDocumentMeta', () => {
    it('keeps boot title when preview runs before the first apply', () => {
      document.title = 'Shell';
      const to = matchedRoute('/a', { metaTitle: 'A' });
      titlePreview.preview(1, to);
      applyDocumentMeta(to);
      titlePreview.commit();
      applyDocumentMeta(matchedRoute('/b'));
      expect(document.title).toBe('Shell');
    });

    it('keeps title after commit clears preview state', () => {
      document.title = 'Shell';
      const to = matchedRoute('/a', { metaTitle: 'A' });
      titlePreview.preview(10, to);
      applyDocumentMeta(to);
      titlePreview.commit();
      titlePreview.cancel(10);
      expect(document.title).toBe('A');
    });

    it('does not restore shell when a loser is cancelled after the winner commits', () => {
      document.title = 'Shell';
      const winner = matchedRoute('/about', { metaTitle: 'About' });
      titlePreview.preview(1, matchedRoute('/slow', { metaTitle: 'Slow' }));
      titlePreview.preview(2, winner);
      applyDocumentMeta(winner);
      titlePreview.commit();
      titlePreview.cancel(1);
      expect(document.title).toBe('About');
    });
  });
});
