/**
 * Escape tests - includes the shared vector that must stay byte-identical to
 * @localnerve/web-component-build's escapeHtml. he (devDependency) acts as the
 * external oracle.
 * 
 * Copyright (c) 2026 Alex Grant (@localnerve), LocalNerve LLC
 * Copyrights licensed under the BSD License. See the accompanying LICENSE file for terms.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert';
import * as he from 'he';
import { escapeHtml } from '../lib/escape.js';

// Shared vector: every case here must also appear in wcb's escape tests so the
// two implementations cannot drift apart.
export const ESCAPE_VECTORS = [
  ['<script>alert(1)</script>', '&lt;script&gt;alert(1)&lt;/script&gt;'],
  ['a < b > c', 'a &lt; b &gt; c'],
  ['"double" and \'single\' and `backtick`', '&quot;double&quot; and &#x27;single&#x27; and &#x60;backtick&#x60;'],
  ['&amp; already escaped', '&amp;amp; already escaped'],
  ['caf\u00e9 \u4e2d\ud83d\ude00 non-ascii astral', 'caf\u00e9 \u4e2d\ud83d\ude00 non-ascii astral'],
  ['ctrl \x01 char and null \u0000 byte', 'ctrl \x01 char and null \u0000 byte'],
  ['attr="value" onmouseover=\'x\' `y`', 'attr=&quot;value&quot; onmouseover=&#x27;x&#x27; &#x60;y&#x60;'],
  ['<img src=x onerror=alert(1)>', '&lt;img src=x onerror=alert(1)&gt;'],
  ['', ''],
  [12345, '12345'],
  [true, 'true']
];

describe('escapeHtml', () => {
  test('matches the shared vector', () => {
    for (const [input, expected] of ESCAPE_VECTORS) {
      assert.strictEqual(escapeHtml(input), expected);
    }
  });

  test('is byte-identical to he.escape on all non-null inputs', () => {
    for (const [input] of ESCAPE_VECTORS) {
      // he.escape requires a string; our escape also accepts non-strings
      assert.strictEqual(escapeHtml(input), he.escape(String(input)));
    }
  });

  test('round-trips through he.decode', () => {
    for (const [input] of ESCAPE_VECTORS.filter(([, e]) => e !== '')) {
      assert.strictEqual(he.decode(escapeHtml(input)), String(input));
    }
  });

  test('null/undefined yield empty string (he throws here)', () => {
    assert.strictEqual(escapeHtml(null), '');
    assert.strictEqual(escapeHtml(undefined), '');
    assert.throws(() => he.escape(null));
  });

  test('escapes in attribute context: result cannot break out of quotes', () => {
    const evil = '" onmouseover="alert(1)';
    const attr = 'title="' + escapeHtml(evil) + '"';
    // the only unescaped quotes are the ones we added around the value, so
    // the escaped content cannot break out of the attribute context
    const expected = 'title="' + he.escape(evil) + '"';
    assert.strictEqual(attr, expected);
  });
});
