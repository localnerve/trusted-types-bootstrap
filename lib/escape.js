/**
 * Industry-standard HTML escaping - single source of truth for this package.
 * 
 * MUST stay byte-identical to @localnerve/web-component-build's escapeHtml
 * (the component-level, build-time-inlined copy). The shared test vector in
 * __tests__/escape.spec.js guards against drift between the two.
 * 
 * Copyright (c) 2026 Alex Grant (@localnerve), LocalNerve LLC
 * Copyrights licensed under the BSD License. See the accompanying LICENSE file for terms.
 */

/**
 * Escape a value for safe interpolation into HTML markup (text or attribute).
 *
 * Applies the industry-standard escape of all six characters that can break
 * out of a text or attribute context: & < > " ' and backtick. Escaping quotes
 * and the backtick (not just &lt;/&gt;) is what makes the result safe to reuse
 * inside an attribute value, not only element content. Output is byte-identical
 * to he.escape() for all inputs where he does not throw (null/undefined).
 *
 * @param {Any} input - The value to escape
 * @returns {String} The escaped string. null/undefined yield ''.
 */
export function escapeHtml (input) {
  if (input === null || typeof input === 'undefined') return '';
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/`/g, '&#x60;');
}
