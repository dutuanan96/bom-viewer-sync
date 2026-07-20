import { ALLOWED_TOOLS } from './contracts.js';

const INTENT_TO_SPECIALIST = Object.freeze({
  revision_status: 'revision',
  bom_lookup: 'bom_lookup',
  bom_compare: 'bom_comparison',
  material_detail: 'material_usage',
  material_usage: 'material_usage',
  marketplace: 'marketplace',
  sku_alias: 'marketplace',
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}

function requirePack(pack, label) {
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) throw new Error(`${label} pack is required`);
  if (!pack.schemaVersion || !pack.packVersion || !pack.updatedAt) throw new Error(`${label} pack metadata is invalid`);
}

export function createPdmSkillRegistry({ promptPack, skillsPack } = {}) {
  requirePack(promptPack, 'prompt');
  requirePack(skillsPack, 'skills');

  const governedTools = new Set((skillsPack.skills || []).map(skill => skill?.id).filter(Boolean));
  governedTools.add('submit_proposal');
  const specialists = new Map();

  for (const raw of promptPack.specialists || []) {
    if (!raw?.id || specialists.has(raw.id)) throw new Error('Specialist IDs must be present and unique');
    if (!Array.isArray(raw.instructions) || raw.instructions.length === 0 || raw.instructions.some(item => !String(item).trim())) {
      throw new Error(`Specialist ${raw.id} instructions are required`);
    }
    if (!Array.isArray(raw.verification) || raw.verification.length === 0) {
      throw new Error(`Specialist ${raw.id} verification rules are required`);
    }
    if (!Array.isArray(raw.allowedTools) || raw.allowedTools.length === 0) {
      throw new Error(`Specialist ${raw.id} allowedTools are required`);
    }
    for (const toolName of raw.allowedTools) {
      if (!governedTools.has(toolName) || !ALLOWED_TOOLS.has(toolName)) {
        throw new Error(`Specialist ${raw.id} references unauthorized tool: ${toolName}`);
      }
    }
    specialists.set(raw.id, deepFreeze({
      id: raw.id,
      allowedTools: [...raw.allowedTools],
      evidenceRequired: raw.evidenceRequired === true,
      doNotUse: String(raw.doNotUse || ''),
      instructions: raw.instructions.map(String),
      verification: raw.verification.map(String),
      packVersion: promptPack.packVersion,
    }));
  }

  function select(route) {
    if (route?.confidence !== 'deterministic') return null;
    const specialistId = INTENT_TO_SPECIALIST[route?.intent];
    return specialistId ? specialists.get(specialistId) || null : null;
  }

  function promptFor(skill) {
    if (!skill) return '';
    const registered = specialists.get(skill.id);
    if (registered !== skill) throw new Error('Specialist is not registered');
    return [
      `PDM SPECIALIST: ${skill.id} (pack ${skill.packVersion})`,
      ...skill.instructions.map(item => `- ${item}`),
      `- Allowed evidence tools: ${skill.allowedTools.join(', ')}`,
      `- Do not use: ${skill.doNotUse}`,
      ...skill.verification.map(item => `- Verify: ${item}`),
    ].join('\n');
  }

  return Object.freeze({
    select,
    promptFor,
    diagnostics: () => Object.freeze({ packVersion: promptPack.packVersion, specialistCount: specialists.size }),
  });
}
