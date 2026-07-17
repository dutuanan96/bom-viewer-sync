import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { BomApplication, coreUtils } from '../src/application.js';
import { parseDataJsPayload, serializeDataJs } from '../src/infrastructure/github-data.js';

const rootDir = path.resolve(import.meta.dirname, '..');
const outputDir = rootDir;

function readOutput(fileName) {
  return fs.readFileSync(path.join(outputDir, fileName), 'utf8');
}

function readSourceTree() {
  return fs.readdirSync(path.join(rootDir, 'src'), { recursive: true })
    .filter((name) => name.endsWith('.js'))
    .sort()
    .map((name) => fs.readFileSync(path.join(rootDir, 'src', name), 'utf8'))
    .join('\n');
}

function extractConfig(html) {
  const match = html.match(/window\.BOM_REPO_CONFIG\s*=\s*(\{[\s\S]*?\});/);
  assert.ok(match, 'expected hardcoded window.BOM_REPO_CONFIG');
  return Function(`"use strict"; return (${match[1]});`)();
}

function loadCoreUtils() {
  return coreUtils;
}

function loadOutputPayload() {
  const dataJs = readOutput('data.js');
  const sandbox = { window: {} };
  Function('window', dataJs)(sandbox.window);
  return sandbox.window.BOM_VIEWER_DATA;
}

test('core resolves BOM assets without depending on material color suffix', () => {
  const utils = loadCoreUtils();
  const assetMap = {
    'abc123bh|panel': [{ name: 'shared-panel.pdf' }],
  };

  const matches = utils.findBomAssets(assetMap, {
    mat_code: 'ABC123WH',
    name_zh: 'Panel',
    name_vi: 'Panel',
  });

  assert.equal(matches[0].name, 'shared-panel.pdf');
});

test('core does not map BOM assets by code suffix or component number alone', () => {
  const utils = loadCoreUtils();
  const assetMap = {
    'lgs032zkbh|lgs032sleftframe': [{ name: 'LGS032-S-left-frame.pdf' }],
    'lgs031cb101kd|lgs031shelf': [{ name: 'LGS031-shelf.pdf' }],
  };

  assert.equal(utils.findBomAssets(assetMap, {
    mat_code: 'LGS032ZK',
    comp_code: 'none',
    name_zh: 'paper card',
  }).length, 0);

  assert.equal(utils.findBomAssets(assetMap, {
    mat_code: 'LNSLSD65254BZ',
    comp_code: '10',
    name_zh: 'hex screwdriver',
  }).length, 0);
});

test('catalog product names omit color-specific terms', () => {
  const utils = loadCoreUtils();
  const payload = loadOutputPayload();
  const lgs031 = payload.bom.LGS031;
  const lgs031Name = lgs031.color_info[lgs031.colors[0]].name_zh;
  const lgs434 = payload.bom.LGS434;
  const lgs434Name = lgs434.color_info[lgs434.colors[0]].name_zh;
  const lgs132 = payload.bom.LGS132;
  const lgs132Name = lgs132.color_info[lgs132.colors[0]].name_zh;
  const lgs334 = payload.bom.LGS334;
  const lgs334Name = lgs334.color_info[lgs334.colors[0]].name_zh;

  assert.match(lgs031Name, /复古色/);
  assert.match(lgs434Name, /云白色/);
  assert.match(lgs132Name, /烟墨黑/);
  assert.match(lgs334Name, /烟墨黑/);
  assert.equal(utils.stripProductColorName(lgs031Name, lgs031, 'zh'), '3列2层1抽开放式带灯带电布抽电视柜-45inch');
  assert.equal(utils.stripProductColorName(lgs434Name, lgs434, 'zh'), '3列3层灯电款开放空间8抽斗柜-57inch');
  assert.equal(utils.stripProductColorName(lgs132Name, lgs132, 'zh'), '3列3层6抽开放式带灯带电布抽电视柜-57inch');
  assert.equal(utils.stripProductColorName(lgs334Name, lgs334, 'zh'), '3列3层基础款10抽斗柜-57inch');
});

test('viewer hides raw GitHub data source while admin can manage linked assets', () => {
  const viewerHtml = readOutput('viewer.html');
  const appCore = readSourceTree();

  assert.match(viewerHtml, /data-sync-source-row/);
  assert.match(appCore, /syncSourceRow\.hidden\s*=\s*!this\.isAdmin\(\)/);
  assert.match(appCore, /data-delete-drawing-row/);
  assert.match(appCore, /data-delete-model3d-row/);
});

test('admin HTML uses shared files and viewer HTML keeps the same GitHub config', () => {
  const adminHtml = readOutput('admin.html');
  const viewerHtml = readOutput('viewer.html');
  const adminConfig = extractConfig(adminHtml);
  const viewerConfig = extractConfig(viewerHtml);

  assert.deepEqual(JSON.parse(JSON.stringify(adminConfig)), JSON.parse(JSON.stringify(viewerConfig)));
  assert.equal(adminConfig.owner, 'dutuanan96');
  assert.equal(adminConfig.repo, 'bom-viewer-sync');
  assert.equal(adminConfig.branch, 'main');
  assert.equal(adminConfig.shardRoot, 'bom-viewer-sync/data');
  assert.equal('path' in adminConfig, false);
  assert.equal('rawUrl' in adminConfig, false);

  assert.match(adminHtml, /app-admin\.js\?v=[a-f0-9]{12}/);
  assert.doesNotMatch(adminHtml, /<script\s+src=["']data\.js/);
  assert.doesNotMatch(readOutput('app-admin.js'), /BOM_VIEWER_DATA|parseDataJsPayload|serializeDataJs/);
  assert.equal('parseDataJsPayload' in coreUtils, false);
  assert.equal('serializeDataJs' in coreUtils, false);
  assert.doesNotMatch(adminHtml, /app-core\.js|app-viewer\.js/);
  assert.doesNotMatch(viewerHtml, /app-admin\.js/);
  assert.match(viewerHtml, /<meta name="pdm-build" content="[a-f0-9]{12}">/);
  assert.match(viewerHtml, /mode:\s*['"]viewer['"]/);
});

test('Admin submit and View Changes behavior is localized and action-routed', () => {
  const app = new BomApplication({ mode: 'admin', githubData: {}, githubAssetStorage: {} });

  app.state.lang = 'zh';
  assert.equal(app.label('save'), '\u63d0\u4ea4\u66f4\u6539');
  assert.equal(app.label('viewChanges'), '\u67e5\u770b\u66f4\u6539');

  app.state.lang = 'vi';
  assert.equal(app.label('save'), 'G\u1eedi thay \u0111\u1ed5i');
  assert.equal(app.label('viewChanges'), 'Xem thay \u0111\u1ed5i');

  const actionElement = {};
  let previewTrigger = null;
  app.showDiffModal = (trigger) => { previewTrigger = trigger; };
  app.runAction('view-changes', actionElement);
  assert.equal(previewTrigger, actionElement);
});

test('Admin change preview styling is owned by canonical CSS source', () => {
  const cssSource = fs.readFileSync(path.join(rootDir, 'src', 'styles', 'app.css'), 'utf8');

  assert.match(cssSource, /\.diff-modal/);
  assert.match(cssSource, /\.diff-table/);
  assert.match(cssSource, /\.diff-empty/);
});

test('viewer HTML is standalone for sharing to another computer', () => {
  const viewerHtml = readOutput('viewer.html');

  assert.doesNotMatch(viewerHtml, /<link\s+rel="stylesheet"\s+href="styles\.css"/);
  assert.doesNotMatch(viewerHtml, /<script\s+src="data\.js"/);
  assert.doesNotMatch(viewerHtml, /<script\s+src="app-core\.js"/);
  assert.doesNotMatch(viewerHtml, /<script\s+src="app-viewer\.js"/);
  assert.match(viewerHtml, /<style>/);
  assert.doesNotMatch(viewerHtml, /app-admin\.js/);
  assert.match(viewerHtml, /<meta name="pdm-build" content="[a-f0-9]{12}">/);
  assert.match(viewerHtml, /mode:\s*['"]viewer['"]/);
  assert.doesNotMatch(viewerHtml, /bom-viewer-sync\/data\.js/);
  assert.match(viewerHtml, /shardRoot:\s*['"]bom-viewer-sync\/data['"]/);
});

test('offline rollback utilities serialize and parse legacy data', () => {
  const payload = {
    version: 1,
    updatedAt: '2026-06-30T00:00:00.000Z',
    bom: { LGS001: { code: 'LGS001', colors: [], color_info: {} } },
    drawings: {},
    manuals: {},
    models3d: {
      LGS001: {
        'lgs001panel|panel': [{
          name: 'LGS001-panel.glb',
          previewUrl: 'https://raw.githubusercontent.com/dutuanan96/bom-viewer-sync/main/bom-viewer-sync/models3d/LGS001/LGS001-panel.glb',
          path: 'models3d/LGS001/LGS001-panel.glb'
        }]
      }
    },
  };

  const source = serializeDataJs(payload);
  const parsed = parseDataJsPayload(source);

  assert.deepEqual(parsed.bom.LGS001.code, 'LGS001');
  assert.equal(parsed.models3d.LGS001['lgs001panel|panel'][0].name, 'LGS001-panel.glb');
});

test('cloud payload preserves PDM notification events', () => {
  const utils = loadCoreUtils();
  const payload = {
    version: 3,
    updatedAt: '2026-07-09T05:00:00.000Z',
    bom: {},
    drawings: {},
    manuals: {},
    models3d: {},
    productImages: {},
    notifications: [{
      id: 'notif-20260709-050000',
      type: 'github-save',
      actor: 'admin',
      createdAt: '2026-07-09T05:00:00.000Z',
      version: 3
    }]
  };

  const normalized = utils.normalizePayload(payload);
  const source = serializeDataJs(normalized);
  const parsed = parseDataJsPayload(source);

  assert.equal(parsed.notifications.length, 1);
  assert.equal(parsed.notifications[0].type, 'github-save');
  assert.equal(parsed.notifications[0].actor, 'admin');
  assert.equal(parsed.notifications[0].createdAt, '2026-07-09T05:00:00.000Z');
});

test('admin save notification records changed material fields', () => {
  const utils = loadCoreUtils();
  const previous = utils.normalizePayload({
    version: 3,
    updatedAt: '2026-07-09T05:00:00.000Z',
    bom: {},
    drawings: {},
    manuals: {},
    models3d: {},
    productImages: {},
    materialDb: {
      materials: {
        mat_lgs111: {
          id: 'mat_lgs111',
          code: 'LGS111WJBBH',
          name: { zh: 'LGS111五金包', vi: 'LGS111 tui ngu kim' },
          spec: { zh: '', vi: '' },
          material: { zh: '无', vi: 'khong' },
          color: { zh: '黑色', vi: 'mau den' },
          attr: { zh: '零件', vi: 'linh kien' }
        }
      },
      bomEntries: []
    }
  });
  const next = utils.normalizePayload(JSON.parse(JSON.stringify(previous)));
  next.updatedAt = '2026-07-09T05:30:00.000Z';
  next.materialDb.materials.mat_lgs111.spec = { zh: '详见明细', vi: 'xem chi tiết' };

  const changes = utils.describePayloadChanges(previous, next);
  const withNotification = utils.appendNotificationEvent(next, {
    type: 'github-save',
    actor: 'admin',
    createdAt: next.updatedAt,
    changes
  });
  const parsed = parseDataJsPayload(serializeDataJs(withNotification));

  assert.deepEqual(JSON.parse(JSON.stringify(parsed.notifications[0].changes)), [{
    kind: 'material',
    code: 'LGS111WJBBH',
    field: 'spec',
    before: '',
    after: '详见明细 / xem chi tiết'
  }]);
});

test('admin save diff records multi-color drawer material changes', () => {
  const utils = loadCoreUtils();
  const previous = utils.normalizePayload({
    version: 3,
    updatedAt: '2026-07-09T05:00:00.000Z',
    bom: {},
    drawings: {},
    manuals: {},
    models3d: {},
    productImages: {},
    materialDb: {
      materials: {
        kd: {
          id: 'kd',
          code: 'BC255282166KD',
          name: { zh: 'LGS布抽25.7x28x16.8', vi: 'LGS布抽25.7x28x16.8' },
          spec: { zh: '257x280x168mm', vi: '257x280x168mm' }
        },
        wh: {
          id: 'wh',
          code: 'BC255282166WH',
          name: { zh: 'LGS布抽25.7x28x16.8', vi: 'LGS布抽25.7x28x16.8' },
          spec: { zh: '257x280x168mm', vi: '257x280x168mm' }
        },
        bh: {
          id: 'bh',
          code: 'BC255282166BH',
          name: { zh: 'LGS布抽25.7x28x16.8', vi: 'LGS布抽25.7x28x16.8' },
          spec: { zh: '257x280x168mm', vi: '257x280x168mm' }
        }
      },
      bomEntries: []
    }
  });
  const next = utils.normalizePayload(JSON.parse(JSON.stringify(previous)));
  Object.values(next.materialDb.materials).forEach((material) => {
    material.name = { zh: 'LGS布抽25.7x28.2x16.8', vi: 'LGS布抽25.7x28.2x16.8' };
    material.spec = { zh: '257x282x168mm', vi: '257x282x168mm' };
  });

  const changes = utils.describePayloadChanges(previous, next);

  assert.equal(changes.length, 6);
  assert.deepEqual(JSON.parse(JSON.stringify(changes.map((change) => `${change.code}:${change.field}`).sort())), [
    'BC255282166BH:name',
    'BC255282166BH:spec',
    'BC255282166KD:name',
    'BC255282166KD:spec',
    'BC255282166WH:name',
    'BC255282166WH:spec'
  ]);
});

test('admin save and viewer UI include a PDM notification center', () => {
  const adminHtml = readOutput('admin.html');
  const viewerHtml = readOutput('viewer.html');
  const appCore = readSourceTree();

  assert.match(adminHtml, /id="notificationButton"/);
  assert.match(viewerHtml, /id="notificationButton"/);
  assert.match(appCore, /appendNotificationEvent/);
  assert.match(appCore, /renderNotifications/);
  assert.match(appCore, /notificationBadge/);
  assert.match(appCore, /NOTIFICATION_REFRESH_MS/);
  assert.match(appCore, /describePayloadChanges\(remoteFile\.payload/);
});

test('viewer and core include browser-native 3D model support', () => {
  const viewerHtml = readOutput('viewer.html');
  const adminHtml = readOutput('admin.html');
  const appCore = readSourceTree();
  const dataJs = readOutput('data.js');
  const sandbox = { window: {} };
  Function('window', dataJs)(sandbox.window);

  assert.match(viewerHtml, /@google\/model-viewer/);
  assert.match(adminHtml, /@google\/model-viewer/);
  assert.match(appCore, /models3dFor/);
  assert.match(appCore, /data-model3d-row/);
  assert.match(appCore, /createElement\('model-viewer'\)/);
  assert.match(appCore, /data-model3d-row="\$\{index\}">\$\{escapeHTML\(this\.label\('viewDrawing'\)\)\}/);
  assert.match(appCore, /data-product-model3d-index="\$\{index\}">\$\{escapeHTML\(this\.label\('viewDrawing'\) \+ suffix\)\}/);
  assert.doesNotMatch(appCore, /originalDrawing/);
  assert.equal(sandbox.window.BOM_VIEWER_DATA.models3d.LGS133['lgs1333列3层9抽57inch'].length, 1);
  assert.match(sandbox.window.BOM_VIEWER_DATA.models3d.LGS133['lgs1333列3层9抽57inch'][0].previewUrl, /models3d\/catalog\/LGS133-3/);
});

test('parent-child structure parent list extracts localized fields and prevents [object Object]', () => {
  const appCore = readSourceTree();

  assert.doesNotMatch(appCore, /materialText\(parent,\s*'spec'/);
  assert.doesNotMatch(appCore, /materialText\(parent,\s*'attr'/);

  assert.match(appCore, /localizedValue\(parent\.spec,\s*this\.state\.lang\)/);
  assert.match(appCore, /localizedValue\(parent\.material,\s*this\.state\.lang\)/);
  assert.match(appCore, /localizedValue\(parent\.color,\s*this\.state\.lang\)/);
  assert.match(appCore, /localizedValue\(parent\.attr,\s*this\.state\.lang\)/);

  assert.match(appCore, /let attrHtml = '<td><span class="mdb-empty">-<\/span><\/td>';/);
  assert.match(appCore, /if\s*\(\s*attrVal\s*\)\s*\{/);
  assert.match(appCore, /<td><span class="mdb-empty">-<\/span><\/td>/);
});
