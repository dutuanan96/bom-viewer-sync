import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRawPipeLength,
  parseDimensions,
  calculateDynamicCncCuts,
  calculateComponentCutGeometry,
  findOptimalRawPipe,
  CNC_CLAMPING_STANDARDS,
} from '../src/features/ai-assistant/pdm-ontology.js';

test('Dynamic Parametric Manufacturing Engine', async t => {
  await t.test('parseRawPipeLength parses lengths correctly', () => {
    assert.equal(parseRawPipeLength('15×15×0.6Tmm，长度 6013mm'), 6013);
    assert.equal(parseRawPipeLength('15×15×0.6Tmm，长度 5814mm'), 5814);
    assert.equal(parseRawPipeLength('30×15×0.6Tmm，长度 5014mm'), 5014);
    assert.equal(parseRawPipeLength('Invalid spec'), 0);
  });

  await t.test('calculateDynamicCncCuts computes cuts, rate, and detects shortage risk', () => {
    // Foot 41 on 6013mm raw tube
    const foot41 = calculateDynamicCncCuts(6013, 41.5);
    assert.equal(foot41.cuts, 143);
    assert.equal(foot41.rate, 0.006993);
    assert.equal(foot41.clampWaste, 78.5);
    assert.equal(foot41.isShortageRisk, false);
    assert.equal(foot41.isWasteOptimal, true);

    // Foot 54 on 6013mm raw tube
    const foot54 = calculateDynamicCncCuts(6013, 54.0);
    assert.equal(foot54.cuts, 110);
    assert.equal(foot54.rate, 0.009091);
    assert.equal(foot54.clampWaste, 73.0);
    assert.equal(foot54.isShortageRisk, false);
    assert.equal(foot54.isWasteOptimal, true);

    // Future new pipe: 5800mm with Foot 41
    const foot41Future = calculateDynamicCncCuts(5800, 41.5);
    assert.equal(foot41Future.cuts, 138);
    assert.equal(foot41Future.rate, 0.007246);
    assert.equal(foot41Future.clampWaste, 73.0);
    assert.equal(foot41Future.isShortageRisk, false);
  });

  await t.test('calculateComponentCutGeometry computes accurate cut lengths for all topologies', () => {
    // U-bend with M6 caps (647x290x15mm)
    const uBendWithCaps = calculateComponentCutGeometry('647x290x15mm', { type: 'u_bend', hasM6Cap: true });
    assert.equal(uBendWithCaps.cutLength, 1578); // (647-3)*2 + 290 = 1578

    // U-bend with flush weld nuts (584x290x15mm)
    const uBendFlush = calculateComponentCutGeometry('584x290x15mm', { type: 'u_bend', hasM6Cap: false });
    assert.equal(uBendFlush.cutLength, 1458); // 584*2 + 290 = 1458

    // Spliced beam (754x15x15mm)
    const spliced = calculateComponentCutGeometry('754x15x15mm', { type: 'spliced_beam' });
    assert.equal(spliced.cutLength, 714); // 754 - 40 = 714

    // Support frame (335x178x15mm)
    const support = calculateComponentCutGeometry('335x178x15mm', { type: 'support_frame' });
    assert.equal(support.cutLength, 691); // 178*2 + 335 = 691

    // Composite LED frame vertical posts (576x335x15mm)
    const ledPosts = calculateComponentCutGeometry('576x335x15mm', { type: 'composite_led_vertical_posts' });
    assert.equal(ledPosts.cutLength, 1146); // (576-3)*2 = 1146 (573mm each)

    // Composite LED frame cross bar (576x335x15mm)
    const ledCross = calculateComponentCutGeometry('576x335x15mm', { type: 'composite_led_cross_bar' });
    assert.equal(ledCross.cutLength, 305); // 335 - 30 = 305
  });

  await t.test('findOptimalRawPipe chooses the best raw pipe length minimizing clamp waste', () => {
    const candidates = [
      { code: 'PIPE_5000', spec: '15x15x0.6Tmm, 长度 5000mm' },
      { code: 'PIPE_5598', spec: '15x15x0.6Tmm, 长度 5598mm' },
      { code: 'PIPE_6091', spec: '15x15x0.6Tmm, 长度 6091mm' },
    ];
    // For a support frame of 691mm (8 cuts = 5528mm)
    const optimal = findOptimalRawPipe(candidates, 691);
    assert.ok(optimal.optimal);
    assert.equal(optimal.optimal.code, 'PIPE_5598');
    assert.equal(optimal.optimal.clampWaste, 70);
    assert.equal(optimal.optimal.cuts, 8);
  });
});
