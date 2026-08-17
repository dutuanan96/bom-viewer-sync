import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadCanonicalMaterials() {
  const materialsJson = JSON.parse(readFileSync(resolve('data/materials.json'), 'utf8'));
  return materialsJson.materialDb?.materials || {};
}

test('all material 2D drawings have valid non-empty names and embeddable PDF URLs', () => {
  const materials = loadCanonicalMaterials();
  const errors = [];

  for (const [id, m] of Object.entries(materials)) {
    for (const [idx, d] of (m.drawings || []).entries()) {
      const code = m.code || id;
      if (!d.name || typeof d.name !== 'string' || !d.name.trim()) {
        errors.push(`Material ${code} drawing #${idx} is missing a name`);
      }
      const url = String(d.url || '').trim();
      if (!url) {
        errors.push(`Material ${code} drawing #${idx} is missing a URL`);
        continue;
      }
      if (url.endsWith('_pdf')) {
        errors.push(`Material ${code} drawing URL ends in _pdf instead of .pdf (triggers download instead of iframe render): ${url}`);
      }
      const isDrive = url.includes('drive.google.com');
      const isPdf = url.toLowerCase().endsWith('.pdf') || (url.includes('?') && url.split('?')[0].toLowerCase().endsWith('.pdf'));
      if (!isDrive && !isPdf) {
        errors.push(`Material ${code} drawing URL must end in .pdf or be Google Drive: ${url}`);
      }
    }
  }

  assert.deepEqual(errors, [], `Found ${errors.length} invalid drawing URLs in material database`);
});

test('3D model records have valid URLs or preview URLs', () => {
  const materials = loadCanonicalMaterials();
  const errors = [];

  for (const [id, m] of Object.entries(materials)) {
    for (const [idx, mod] of (m.models3d || []).entries()) {
      const code = m.code || id;
      const url = String(mod.url || mod.previewUrl || '').trim();
      if (!url) {
        errors.push(`Material ${code} 3D model #${idx} is missing both url and previewUrl`);
      }
    }
  }

  assert.deepEqual(errors, [], `Found ${errors.length} invalid 3D model URLs in material database`);
});
