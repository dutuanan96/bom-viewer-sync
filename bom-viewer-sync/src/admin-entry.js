import './runtime-dependencies.js';
import { createApp } from './application.js';

const app = createApp({
  mode: 'admin',
  config: globalThis.BOM_REPO_CONFIG,
});

if (typeof window !== 'undefined') {
  window.app = app;
}
