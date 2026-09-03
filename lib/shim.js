/**
 * Passthrough shim for browsers without Trusted Types support.
 * 
 * Browsers without Trusted Types ignore `require-trusted-types-for`, so plain
 * strings pass through all sinks as before; the shim exists purely so code that
 * calls `trustedTypes.createPolicy(...)` unconditionally (e.g. this package's
 * policy registration, or web components built with wcb) never throws in those
 * browsers.
 * 
 * Copyright (c) 2026 Alex Grant (@localnerve), LocalNerve LLC
 * Copyrights licensed under the BSD License. See the accompanying LICENSE file for terms.
 */

/**
 * Install a passthrough Trusted Types shim on a window.
 *
 * - `trustedTypes.createPolicy` returns plain-string pass-through hooks, so
 *   policy registration is a no-op with the same call signature as the real API.
 * - `document.createElement('script').src = x` never throws: the setter coerces
 *   to a string, guarding against a sink ever receiving an unexpected type.
 *
 * @param {Window} w - The window object to patch.
 */
export function shimTrustedTypes (w) {
  if ('trustedTypes' in w) return; // already available: nothing to shim

  const tt = {
    createPolicy: () => ({
      createHTML: s => String(s),
      createScript: s => String(s),
      createScriptURL: s => String(s)
    })
  };
  Object.defineProperty(w, 'trustedTypes', { value: tt, writable: true });

  // keep <script src> assignment from throwing on a non-string in case a sink
  // ever receives an unexpected type; everything else passes through untouched
  const origCreateElement = w.document.createElement.bind(w.document);
  w.document.createElement = (tagName, ...rest) => {
    const el = origCreateElement(tagName, ...rest);
    if (/^script$/i.test(tagName)) {
      Object.defineProperty(el, 'src', {
        set (v) {
          try {
            el.setAttribute('src', String(v));
          } catch { /* ignore */ }
        },
        get () {
          return el.getAttribute('src');
        }
      });
    }
    return el;
  };
}
