/**
 * Page-level Trusted Types bootstrap.
 * 
 * One import + one config call replaces the per-app inline bootstrap script:
 * registers the reserved `default` policy (escaping createHTML, allowlisted
 * createScriptURL, no createScript), optional app-named policies, a passthrough
 * shim for browsers without Trusted Types, and securitypolicyviolation logging.
 * 
 * The default config replicates jam-build's inline bootstrap exactly:
 * - `enforce: 'auto'` registers policies only when a CSP meta tag is present
 *   (production builds); dev builds with no meta register nothing so plain
 *   strings pass through.
 * - Named policies are declared at the call site, so
 *   @localnerve/trusted-types-rules keeps detecting them via AST analysis for
 *   the computed CSP `trusted-types` allowlist.
 * 
 * This module must run before any other app code (e.g. as the page's first
 * inline script) so policies exist when sinks are first hit.
 * 
 * Copyright (c) 2026 Alex Grant (@localnerve), LocalNerve LLC
 * Copyrights licensed under the BSD License. See the accompanying LICENSE file for terms.
 */

import { escapeHtml } from './lib/escape.js';
import { shimTrustedTypes } from './lib/shim.js';

// window is resolved at call time (not import time) so bundlers and tests can
// control it; setWindow() overrides the global reference (used by tests).
let win = typeof globalThis !== 'undefined' ? globalThis : null;

/**
 * Override the window reference used for policy registration.
 * 
 * @param {Window} target - The window to register policies on (or null to reset to globalThis).
 */
export function setWindow (target) {
  win = target === undefined ? (typeof globalThis !== 'undefined' ? globalThis : null) : target;
}

/**
 * Hooks for the reserved `default` policy.
 * 
 * - createHTML: industry-standard 6-char escape, safe in element-content and
 *   attribute contexts.
 * - createScriptURL: only origins in scriptURLOrigins pass (default same-origin).
 * - No createScript hook: eval() / new Function() stay blocked by CSP.
 * 
 * @param {Object} [options] - Options.
 * @param {Array<String>} [options.scriptURLOrigins] - Origins allowed by createScriptURL. 'self' means same-origin (default). Extra entries are full origins, e.g. 'https://cdn.example.com'.
 * @returns {Object} The policy hooks object.
 */
export function defaultPolicyHooks (options = {}) {
  const origins = options.scriptURLOrigins || ['self'];
  return {
    createHTML: input => escapeHtml(input),
    createScriptURL: (input, opts) => {
      const url = new URL(String(input), opts?.baseUrl || win?.location?.href || 'http://localhost/');
      const allowed = origins.some(o => o === 'self' ? url.origin === win.location.origin : url.origin === o);
      if (!allowed) {
        throw new TypeError('Trusted Types: script URL rejected by default policy: ' + url);
      }
      return url.href;
    }
  };
}

/**
 * Build the hook object for a named policy from its config entry.
 * 
 * @param {Object|String} spec - Either a hooks object ({createHTML, createScriptURL, createScript}) or 'staticHtml' for the pass-through preset (author-controlled markup only; must never receive user-influenced data).
 * @returns {Object} The policy hooks object.
 */
function namedPolicyHooks (spec) {
  if (typeof spec === 'string') {
    if (spec !== 'staticHtml') {
      throw new TypeError('trusted-types-bootstrap: unknown preset "' + spec + '"');
    }
    return {
      createHTML: input => String(input),
      createScriptURL: input => new URL(String(input), win.location.href).href
    };
  }
  return spec;
}

/**
 * Bootstrap page-level Trusted Types.
 * 
 * @param {Object} [config] - Configuration.
 * @param {'auto'|Boolean} [config.enforce='auto'] - 'auto' (default): enforce only when a CSP meta tag (meta[http-equiv="Content-Security-Policy"]) is present, i.e. production builds. true/false override detection.
 * @param {Array<String>} [config.scriptURLOrigins] - Origins allowed by the default policy's createScriptURL. Default ['self'] (same-origin only).
 * @param {Object} [config.policies] - App-named policies to register alongside `default`. Keys must appear in the CSP trusted-types allowlist (computed by @localnerve/trusted-types-rules). Values: 'staticHtml' preset, a hooks object, or {hooks, helper}.
 * @param {Boolean} [config.logViolations=true] - console.warn on securitypolicyviolation events (development aid; cheap and the event never fires in healthy prod).
 * @param {Boolean} [config.shimWhenUnavailable=true] - Install the passthrough shim when the browser has no Trusted Types, so unconditional createPolicy calls never throw.
 */
export function bootstrapTrustedTypes (config = {}) {
  const {
    enforce = 'auto',
    scriptURLOrigins,
    policies = {},
    logViolations = true,
    shimWhenUnavailable = true
  } = config;

  if (!win || typeof win.document === 'undefined') {
    throw new TypeError('trusted-types-bootstrap: no window/document available');
  }

  const hasTT = 'trustedTypes' in win;
  const cspEnforced = !!win.document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  const shouldEnforce = enforce === 'auto' ? cspEnforced : Boolean(enforce);

  if (logViolations) {
    win.addEventListener('securitypolicyviolation', e => console.warn(
      'CSP violation:', e.violatedDirective, e.blockedURI || ''
    ));
  }

  if (!shouldEnforce) return false; // passthrough (dev / no CSP meta): nothing to register

  if (!hasTT) {
    // enforcing, but the browser has no Trusted Types (it ignores
    // require-trusted-types-for anyway): shim so unconditional createPolicy
    // calls elsewhere never throw and plain strings pass through as before.
    if (shimWhenUnavailable) shimTrustedTypes(win);
    return false;
  }

  win.trustedTypes.createPolicy('default', defaultPolicyHooks({ scriptURLOrigins }));

  for (const [name, value] of Object.entries(policies)) {
    const hooks = typeof value === 'object' && value !== null ? value.hooks : value;
    const helper = typeof value === 'object' && value !== null ? value.helper : null;
    win.trustedTypes.createPolicy(name, namedPolicyHooks(hooks));
    if (typeof helper === 'function') helper(win);
  }

  return true;
}

export { escapeHtml, shimTrustedTypes };
