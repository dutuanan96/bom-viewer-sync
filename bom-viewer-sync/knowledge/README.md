# Knowledge Pack Index

This directory contains governed AI knowledge packs for the JinTai PDM
Assistant.

## Structure

```text
knowledge/
  README.md
  ai/
    prompt-pack.json
    skills.json
    pdm-eval-corpus.json
  pdm-expert-pack.json
  marketplace-aliases.json
```

## Governance

- All aliases in `marketplace-aliases.json` must be user-confirmed.
- Tool IDs in `skills.json` must exist in the allowlist in
  `src/features/ai-assistant/contracts.js`.
- Mutation names and payload shapes must match the exact JavaScript contracts.
- Knowledge packs cannot grant tools or mutation authority.
- Canonical PDM shard evidence overrides knowledge, model inference, web
  information, and browser-local memory.
- Do not hardcode Chinese or Vietnamese UI strings in JavaScript. Use i18n keys.
- Never store credentials, raw prompts, hidden reasoning, or provider payloads
  in knowledge packs.

## Scope

These packs support deterministic PDM retrieval, engineering drawing analysis,
governed memory and improvement review, and Admin-only structured proposal
operations. The JavaScript contracts and mutation engine remain authoritative.
