(function (global) {
  'use strict';

  global.BomApp.start({
    mode: 'viewer',
    config: global.BOM_REPO_CONFIG
  });
}(typeof window !== 'undefined' ? window : globalThis));
