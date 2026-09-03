/**
 * Sanitize sub-path tests. JSDOM has no native Trusted Types, so a fake
 * trustedTypes records the policy hooks and createHTML is exercised directly -
 * verifying DOMPurify strips dangerous markup while keeping the allow-list.
 * 
 * Copyright (c) 2026 Alex Grant (@localnerve), LocalNerve LLC
 * Copyrights licensed under the BSD License. See the accompanying LICENSE file for terms.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { start as jsdomStart, stop as jsdomStop } from './jsdom.js';
import { createSanitizerPolicy } from '../lib/sanitize.js';

describe('createSanitizerPolicy', () => {
  let result;

  before(() => {
    result = jsdomStart(undefined);
  });

  after(() => {
    jsdomStop(result);
  });

  it('returns null when Trusted Types is unavailable', () => {
    assert.strictEqual(createSanitizerPolicy('app-rich'), null);
  });

  it('registers a policy whose createHTML sanitizes with the config', () => {
    const policies = new Map();
    global.window.trustedTypes = {
      createPolicy: (name, hooks) => {
        policies.set(name, hooks);
        return { createHTML: s => hooks.createHTML(s) };
      }
    };

    const policy = createSanitizerPolicy('app-rich', {
      ALLOWED_TAGS: ['b', 'i']
    });
    assert.ok(policy, 'policy created');
    assert.ok(policies.has('app-rich'), 'hooks recorded under policy name');

    const clean = policies.get('app-rich').createHTML(
      '<b>bold</b><script>alert(1)</script><img src=x onerror=alert(2)><i>italic</i>'
    );
    assert.ok(clean.includes('<b>bold</b>'), 'allowed tag kept: ' + clean);
    assert.ok(clean.includes('<i>italic</i>'), 'allowed tag kept: ' + clean);
    assert.ok(!clean.includes('<script>'), 'script stripped: ' + clean);
    assert.ok(!clean.includes('<img'), 'disallowed tag removed: ' + clean);
    assert.ok(!clean.includes('onerror'), 'event handler stripped: ' + clean);
  });

  it('ignores a caller-supplied TRUSTED_TYPES_POLICY (always null)', () => {
    const policies = new Map();
    global.window.trustedTypes = {
      createPolicy: (name, hooks) => {
        // capture the config by calling createHTML and inspecting behavior is
        // not possible directly; instead verify it does NOT throw when a bogus
        // policy object is passed in config.
        policies.set(name, hooks);
        return { createHTML: s => hooks.createHTML(s) };
      }
    };

    const policy = createSanitizerPolicy('app-rich2', { TRUSTED_TYPES_POLICY: 'bogus' });
    assert.ok(policy);
    // with TRUSTED_TYPES_POLICY forced to null internally, a bogus value must
    // not be used -> sanitize returns a plain string, no throw.
    const out = policies.get('app-rich2').createHTML('<b>ok</b><script>x</script>');
    assert.strictEqual(typeof out, 'string');
    assert.ok(out.includes('<b>ok</b>'));
    assert.ok(!out.includes('<script>'));
  });
});
