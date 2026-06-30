(function (global) {
  'use strict';

  global.BomApp.start({
    mode: 'admin',
    config: global.BOM_REPO_CONFIG
  });
}(typeof window !== 'undefined' ? window : globalThis));
