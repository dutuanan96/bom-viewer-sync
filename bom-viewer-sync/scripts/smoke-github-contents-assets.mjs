import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  buildAssetPath,
  createGithubAssetStorageAdapter,
  sha256Hex,
} from '../src/infrastructure/github-asset-storage.js';

function byteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

export function buildSmokePdf() {
  const content = 'BT /F1 18 Tf 30 100 Td (BOM Contents Asset Smoke) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 360 160] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let source = '%PDF-1.4\n';
  const offsets = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(byteLength(source));
    source += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = byteLength(source);
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) source += `${String(offset).padStart(10, '0')} 00000 n \n`;
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(source);
}

async function upload(adapter, {
  token,
  kind,
  materialCode,
  originalName,
  contentType,
  bytes,
}) {
  const contentHash = await sha256Hex(bytes);
  const path = buildAssetPath({ kind, materialCode, originalName, contentHash });
  return adapter.uploadAsset({ token, path, contentType, bytes });
}

async function run() {
  const token = String(process.env.GH_TOKEN || '').trim();
  if (!token) throw new Error('GH_TOKEN is required');
  const config = {
    owner: process.env.ASSET_OWNER || 'dutuanan96',
    repo: process.env.ASSET_REPO || 'bom-viewer-assets',
    branch: process.env.ASSET_BRANCH || 'main',
  };
  const adapter = createGithubAssetStorageAdapter({ config });
  const pdfBytes = buildSmokePdf();
  const glbBytes = new Uint8Array(await readFile(
    new URL('../models3d/catalog/LGS-35x32-5-ad72669d.glb', import.meta.url),
  ));
  const pdf = await upload(adapter, {
    token,
    kind: 'pdf',
    materialCode: 'SMOKE',
    originalName: 'contents-smoke.pdf',
    contentType: 'application/pdf',
    bytes: pdfBytes,
  });
  const glb = await upload(adapter, {
    token,
    kind: 'glb',
    materialCode: 'SMOKE',
    originalName: 'contents-smoke.glb',
    contentType: 'model/gltf-binary',
    bytes: glbBytes,
  });
  process.stdout.write(`${JSON.stringify({
    repository: `${config.owner}/${config.repo}`,
    pdf,
    glb,
  }, null, 2)}\n`);
}

const entryUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (entryUrl === import.meta.url) {
  run().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      name: error.name,
      code: error.code || 'SMOKE_FAILED',
      message: error.message,
      status: error.status,
      endpoint: error.endpoint,
    })}\n`);
    process.exitCode = 1;
  });
}
