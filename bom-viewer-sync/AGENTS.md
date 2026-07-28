# JinTai PDM Agent Instructions

Read these files before changing this repository:

1. `AI_DEBUG_GUIDE.md`
2. `docs/ARCHITECTURE.md`
3. `docs/PDM_AI_MAINTENANCE.md`
4. `docs/RELEASE.md`

## Non-negotiable boundaries

- Edit source under `src/`, `scripts/`, `knowledge/`, and `tests/`.
- Never hand-edit `admin.html`, `app-admin.js`, `viewer.html`, or `styles.css`.
  Regenerate them with `npm run build`.
- Canonical runtime data is the exact shard set under `data/`.
- `data.js` is a rollback artifact, not a runtime source.
- Viewer remains read-only.
- AI mutations are Admin-only structured local proposals. They never execute
  arbitrary code and never invoke the final GitHub save.
- Admin reviews, selects, and approves local proposal operations. Admin remains
  the final authority for GitHub publication.
- Released and historical revisions are immutable.
- PDM user-facing text must use zh-CN i18n keys.
- Never commit credentials, API keys, raw prompts, local absolute paths, logs,
  browser profiles, or temporary review output.

## Extending an AI Admin capability

1. Identify the existing Admin button or domain workflow.
2. Reuse its domain function or reproduce only its deterministic state
   transition.
3. Add one exact operation schema in
   `src/features/ai-assistant/contracts.js`.
4. Add context guards, risk, warnings, transaction logic, and verification in
   `src/features/ai-assistant/mutation-engine.js`.
5. Expose the exact schema in the AI tool description and knowledge pack.
6. Add i18n labels and proposal-review rendering when a new category is needed.
7. Add contract, transaction, diff, UI, and E2E coverage.
8. Build generated artifacts and run the gates in
   `docs/PDM_AI_MAINTENANCE.md`.

Do not grant the model a generic code, DOM, filesystem, network-write, or
GitHub-write tool to imitate an Admin button.
