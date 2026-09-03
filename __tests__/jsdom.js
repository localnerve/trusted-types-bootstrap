/**
 * JSDom related functions
 * 
 * Copyright (c) 2026 Alex Grant (@localnerve), LocalNerve LLC
 * Copyrights licensed under the BSD License. See the accompanying LICENSE file for terms.
 */

import { JSDOM } from 'jsdom';

/**
 * Wrap the JSDOM API.
 *
 * @param {String} markup - The markup to init JSDOM with.
 * @param {Object} options - The options to init JSDOM with.
 * @returns {Object} with win and doc
 */
function createJSDOM (markup, options) {
  const dom = new JSDOM(markup, options);
  return {
    win: dom.window,
    doc: dom.window.document,
    serialize: dom.serialize.bind(dom),
  };
}

/**
 * Shim document and window with jsdom if not defined.
 * Init document with markup if specified.
 * Add globals if specified.
 *
 * @param {Object} [options] - The JSDOM options to start the DOM with.
 * @param {String} [markup] - The markup to init JSDOM with.
 * @param {Object} [addGlobals] - Additional globals to add to global window.
 * @returns {Object} A result object, contains collection of global keys added to the global window.
 */
export function start (options, markup, addGlobals) {
  if (typeof document !== 'undefined') {
    return;
  }

  if (options && options.suppressJSDOMError) {
    const virtualConsole = new JSDOM.VirtualConsole();
    virtualConsole.sendTo(console, {
      omitJSDOMErrors: true
    });
    options.virtualConsole = virtualConsole;
    delete options.suppressJSDOMError;
  }

  const globalKeys = [];

  const { win, doc, serialize } = createJSDOM(
    markup || '<!doctype html><html><body></body></html>', options
  );

  global.document = doc;
  global.window = win;

  if (addGlobals) {
    Object.keys(addGlobals).forEach(key => {
      global.window[key] = addGlobals[key];
      global[key] = addGlobals[key];
      globalKeys.push(key);
    });
  }

  // jsdomResult
  return {
    globalKeys,
    serialize
  };
}

/**
 * Remove globals, stop and delete window.
 */
export function stop (jsdomResult) {
  if (jsdomResult) {
    const { globalKeys } = jsdomResult;
    globalKeys.forEach(key => {
      delete global.window[key];
      delete global[key];
    });
  }
  delete global.document;
  delete global.window;
}
