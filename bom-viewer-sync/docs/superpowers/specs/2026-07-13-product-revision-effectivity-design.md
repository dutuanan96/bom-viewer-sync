# Product Revision Effectivity Design

## Goal

Separate the latest product revision from the single revision that is effective for production. Creating a revision must not make it effective automatically. Releasing a draft revision must make it the only effective revision while preserving every older BOM snapshot and its release history.

## Scope

- Add one effective revision per product.
- Keep the latest revision and effective revision as separate concepts.
- Let an Admin release only the latest draft revision.
- Require a release reason and record the transition time.
- Preserve historical revisions as immutable snapshots.
- Display lifecycle and effectivity independently in Admin and Viewer.
- Preserve compatibility with payloads created before effectivity metadata existed.

The following are out of scope:

- Multi-user Review and Approved workflow stages.
- Directly reactivating an arbitrary historical revision.
- Restoring an old snapshot as a new revision.
- User identity or role management beyond the existing Admin/Viewer modes.

## Domain Model

Each `productRevisions[productCode]` record contains:

```js
{
  currentRevision: 'V3.1',
  effectiveRevision: 'V3',
  currentRevisionInfo: {
    sourceRevision: 'V3',
    createdAt: '2026-07-13T01:02:03.000Z',
    changeReason: 'Reduce height by 10mm',
    workflowState: 'draft'
  },
  revisions: [],
  effectivityEvents: []
}
```

`currentRevision` identifies the latest design revision. `effectiveRevision` identifies the only revision used for production. A revision is effective when its revision code equals `effectiveRevision`; effectivity is derived and is not duplicated as a mutable boolean on every revision.

An effectivity event contains:

```js
{
  id: 'effectivity_...',
  action: 'release',
  revision: 'V3.1',
  previousRevision: 'V3',
  occurredAt: '2026-07-13T02:03:04.000Z',
  reason: 'Approved for production'
}
```

## Compatibility Rules

- A legacy product without a revision registry treats its manual-derived revision as both current and effective, with lifecycle state `released`.
- A registry with a released current revision but no `effectiveRevision` treats the current revision as effective.
- A registry with a draft current revision but no `effectiveRevision` selects the nearest historical released revision. If none exists, it falls back to the source revision when that snapshot exists.
- Existing revision codes and snapshots are never renamed or deleted during normalization.

## State Transitions

### Create Revision

Given V3 is released and effective:

1. Snapshot V3.
2. Create V3.1 as the latest revision with lifecycle state `draft`.
3. Keep `effectiveRevision` set to V3.
4. Keep V3 read-only and effective.

### Release Current Revision

Release is allowed only when:

- The application is in Admin mode.
- The selected revision is the latest revision.
- The latest revision has lifecycle state `draft`.
- There are no unsaved BOM or material changes.
- A non-empty release reason is supplied.

The release operation:

1. Changes the current revision lifecycle state to `released`.
2. Moves `effectiveRevision` to the current revision.
3. Leaves the previous effective revision lifecycle state as `released` but makes it non-effective.
4. Appends one immutable effectivity event.
5. Marks the application payload dirty so the existing GitHub save flow persists the transition.

Repeated release of an already released revision and release of a historical revision are rejected without changing data.

## UI Behavior

All user-facing strings use i18n keys. The zh-CN labels are:

- Draft lifecycle: `草稿`
- Released lifecycle: `已发布`
- Effective revision: `使用中`
- Released but not effective: `非现行`
- Release action: `发布版本`

The revision selector identifies both lifecycle and effectivity, for example:

- `V3.1 · 草稿 · 非现行`
- `V3 · 已发布 · 使用中`

The BOM header shows lifecycle and effectivity as separate badges. The product catalog keeps the latest revision visible and also shows the effective revision so a draft V3.1 cannot be mistaken for the production revision.

Admin sees `发布版本` only for the latest draft revision. Selecting any historical revision remains read-only. Viewer can inspect all revisions and their statuses but cannot mutate them.

## Persistence

The release operation mutates only the normalized application payload. It does not write `data.js` directly. The existing Admin GitHub save path continues to fetch the current remote payload and SHA, preserve remote notification history, serialize `productRevisions`, and then issue the PUT.

## Error Handling

Domain operations use stable error codes for missing products, missing reasons, non-draft revisions, historical selections, and duplicate release attempts. The application maps those codes to i18n status messages. Invalid transitions are atomic and leave the registry unchanged.

## Verification

- Domain regression tests for legacy normalization, draft creation, effective-revision preservation, release, and rejected transitions.
- UI contract tests for separate lifecycle/effectivity badges, selector labels, and release-action visibility.
- GitHub adapter regression confirming effectivity metadata and event history survive serialization.
- Full `npm run build`, `npm run check`, `node --check app-admin.js`, and `git diff --check` gates.
- Browser smoke using LGS032: V3 remains effective while V3.1 is draft; releasing V3.1 makes it the only effective revision; V3 remains viewable and read-only.
- `git diff -- data.js` must remain empty.
