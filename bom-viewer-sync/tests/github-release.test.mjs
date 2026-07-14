import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createGithubReleaseAdapter,
  GithubReleaseError,
} from '../src/infrastructure/github-release.js';
import { buildSmokePdf } from '../scripts/smoke-github-release.mjs';

const config = {
  owner: 'acme',
  repo: 'bom-viewer-assets',
  releaseTag: 'assets-v1',
  targetCommitish: 'main',
};

function jsonResponse(body, status = 200, statusText = 'OK') {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => body,
  };
}

test('reuses an existing release by encoded tag', async () => {
  const requests = [];
  const adapter = createGithubReleaseAdapter({
    config: { ...config, releaseTag: 'assets/v1 beta' },
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return jsonResponse({ id: 41, tag_name: 'assets/v1 beta' });
    },
  });

  const release = await adapter.getOrCreateRelease('secret-token');

  assert.equal(release.id, 41);
  assert.equal(
    requests[0].url,
    'https://api.github.com/repos/acme/bom-viewer-assets/releases/tags/assets%2Fv1%20beta',
  );
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(requests[0].options.headers.Accept, 'application/vnd.github+json');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer secret-token');
  assert.equal(requests[0].options.headers['X-GitHub-Api-Version'], '2026-03-10');
});

test('creates the storage release when the tag is absent', async () => {
  const requests = [];
  const responses = [
    jsonResponse({}, 404, 'Not Found'),
    jsonResponse({ id: 42, tag_name: 'assets-v1' }, 201, 'Created'),
  ];
  const adapter = createGithubReleaseAdapter({
    config,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return responses.shift();
    },
  });

  const release = await adapter.getOrCreateRelease('token');

  assert.equal(release.id, 42);
  assert.equal(requests[1].url, 'https://api.github.com/repos/acme/bom-viewer-assets/releases');
  assert.equal(requests[1].options.method, 'POST');
  assert.equal(requests[1].options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    tag_name: 'assets-v1',
    target_commitish: 'main',
    name: 'assets-v1',
    body: 'Binary assets for BOM Viewer.',
    draft: false,
    prerelease: false,
    make_latest: 'false',
  });
});

test('recovers a concurrent release creation through one final lookup', async () => {
  const requests = [];
  const responses = [
    jsonResponse({}, 404, 'Not Found'),
    jsonResponse({}, 422, 'Unprocessable Entity'),
    jsonResponse({ id: 43, tag_name: 'assets-v1' }),
  ];
  const adapter = createGithubReleaseAdapter({
    config,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return responses.shift();
    },
  });

  const release = await adapter.getOrCreateRelease('token');

  assert.equal(release.id, 43);
  assert.equal(requests.length, 3);
  assert.equal(requests[2].url, requests[0].url);
  assert.equal(requests[2].options.method, 'GET');
});

test('preserves status and endpoint without exposing the token', async () => {
  const adapter = createGithubReleaseAdapter({
    config,
    fetchImpl: async () => jsonResponse({}, 500, 'Server Error'),
  });

  await assert.rejects(
    adapter.getOrCreateRelease('do-not-expose-this-token'),
    (error) => error instanceof GithubReleaseError
      && error.status === 500
      && error.endpoint === '/releases/tags/assets-v1'
      && /GET \/releases\/tags\/assets-v1 failed: 500 Server Error/.test(error.message)
      && !error.message.includes('do-not-expose-this-token'),
  );
});

test('rejects malformed release responses', async () => {
  const adapter = createGithubReleaseAdapter({
    config,
    fetchImpl: async () => jsonResponse({ id: 'not-a-number' }),
  });

  await assert.rejects(
    adapter.getOrCreateRelease('token'),
    (error) => error instanceof GithubReleaseError
      && error.code === 'GITHUB_RELEASE_INVALID_RESPONSE',
  );
});

test('lists release assets across every page', async () => {
  const requests = [];
  const firstPage = Array.from({ length: 100 }, (_, index) => ({
    id: index + 1,
    name: `asset-${index + 1}.glb`,
    state: 'uploaded',
  }));
  const responses = [jsonResponse(firstPage), jsonResponse([{
    id: 101,
    name: 'asset-101.glb',
    state: 'uploaded',
  }])];
  const adapter = createGithubReleaseAdapter({
    config,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return responses.shift();
    },
  });

  const assets = await adapter.listAssets({ token: 'token', releaseId: 41 });

  assert.equal(assets.length, 101);
  assert.deepEqual(requests.map(({ url }) => url), [
    'https://api.github.com/repos/acme/bom-viewer-assets/releases/41/assets?per_page=100&page=1',
    'https://api.github.com/repos/acme/bom-viewer-assets/releases/41/assets?per_page=100&page=2',
  ]);
});

test('uploads the original binary body and validates public metadata', async () => {
  const requests = [];
  const body = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);
  const adapter = createGithubReleaseAdapter({
    config,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return jsonResponse({
        id: 51,
        name: 'MAT 001_model.glb',
        state: 'uploaded',
        content_type: 'model/gltf-binary',
        size: body.byteLength,
        browser_download_url: 'https://github.com/acme/bom-viewer-assets/releases/download/assets-v1/MAT_001_model.glb',
      }, 201, 'Created');
    },
  });

  const result = await adapter.uploadAsset({
    token: 'secret-token',
    releaseId: 41,
    name: 'MAT 001_model.glb',
    contentType: 'model/gltf-binary',
    body,
  });

  assert.equal(result.reused, false);
  assert.equal(
    requests[0].url,
    'https://uploads.github.com/repos/acme/bom-viewer-assets/releases/41/assets?name=MAT%20001_model.glb',
  );
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.body, body);
  assert.equal(requests[0].options.headers['Content-Type'], 'model/gltf-binary');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer secret-token');
  assert.equal(requests[0].options.headers['X-GitHub-Api-Version'], '2026-03-10');
});

test('recovers an uploaded duplicate by exact name without deleting it', async () => {
  const requests = [];
  const existing = {
    id: 52,
    name: 'MAT001_upload1_model.glb',
    state: 'uploaded',
    content_type: 'model/gltf-binary',
    size: 4,
    browser_download_url: 'https://github.com/acme/bom-viewer-assets/releases/download/assets-v1/MAT001_upload1_model.glb',
  };
  const responses = [
    jsonResponse({}, 422, 'Unprocessable Entity'),
    jsonResponse([existing]),
  ];
  const adapter = createGithubReleaseAdapter({
    config,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return responses.shift();
    },
  });

  const result = await adapter.uploadAsset({
    token: 'token',
    releaseId: 41,
    name: existing.name,
    contentType: existing.content_type,
    body: new Uint8Array([1, 2, 3, 4]),
  });

  assert.equal(result.id, existing.id);
  assert.equal(result.reused, true);
  assert.equal(requests.some(({ options }) => options.method === 'DELETE'), false);
});

for (const scenario of [
  { name: 'unresolved duplicate', assets: [], code: 'GITHUB_RELEASE_CONFLICT' },
  {
    name: 'starter duplicate',
    assets: [{ id: 53, name: 'duplicate.pdf', state: 'starter' }],
    code: 'GITHUB_RELEASE_STARTER_ASSET',
  },
]) {
  test(`reports ${scenario.name} without deleting assets`, async () => {
    const requests = [];
    const responses = [
      jsonResponse({}, 422, 'Unprocessable Entity'),
      jsonResponse(scenario.assets),
    ];
    const adapter = createGithubReleaseAdapter({
      config,
      fetchImpl: async (url, options) => {
        requests.push({ url, options });
        return responses.shift();
      },
    });

    await assert.rejects(
      adapter.uploadAsset({
        token: 'token',
        releaseId: 41,
        name: 'duplicate.pdf',
        contentType: 'application/pdf',
        body: new Uint8Array([1]),
      }),
      (error) => error instanceof GithubReleaseError && error.code === scenario.code,
    );
    assert.equal(requests.some(({ options }) => options.method === 'DELETE'), false);
  });
}

test('maps an upstream upload failure to starter-asset warning context', async () => {
  const adapter = createGithubReleaseAdapter({
    config,
    fetchImpl: async () => jsonResponse({}, 502, 'Bad Gateway'),
  });

  await assert.rejects(
    adapter.uploadAsset({
      token: 'token',
      releaseId: 41,
      name: 'model.glb',
      contentType: 'model/gltf-binary',
      body: new Uint8Array([1]),
    }),
    (error) => error instanceof GithubReleaseError
      && error.code === 'GITHUB_RELEASE_STARTER_ASSET'
      && error.status === 502,
  );
});

test('rejects malformed uploaded asset metadata', async () => {
  const adapter = createGithubReleaseAdapter({
    config,
    fetchImpl: async () => jsonResponse({
      id: 54,
      name: 'model.glb',
      state: 'uploaded',
      browser_download_url: 'not-https',
    }, 201, 'Created'),
  });

  await assert.rejects(
    adapter.uploadAsset({
      token: 'token',
      releaseId: 41,
      name: 'model.glb',
      contentType: 'model/gltf-binary',
      body: new Uint8Array([1]),
    }),
    (error) => error instanceof GithubReleaseError
      && error.code === 'GITHUB_RELEASE_INVALID_RESPONSE',
  );
});

test('rejects invalid upload and listing inputs before network calls', async () => {
  let requestCount = 0;
  const adapter = createGithubReleaseAdapter({
    config,
    fetchImpl: async () => {
      requestCount += 1;
      return jsonResponse([]);
    },
  });

  await assert.rejects(adapter.listAssets({ token: 'token', releaseId: 0 }), TypeError);
  for (const input of [
    { releaseId: 0, name: 'file.pdf', contentType: 'application/pdf', body: new Uint8Array([1]) },
    { releaseId: 41, name: '', contentType: 'application/pdf', body: new Uint8Array([1]) },
    { releaseId: 41, name: 'file.pdf', contentType: '', body: new Uint8Array([1]) },
    { releaseId: 41, name: 'file.pdf', contentType: 'application/pdf', body: null },
  ]) {
    await assert.rejects(adapter.uploadAsset({ token: 'token', ...input }), TypeError);
  }
  assert.equal(requestCount, 0);
});

test('builds a self-contained PDF with a valid xref offset for live smoke', () => {
  const bytes = buildSmokePdf();
  const source = new TextDecoder().decode(bytes);
  const startXref = Number(source.match(/startxref\n(\d+)\n%%EOF/)?.[1]);

  assert.match(source, /^%PDF-1\.4/);
  assert.equal(source.slice(startXref, startXref + 4), 'xref');
  assert.match(source, /BOM Release Asset Smoke/);
});
