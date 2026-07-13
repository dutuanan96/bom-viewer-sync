import fs from 'node:fs';
import path from 'node:path';
import { parseDataJsPayload } from '../../src/infrastructure/github-data.js';

export const repoRoot = path.resolve(import.meta.dirname, '..', '..');

export function loadDataPayload(filePath = path.join(repoRoot, 'data.js')) {
  return parseDataJsPayload(fs.readFileSync(filePath, 'utf8'));
}
