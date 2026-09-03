/**
 * Bootstrap + shim tests. JSDOM has no native Trusted Types, so the TT path is
 * exercised with a fake trustedTypes object that records createPolicy calls -
 * which is exactly the surface this package (and wcb) relies on.
 * 
 * Copyright (c) 2026 Alex Grant (@localnerve), LocalNerve LLC
 * Copyrights licensed under the BSD License. See the accompanying LICENSE file for terms.
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import { start as jsdomStart, stop as jsdomStop } from './jsdom.js';
import {
  bootstrapTrustedTypes,
  setWindow,
  defaultPolicyHooks,
  shimTrustedTypes
} from '../index.js';

const CSP_META = '<meta http-equiv="Content-Security-Policy" content="require-trusted-types-for \'script\'">';

/**
 * Create a fake trustedTypes API that records policy registrations.
 * @returns {Object} {tt, policies: Map<name, hooks>}
 */
function makeFakeTT () {
  const policies = new Map();
  const tt = {
    createPolicy: (name, hooks) => {
      if (policies.has(name)) throw new Error('policy exists: ' + name);
      policies.set(name, hooks || {});
      return {
        createHTML: hooks?.createHTML || (s => String(s)),
        createScriptURL: hooks?.createScriptURL || (s => String(s)),
        createScript: hooks?.createScript
      };
    }
  };
  return { tt, policies };
}

const BASE_URL = 'https://example.com/page.html';
let lastResult = null;

function freshJSDOM (markup) {
  // jsdom start() is a no-op when globals already exist, so reset first to
  // get a fresh document/window per test.
  if (lastResult) jsdomStop(lastResult);
  lastResult = jsdomStart({ url: BASE_URL }, markup);
  setWindow(global.window);
  return lastResult;
}

describe('bootstrapTrustedTypes', () => {
  after(() => {
    jsdomStop(lastResult);
    setWindow(null);
  });

  it('enforce auto + no CSP meta: registers nothing, returns false', () => {
    freshJSDOM('<!doctype html><html><body></body></html>');
    const { tt } = makeFakeTT();
    global.window.trustedTypes = tt;
    assert.strictEqual(bootstrapTrustedTypes({}), false);
    delete global.window.trustedTypes;
  });

  it('enforce auto + CSP meta: registers default policy only', () => {
    freshJSDOM('<!doctype html><html><head>' + CSP_META + '</head><body></body></html>');
    const { tt, policies } = makeFakeTT();
    global.window.trustedTypes = tt;
    assert.strictEqual(bootstrapTrustedTypes({}), true);
    assert.deepStrictEqual([...policies.keys()], ['default']);
    delete global.window.trustedTypes;
  });

  it('enforce true without meta: registers (override)', () => {
    freshJSDOM('<!doctype html><html><body></body></html>');
    const { tt, policies } = makeFakeTT();
    global.window.trustedTypes = tt;
    assert.strictEqual(bootstrapTrustedTypes({ enforce: true }), true);
    assert.ok(policies.has('default'));
    delete global.window.trustedTypes;
  });

  it('enforce false with meta: registers nothing (override)', () => {
    freshJSDOM('<!doctype html><html><head>' + CSP_META + '</head><body></body></html>');
    const { tt } = makeFakeTT();
    global.window.trustedTypes = tt;
    assert.strictEqual(bootstrapTrustedTypes({ enforce: false }), false);
    delete global.window.trustedTypes;
  });

  it('no Trusted Types + enforce: installs shim, returns false', () => {
    freshJSDOM('<!doctype html><html><head>' + CSP_META + '</head><body></body></html>');
    assert.strictEqual(bootstrapTrustedTypes({}), false);
    assert.ok('trustedTypes' in global.window);
    const p = global.window.trustedTypes.createPolicy('x');
    assert.strictEqual(p.createHTML('<b>hi</b>'), '<b>hi</b>'); // passthrough
  });

  it('named policies: staticHtml preset + custom hooks + helper', () => {
    freshJSDOM('<!doctype html><html><head>' + CSP_META + '</head><body></body></html>');
    const { tt, policies } = makeFakeTT();
    global.window.trustedTypes = tt;
    let helperCalledWith = null;
    assert.strictEqual(bootstrapTrustedTypes({
      policies: {
        'app-static': 'staticHtml',
        'custom': {
          hooks: { createHTML: s => 'CUSTOM:' + s },
          helper: w => { helperCalledWith = w; }
        }
      }
    }), true);
    assert.deepStrictEqual([...policies.keys()], ['default', 'app-static', 'custom']);
    assert.strictEqual(policies.get('app-static').createHTML('<i>x</i>'), '<i>x</i>'); // pass-through preset
    assert.strictEqual(policies.get('custom').createHTML('y'), 'CUSTOM:y');
    assert.strictEqual(helperCalledWith, global.window);
  });

  it('default policy createHTML escapes all six characters', () => {
    freshJSDOM('<!doctype html><html><head>' + CSP_META + '</head><body></body></html>');
    const { tt, policies } = makeFakeTT();
    global.window.trustedTypes = tt;
    bootstrapTrustedTypes({});
    const html = policies.get('default').createHTML('<a href="x" title=\'y\'>`z` & more');
    assert.strictEqual(html, '&lt;a href=&quot;x&quot; title=&#x27;y&#x27;&gt;&#x60;z&#x60; &amp; more');
  });

  it('default policy createScriptURL: same-origin only by default', () => {
    freshJSDOM('<!doctype html><html><head>' + CSP_META + '</head><body></body></html>');
    const { tt, policies } = makeFakeTT();
    global.window.trustedTypes = tt;
    bootstrapTrustedTypes({});
    const hook = policies.get('default').createScriptURL;
    assert.ok(hook('/app.js').endsWith('/app.js')); // relative resolves same-origin
    assert.throws(() => hook('https://evil.example.com/app.js'), /rejected/);
  });

  it('scriptURLOrigins: extra origins allowed', () => {
    freshJSDOM('<!doctype html><html><head>' + CSP_META + '</head><body></body></html>');
    const { tt, policies } = makeFakeTT();
    global.window.trustedTypes = tt;
    bootstrapTrustedTypes({ scriptURLOrigins: ['self', 'https://cdn.example.com'] });
    const hook = policies.get('default').createScriptURL;
    assert.ok(hook('https://cdn.example.com/lib.js').startsWith('https://cdn.example.com/'));
    assert.throws(() => hook('https://other.example.com/lib.js'), /rejected/);
  });

  it('logViolations: adds a securitypolicyviolation listener', () => {
    freshJSDOM('<!doctype html><html><body></body></html>');
    const listeners = [];
    global.window.addEventListener = type => listeners.push(type);
    bootstrapTrustedTypes({ logViolations: true });
    assert.ok(listeners.includes('securitypolicyviolation'));
    // and NOT when disabled
    const listeners2 = [];
    global.window.addEventListener = type => listeners2.push(type);
    bootstrapTrustedTypes({ logViolations: false });
    assert.ok(!listeners2.includes('securitypolicyviolation'));
  });

  it('throws without a window/document', () => {
    setWindow(null);
    // null has no document -> should throw
    setWindow({});
    assert.throws(() => bootstrapTrustedTypes({}), /no window\/document/);
    setWindow(global.window);
  });
});

describe('defaultPolicyHooks (standalone)', () => {
  after(() => {
    jsdomStop(lastResult);
    setWindow(null);
  });

  it('returns hooks usable for manual policy registration', () => {
    freshJSDOM('<!doctype html><html><body></body></html>');
    const hooks = defaultPolicyHooks({ scriptURLOrigins: ['self'] });
    assert.strictEqual(hooks.createHTML('<b>'), '&lt;b&gt;');
    assert.throws(() => hooks.createScriptURL('https://evil.example.com/x.js'), /rejected/);
  });
});

describe('shimTrustedTypes', () => {
  after(() => {
    jsdomStop(lastResult);
    setWindow(null);
  });

  it('patches trustedTypes + script src setter', () => {
    freshJSDOM('<!doctype html><html><body></body></html>');
    shimTrustedTypes(global.window);
    assert.ok('trustedTypes' in global.window);

    const p = global.window.trustedTypes.createPolicy('any');
    assert.strictEqual(p.createHTML('x'), 'x');
    assert.strictEqual(p.createScriptURL('y'), 'y');

    // script src setter coerces non-strings without throwing
    const s = global.window.document.createElement('script');
    s.src = 42;
    assert.strictEqual(s.getAttribute('src'), '42');

    // idempotent: does not re-patch when already present
    shimTrustedTypes(global.window);
  });
});
