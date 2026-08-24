# JinTai PDM/BOM Viewer

Project entrypoint for the canonical browser-based PDM/BOM Viewer and Admin
application.

## Documentation

- [`AI_DEBUG_GUIDE.md`](AI_DEBUG_GUIDE.md) - operational workflow for AI
  assistants and engineers changing the repository.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) - stable system architecture,
  domain rules, and runtime data flow.
- [`docs/RELEASE.md`](docs/RELEASE.md) - build, verification, and approved
  publication procedure.
- [`docs/PDM_AI_MAINTENANCE.md`](docs/PDM_AI_MAINTENANCE.md) - current AI
  capabilities, mutation contracts, evaluation, and future-agent handoff.
- [`AGENTS.md`](AGENTS.md) - repository rules loaded by compatible coding
  agents.
- `docs/superpowers/specs/`, `docs/superpowers/plans/`, and
  `docs/superpowers/reports/` - historical design and execution evidence.

Historical documents are evidence, not current operational instructions.

## Runtime

The project produces two standalone browser entrypoints:

- `viewer.html` for read-only product, BOM, material, and structure access.
- `admin.html` with `app-admin.js` for authorized editing and GitHub-backed
  saves.

Runtime data is stored in manifest-defined shards under:

```text
data/manifest.json
data/materials.json
data/products/*.json
```

`data.js` is a rollback and migration snapshot. It is not a runtime source.

## Development

Requirements:

- PowerShell.
- Git for Windows.
- Node.js and npm.

Install and verify:

```powershell
npm ci
npm run check
npm run audit:data
```

Build inputs live under `src/`. Generated artifacts are never hand-edited:

```text
admin.html
app-admin.js
viewer.html
styles.css
```

Regenerate them with:

```powershell
npm run build
```

## Repository Safety

- Do not change `core.autocrlf`.
- Use `git diff --ignore-cr-at-eol` for semantic diff inspection.
- Keep credentials and machine-specific paths out of tracked files.
- Keep PDM user-facing text in zh-CN i18n dictionaries.
- Treat outer `outputs/` and Desktop copies as release mirrors only.
- Mirrors are non-canonical and may intentionally lag reviewed `main`.
- Do not push, create a PR, merge, mutate GitHub data, or publish mirrors
  without the required approval.
