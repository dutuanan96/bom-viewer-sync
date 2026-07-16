# JinTai PDM/BOM Viewer Release

Build, verification, and publication procedure for the canonical project.
Publication is a separate approved action after review and merge.

## Source Of Truth

The canonical project is:

```text
work/remote-bom-viewer-sync/bom-viewer-sync/
```

Outer `outputs/` and Desktop runtime folders are non-canonical mirrors. Never
edit a mirror as source or copy mirror data into canonical `data/`.

## Publication Scope

Runtime publication contains one adjacent build set:

```text
admin.html
app-admin.js
styles.css
viewer.html
```

Repository documentation remains on GitHub and is not required beside the
portable runtime files.

Do not publish:

- `data.js`
- `data/`
- credentials or tokens
- worktrees
- evidence archives
- local review artifacts

Runtime data changes use the Admin exact 24 shards save flow. They are not part
of code or mirror publication.

## Preconditions

1. The change is reviewed and merged.
2. Publication has separate approval.
3. Canonical `main` matches `origin/main`.
4. The tracked worktree is clean.
5. Dependencies are installed from the lockfile.
6. Generated artifacts are current.
7. Repository gates and data audit pass.
8. Browser smoke passes when runtime behavior changed.

## Canonical Build And Verification

Use PowerShell and Git for Windows:

```powershell
git fetch origin --prune
git switch main
git pull --ff-only origin main
npm ci
npm run build
node --check app-admin.js
npm run check
npm run audit:data
git diff --check
git diff --ignore-cr-at-eol --name-only
git diff -- data.js data
```

The final two commands must show no unintended runtime data change.

## Mirror Publication

Copy all four generated runtime files together. Do not mix files from different
builds.

Check the embedded build ID:

```powershell
rg -n "pdm-build" admin.html viewer.html
```

Verify each mirror with SHA-256:

```powershell
$names = @(
  'admin.html',
  'app-admin.js',
  'styles.css',
  'viewer.html'
)

foreach ($name in $names) {
  $canonical = (Get-FileHash -LiteralPath $name -Algorithm SHA256).Hash
  $mirrorPath = Join-Path '..\outputs' $name
  $mirror = (Get-FileHash -LiteralPath $mirrorPath -Algorithm SHA256).Hash
  [pscustomobject]@{
    Name = $name
    Match = $canonical -eq $mirror
    Hash = $canonical
  }
}
```

Repeat the hash comparison for the approved Desktop runtime folder. Every
published file must match canonical `main`.

## Browser Acceptance

When runtime behavior changed, verify:

- Viewer loads through the required portable `file://` flow.
- Admin loads without performing a GitHub save.
- Product, BOM, material, revision, and structure navigation works.
- One material PDF opens when the scope affects documents.
- One GLB/GLTF renders when the scope affects models.
- Browser console remains clean.

No GitHub data mutation is part of browser smoke unless separately approved.

## Publication Report

Record:

- Canonical branch and exact commit.
- Build ID.
- Gate and data audit results.
- Canonical/output hash equality.
- Canonical/Desktop hash equality.
- Browser acceptance evidence.
- Files copied.
- Confirmation that no data shard, credential, or token was published.
