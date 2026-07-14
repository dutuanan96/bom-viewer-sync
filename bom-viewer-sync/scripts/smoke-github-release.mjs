import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createGithubReleaseAdapter } from '../src/infrastructure/github-release.js';

function byteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

export function buildSmokePdf() {
  const content = 'BT /F1 18 Tf 30 100 Td (BOM Release Asset Smoke) Tj ET';
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
  source += `xref\n0 ${objects.length + 1}\n`;
  source += '0000000000 65535 f \n';
  for (const offset of offsets) {
    source += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  source += `startxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(source);
}

function publicMetadata(asset) {
  return {
    id: asset.id,
    name: asset.name,
    state: asset.state,
    content_type: asset.content_type,
    size: asset.size,
    digest: asset.digest || '',
    browser_download_url: asset.browser_download_url,
    reused: asset.reused,
  };
}

async function run() {
  const token = String(process.env.GH_TOKEN || '').trim();
  if (!token) throw new Error('GH_TOKEN is required');

  const config = {
    owner: process.env.ASSET_OWNER || 'dutuanan96',
    repo: process.env.ASSET_REPO || 'bom-viewer-assets',
    releaseTag: process.env.ASSET_RELEASE_TAG || 'assets-v1',
    targetCommitish: 'main',
  };
  const adapter = createGithubReleaseAdapter({ config });
  const release = await adapter.getOrCreateRelease(token);
  const uploadId = `${Date.now().toString(36)}-${process.pid}`;
  const pdf = await adapter.uploadAsset({
    token,
    releaseId: release.id,
    name: `smoke-${uploadId}.pdf`,
    contentType: 'application/pdf',
    body: buildSmokePdf(),
  });
  const glb = await adapter.uploadAsset({
    token,
    releaseId: release.id,
    name: `smoke-${uploadId}.glb`,
    contentType: 'model/gltf-binary',
    body: await readFile(new URL('../models3d/catalog/LGS-35x32-5-ad72669d.glb', import.meta.url)),
  });

  process.stdout.write(`${JSON.stringify({
    repository: `${config.owner}/${config.repo}`,
    releaseTag: config.releaseTag,
    releaseId: release.id,
    pdf: publicMetadata(pdf),
    glb: publicMetadata(glb),
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
