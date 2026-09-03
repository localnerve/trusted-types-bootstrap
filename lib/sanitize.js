/**
 * Opt-in DOMPurify-backed sanitizer policy.
 * 
 * Only this module imports dompurify (~11 KB gzip minified); apps that never
 * import the `/sanitize` sub-path do not pay for it (separate entry point,
 * tree-shakeable). Use this tier to render untrusted rich content (user posts,
 * imported documents) - never plain escaping for rich markup.
 * 
 * TT integration: sanitize() is called inside this policy's own createHTML with
 * TRUSTED_TYPES_POLICY: null so DOMPurify does NOT create its internal
 * `dompurify` policy (which would break a computed CSP allowlist).
 * 
 * Copyright (c) 2026 Alex Grant (@localnerve), LocalNerve LLC
 * Copyrights licensed under the BSD License. See the accompanying LICENSE file for terms.
 */

import DOMPurify from 'dompurify';

/**
 * Create a named Trusted Types policy that sanitizes input with DOMPurify.
 * 
 * The policy name must appear in the CSP `trusted-types` allowlist (detected
 * by @localnerve/trusted-types-rules as usual - it is declared at this call site).
 * 
 * @param {String} name - The policy name (CSP-allowlisted).
 * @param {Object} [config] - DOMPurify configuration passthrough, e.g. {USE_PROFILES: {html: true}, ALLOWED_TAGS: ['b', 'i']}. TRUSTED_TYPES_POLICY is always forced to null; any value passed for it is ignored.
 * @returns {TrustedTypePolicy|null} The policy when Trusted Types is available, otherwise null (callers should fall back to DOMPurify.sanitize directly, or a passthrough string).
 */
export function createSanitizerPolicy (name, config = {}) {
  const w = typeof window !== 'undefined' ? window : null;
  if (!w || !('trustedTypes' in w)) return null;

  const dompurify = DOMPurify(w); // bind to the app's window

  return w.trustedTypes.createPolicy(name, {
    createHTML: input => dompurify.sanitize(String(input), {
      ...config,
      TRUSTED_TYPES_POLICY: null
    })
  });
}

/**
 * DOMPurify instance bound to the current window. Exposed so callers can also
 * sanitize without a policy (e.g. in dev builds without enforcement).
 */
export const purify = typeof window !== 'undefined' ? DOMPurify(window) : null;
