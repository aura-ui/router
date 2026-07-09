import { escapeHtml } from '../../misc/sanitize';

describe('escapeHtml', () => {
  it('returns empty string unchanged', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('returns plain text unchanged (fast path)', () => {
    expect(escapeHtml('https://example.com/path')).toBe('https://example.com/path');
    expect(escapeHtml('users.html')).toBe('users.html');
  });

  it('escapes HTML special characters', () => {
    expect(escapeHtml('&')).toBe('&amp;');
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    expect(escapeHtml('a "b" c')).toBe('a &quot;b&quot; c');
    expect(escapeHtml("it's")).toBe('it&#39;s');
    expect(escapeHtml('<a href="x&y">')).toBe('&lt;a href=&quot;x&amp;y&quot;&gt;');
  });
});
