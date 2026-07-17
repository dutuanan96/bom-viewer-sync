import './runtime-dependencies.js';
import { createApp } from './application.js';

createApp({
  mode: 'viewer',
  config: globalThis.BOM_REPO_CONFIG,
});
