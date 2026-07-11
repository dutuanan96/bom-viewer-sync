import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

export const repoRoot = path.resolve(import.meta.dirname, '..', '..');

export function loadLegacyCoreUtils() {
  const source = fs.readFileSync(path.join(repoRoot, 'app-core.js'), 'utf8');
  const context = {
    console,
    TextEncoder,
    TextDecoder,
    window: { location: { search: '', hash: '' } },
  };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'app-core.js' });
  return context.window.BomCoreUtils;
}

export function loadDataPayload(filePath = path.join(repoRoot, 'data.js')) {
  const source = fs.readFileSync(filePath, 'utf8');
  const context = { window: {} };
  vm.runInNewContext(source, context, { filename: 'data.js' });
  return context.window.BOM_VIEWER_DATA;
}
