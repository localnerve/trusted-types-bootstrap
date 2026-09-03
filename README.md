# Trusted Types Bootstrap

> Page-level Trusted Types bootstrap for web apps — one import + one config call replaces the per-app inline bootstrap script

[![npm version](https://badge.fury.io/js/@localnerve%2Ftrusted-types-bootstrap.svg)](https://badge.fury.io/js/@localnerve%2Ftrusted-types-bootstrap)

Every web app that enforces `require-trusted-types-for 'script'` re-implements the same boilerplate inline bootstrap script: detect whether CSP is enforced, register the reserved `default` policy (escaping `createHTML`, same-origin-only `createScriptURL`, no `createScript`), optionally register app-named policies for static-markup passthrough, install a passthrough shim for browsers without Trusted Types, and log `securitypolicyviolation` events.

This package turns that boilerplate into a shared, parameterized export: **one import + one config call**, with the logic identical for any app — only the named policies and allowed script origins vary per project. The core (escape, same-origin guard, shim, orchestration) is tiny and dependency-free; the DOMPurify-backed sanitize tier is an opt-in sub-path so apps without rich content never pay for it.

  * [Why This Exists](#why-this-exists)
  * [Usage](#usage)
  * [API](#api)
  * [Sanitize Sub-Path](#sanitize-sub-path)
  * [Relationship to Other Packages](#relationship-to-other-packages)
  * [Development](#development)

## Why This Exists

1. **Stop re-creating the same ~90-line inline bootstrap in every web app** — drift risk across projects, duplicated review effort
2. **Zero cost for apps that don't need rich content** — the core escape guard + shim is a few KB and has no runtime dependencies
3. **Opt-in sanitize tier** — DOMPurify-backed "allow some safe HTML" support lives in a separate entry point (`/sanitize`) that only lands in bundles of apps that import it
4. **Compatible with computed allowlists** — named policies are declared at the call site (in your app's inline script), so [`@localnerve/trusted-types-rules`](https://github.com/localnerve/trusted-types-rules#readme) keeps detecting them via AST analysis for the CSP `trusted-types` directive — no special handling needed
5. **ESM-first, tree-shakeable** for bundlers (Rollup/webpack)

## Usage

The bootstrap must run **before any other app code** — keep it as the page's first inline script so policies exist when sinks are first hit. In production builds that meta tag is present and policies register; in dev builds (no meta tag) nothing registers and plain strings pass through, exactly like a browser without Trusted Types.

```js
// your page's FIRST inline script
import { bootstrapTrustedTypes } from '@localnerve/trusted-types-bootstrap';

bootstrapTrustedTypes({
  // 'auto' (default): enforce only when a CSP meta tag is present (prod builds).
  // true/false to override.
  enforce: 'auto',

  // Origins allowed by the default policy's createScriptURL. Default: same-origin
  // only. Extra entries are full origins, e.g. 'https://cdn.example.com'.
  scriptURLOrigins: ['self'],

  // App-named policies to register alongside `default`. Keys must appear in the
  // CSP trusted-types allowlist (computed by @localnerve/trusted-types-rules).
  policies: {
    'jam-app-static': 'staticHtml',   // pass-through createHTML: author-controlled markup only
  },

  // optional per-policy form: custom hooks and/or a helper callback invoked
  // after the policy is registered (e.g. to attach a convenience global)
  // policies: {
  //   'jam-app-static': {
  //     hooks: { createHTML: input => String(input) },
  //     helper: w => {
  //       w.trustedStaticHtml = html => w.trustedTypes.getPolicy('jam-app-static').createHTML(html);
  //     }
  //   }
  // },

  logViolations: true,          // console.warn on securitypolicyviolation (dev aid)
  shimWhenUnavailable: true     // passthrough shim for browsers without TT
});
```

The `default` policy's behavior contract:

* `createHTML` applies the industry-standard **6-char escape** (`& < > " ' \`` → `&amp; &lt; &gt; &quot; &#x27; &#x60;`) — safe in both element-content and attribute contexts, so markup sinks render inert text instead of executing injected tags
* `createScriptURL` only allows origins in `scriptURLOrigins` (default same-origin), so code can never be loaded from another origin (`<script src>`, Workers, dynamic `import()`)
* **no** `createScript` hook — `eval()` / `new Function()` remain blocked by CSP

Custom-element / web-component policies are unaffected: components register their own named policies at their own load time (via [`@localnerve/web-component-build`](https://github.com/localnerve/web-component-build#trusted-types-helpers) helpers), exactly as they do today.

## API

This library exports:

```js
export function bootstrapTrustedTypes (config): Boolean
export function defaultPolicyHooks (options): Object
export function setWindow (target)
export { escapeHtml, shimTrustedTypes }
```

### bootstrapTrustedTypes(config)
Bootstraps page-level Trusted Types. Returns `true` when policies were registered, `false` in passthrough mode (dev builds / browsers without TT). Throws if no window/document is available.

Config options:

* **enforce** {'auto'|Boolean} — default `'auto'`. `'auto'`: enforce only when a CSP meta tag (`meta[http-equiv="Content-Security-Policy"]`) is present, i.e. production builds; dev builds with no meta register nothing so plain strings pass through. `true`/`false` override detection.
* **scriptURLOrigins** {Array\<String\>} — origins allowed by the default policy's `createScriptURL`. Default `['self']` (same-origin only). Extra entries are full origins, e.g. `'https://cdn.example.com'`.
* **policies** {Object} — app-named policies to register alongside `default`. Keys must appear in the CSP `trusted-types` allowlist. Values are one of:
  * `'staticHtml'` — pass-through preset: `createHTML` returns the input unchanged (author-controlled markup only; must never receive user-influenced data), plus a same-origin `createScriptURL`
  * an **hooks object** — `{ createHTML, createScriptURL, createScript }` passed straight to `trustedTypes.createPolicy`
  * `{ hooks, helper }` — hooks as above, plus an optional `helper(window)` callback invoked after registration (e.g. to attach a convenience global)
* **logViolations** {Boolean} — default `true`. `console.warn` on `securitypolicyviolation` events. Cheap development aid; the event never fires in a healthy prod environment.
* **shimWhenUnavailable** {Boolean} — default `true`. When enforcing but the browser has no Trusted Types (it ignores `require-trusted-types-for` anyway), install the passthrough shim so unconditional `trustedTypes.createPolicy(...)` calls elsewhere never throw and plain strings pass through as before.

### defaultPolicyHooks(options)
Returns the hook object for the reserved `default` policy, for apps that want to register policies manually (e.g. with their own timing or a custom policy name set). Accepts `{ scriptURLOrigins }` as in the config above. No `createScript` hook is included.

### escapeHtml(input)
Applies the industry-standard 6-character escape — `& < > " ' \`` → `&amp; &lt; &gt; &quot; &#x27; &#x60;` — for safe interpolation into HTML markup, in element content **and** attribute values. Output is byte-identical to [`he.escape`](https://github.com/mathiasbynens/he) for all inputs where `he` does not throw; `null`/`undefined` yield `''`. Exported here so build-time or computed contexts can use the same escape the runtime `default` policy applies.

### shimTrustedTypes(window)
Installs the passthrough shim on a window (see [lib/shim.js](lib/shim.js)): `trustedTypes.createPolicy` returns plain-string pass-through hooks, and `document.createElement('script').src = x` never throws (the setter coerces to string). Idempotent — does nothing when `trustedTypes` already exists.

### setWindow(target)
Overrides the window reference used for policy registration (resolved at call time, defaulting to `globalThis`). Primarily a test hook; apps do not need it.

## Sanitize Sub-Path

The **escape tier** (default behavior) is strict: six characters escaped, nothing else rendered as markup. For rendering **untrusted rich content** (user-supplied posts, importable documents) you want the **sanitize tier**: DOMPurify strips dangerous markup while preserving an allow-list of safe HTML. It lives behind a separate entry point so only apps that import it pay the ~11 KB gzip cost:

```js
// Only this module imports dompurify (~11 KB gzip). Apps without rich content
// never pay for it.
import { createSanitizerPolicy } from '@localnerve/trusted-types-bootstrap/sanitize';

const policy = createSanitizerPolicy('app-rich', {
  USE_PROFILES: { html: true },   // DOMPurify config passthrough
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong']
});

// at the sink:
el.innerHTML = policy.createHTML(dirtyHtml);
```

* **createSanitizerPolicy(name, dompurifyConfig)** — creates a named policy whose `createHTML` calls `DOMPurify.sanitize(input, { ...config, TRUSTED_TYPES_POLICY: null })`. The `TRUSTED_TYPES_POLICY: null` is forced internally (any caller-supplied value is ignored) so DOMPurify does **not** create its internal `dompurify` policy — which would break a computed CSP allowlist. Returns `null` when Trusted Types is unavailable; fall back to plain-string passthrough or use the exported `purify` instance directly.
* **purify** — a `DOMPurify` instance bound to the current window, for sanitizing without a policy (e.g. dev builds without enforcement).

The policy name is the first argument and must be in the CSP allowlist, detected by `@localnerve/trusted-types-rules` as usual since it is declared at this call site.

## Relationship to Other Packages

| Package | Scope | TT role |
| --- | --- | --- |
| [`@localnerve/web-component-build`](https://github.com/localnerve/web-component-build) | web component build pipeline | **Component-level** runtime helpers (`escapeHtml`, `getTrustedPolicy`, `trustedHtml`) inlined into each component's bundle; components register their own named policy. |
| `@localnerve/trusted-types-bootstrap` (this) | app/page-level bootstrap | Registers the app's `default` + named policies, shim, violation logging. One call per app. |
| [`@localnerve/trusted-types-rules`](https://github.com/localnerve/trusted-types-rules) | build-time audit | Computes the CSP `trusted-types` allowlist from built JS (AST). Consumes output of both above; no special handling needed. |

The 6-char escape exists in two places by design: wcb's `escapeHtml` (component-level, build-time-inlined) and this package's core (app-level, runtime). They must stay byte-identical — a shared test vector (`ESCAPE_VECTORS` in [`__tests__/escape.spec.js`](__tests__/escape.spec.js), verified against `he.escape`) guards that drift.

## Development

```sh
npm install
npm test        # node --test with coverage (lcov written to coverage/)
npm run lint    # eslint
```

Tests run under Node (see `.nvmrc`); the browser path is exercised with jsdom plus a fake `trustedTypes` recorder — jsdom has no native Trusted Types, and policy registration through `createPolicy` + hooks is exactly the API surface this package relies on.

## License

BSD-3-Clause — see [LICENSE.md](LICENSE.md).

Copyright (c) 2026 Alex Grant (@localnerve), LocalNerve LLC
