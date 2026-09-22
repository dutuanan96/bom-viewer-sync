import assert from 'node:assert/strict';
import test from 'node:test';

import { BomApplication, coreUtils } from '../src/application.js';
import {
  releaseProductRevision,
  setEcnReleasePrerequisiteEvidence,
} from '../src/domain/revisions.js';

function gatedPayload() {
  return coreUtils.normalizePayload({
    bom: {
      LGS433: { revision: 'V5' },
      LGS434: { revision: 'V6' },
      P1: { revision: 'V2' },
    },
    productRevisions: {
      LGS433: {
        currentRevision: 'V5',
        currentRevisionInfo: {
          sourceRevision: 'V4.1',
          workflowState: 'draft',
          releasePrerequisites: {
            gateId: 'ECN-LGS433-V5-LGS434-V6-DRAWINGS',
            layerDrawingsVerified: false,
            assemblyDrawingsVerified: false,
            weldedFootGeometryVerified: false,
          },
        },
      },
      LGS434: {
        currentRevision: 'V6',
        currentRevisionInfo: {
          sourceRevision: 'V5.2',
          workflowState: 'draft',
          releasePrerequisites: {
            gateId: 'ECN-LGS433-V5-LGS434-V6-DRAWINGS',
            layerDrawingsVerified: false,
            assemblyDrawingsVerified: false,
            weldedFootGeometryVerified: false,
          },
        },
      },
      P1: {
        currentRevision: 'V2',
        currentRevisionInfo: { workflowState: 'draft' },
      },
    },
    materialDb: { materials: {}, bomEntries: [] },
  });
}

test('LGS433 V5 and LGS434 V6 individual release is blocked until all ECN evidence is verified', () => {
  const payload = gatedPayload();
  assert.throws(
    () => releaseProductRevision(payload, 'LGS433', 'V5', { reason: 'release' }),
    /ECN_RELEASE_PREREQUISITES_INCOMPLETE/,
  );
  assert.throws(
    () => releaseProductRevision(payload, 'LGS434', 'V6', { reason: 'release' }),
    /ECN_RELEASE_PREREQUISITES_INCOMPLETE/,
  );

  setEcnReleasePrerequisiteEvidence(payload, 'LGS433', {
    layerDrawingsVerified: true,
    assemblyDrawingsVerified: true,
    weldedFootGeometryVerified: true,
  });
  setEcnReleasePrerequisiteEvidence(payload, 'LGS434', {
    layerDrawingsVerified: true,
    assemblyDrawingsVerified: true,
    weldedFootGeometryVerified: true,
  });
  const reloadedPayload = coreUtils.normalizePayload(structuredClone(payload));
  assert.equal(reloadedPayload.productRevisions.LGS433.currentRevisionInfo.releasePrerequisites.assemblyDrawingsVerified, true);
  assert.equal(reloadedPayload.productRevisions.LGS434.currentRevisionInfo.releasePrerequisites.weldedFootGeometryVerified, true);
  releaseProductRevision(reloadedPayload, 'LGS433', 'V5', { reason: 'release' });
  releaseProductRevision(reloadedPayload, 'LGS434', 'V6', { reason: 'release' });
  assert.equal(reloadedPayload.productRevisions.LGS433.currentRevisionInfo.workflowState, 'released');
  assert.equal(reloadedPayload.productRevisions.LGS434.currentRevisionInfo.workflowState, 'released');
});

test('ordinary unrelated product revision release is unaffected', () => {
  const payload = gatedPayload();
  releaseProductRevision(payload, 'P1', 'V2', { reason: 'release' });
  assert.equal(payload.productRevisions.P1.currentRevisionInfo.workflowState, 'released');
});

test('post-save batch release is blocked before any gated revision is mutated', async () => {
  const app = Object.create(BomApplication.prototype);
  app.state = { payload: gatedPayload(), dirty: false };
  app.label = (key) => key;
  app.openPdmConfirm = (_message, onConfirm) => onConfirm();
  app.openPdmPrompt = (_title, _fields, onConfirm) => onConfirm({ releaseReason: 'release' });
  app.setStatus = (message) => { app.error = message; };
  let writeCalled = false;
  app.writeGithubData = async () => { writeCalled = true; };

  app.offerBatchRelease(['LGS433', 'LGS434'], 'token');
  await Promise.resolve();

  assert.equal(writeCalled, false);
  assert.equal(app.state.payload.productRevisions.LGS433.currentRevisionInfo.workflowState, 'draft');
  assert.equal(app.state.payload.productRevisions.LGS434.currentRevisionInfo.workflowState, 'draft');
  assert.match(app.error, /ECN_RELEASE_PREREQUISITES_INCOMPLETE/);
});
