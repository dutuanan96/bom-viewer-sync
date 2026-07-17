# Knowledge Pack Index

This directory contains R1 AI knowledge packs for the JinTai PDM AI Assistant.

## Structure

```
knowledge/
  README.md                  — this file
  ai/
    prompt-pack.json          — role prompts and task envelope format
    skills.json               — AI skill definitions and tool authorizations
  pdm-expert-pack.json        — PDM domain expert context
  marketplace-aliases.json    — user-confirmed external SKU alias mappings
```

## Governance

- All aliases in `marketplace-aliases.json` must be **user-confirmed**. ASIN codes and external identifiers are only included after explicit user approval.
- `skills.json` tool IDs must exist in `src/features/ai-assistant/contracts.js` ALLOWED_TOOLS.
- `prompt-pack.json` is a structured index only — the authoritative role prompts are maintained externally.
- Do not hardcode Chinese or Vietnamese strings in source JavaScript. Use i18n keys.

## Scope

These packs support Release 1 (R1) — Deterministic PDM Intelligence. They are read-only and do not grant mutation authority.
