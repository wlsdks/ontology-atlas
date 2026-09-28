---
title: Restore access to a connected Gray Area source
doc_type: spec
status: draft
area: analysis
date: 2026-09-28
decisions: [90154cfa-a838-4a23-ad93-9a09af2d9e92]
---

# Restore access to a connected Gray Area source

## Person and moment

A developer opened a synthetic ontology through the installed app's native folder picker, then requested Gray Area evidence for code already connected by CLI. The separate code folder had never been selected in this app. Preview and Retry both showed a generic refusal. Root observed this on installed identity `c1d815108b505f1147bf63e59e745bade19229684ee74f3c5f9d142b0af29229`; `/tmp/atlas-gray-area-audit/grant-incident/po-pass.md` records the observed recovery loss and review route.

## Today

- Source base `11c32628b`: `src-tauri/src/gray_area_scope.rs:94` applies the content grant gate to the bound root. `src-tauri/src/lib.rs:214` refuses ungranted content roots; `:233` deliberately gives inventory-only source inspection a separate gate. Preserve both boundaries.
- `src/features/gray-area/ui/GrayAreaInspector.tsx:94` collapses almost every preview failure into `grayArea.unavailable`, `connectHint`, and Retry. There is no source-folder picker on this route.
- The fixture's one binding names `/private/tmp/atlas-gray-area-audit/native/source`, has a valid receipt, and prescribes `use_current_evidence`. Passive inspection failure preserves that receipt (`src/views/home/model/use-project-source-model.ts:142`). Its picker is offered only for `connect_source` or `repair_source_binding` (`:163`, `:343`); remeasurement reuses the stored root (`:355`). Thus existing project controls do not provide this recovery.
- `pickTauriVaultDirectory` uses the genuine native picker (`src/shared/lib/tauri-vault-fs.ts:444`); Rust canonicalizes and validates the selected location before granting it (`src-tauri/src/lib.rs:1605`). Reuse this path. The standing Gray Area decision `83ae5afc-2d54-49d8-b901-e5c8ffb14e1a` requires a bound-folder preview before inspection; `docs/PRODUCT-DIRECTION.md:24` requires a person to inspect and correct evidence.

## Problem and alternatives

**First and only slice:** make the existing folder-permission refusal recoverable where it occurs. Retry cannot supply a missing user selection. Source analysis confirms the gap; this planner performed no UI actions and makes no additional usability claim.

| Option | Value, usability, cost, and local-first fit | Choice |
|---|---|---|
| Keep Retry and the generic hint | Zero change cost; the person repeats the same refusal locally | Reject: no recovery |
| Send the person through project binding controls | Reuses a screen, but a valid binding offers no picker; adding general rebinding expands scope | Later only for a separate binding-management problem |
| Offer the existing picker for this exact refusal | One explicit local choice restores access while preserving the recorded project and scope | Choose; no new grant command or permission bypass |

## Flow

1. When the person opens Gray Area and only the bound source fails its content grant gate, Atlas identifies `source-root-not-granted` and shows `grayArea.sourceAccessRequired`, `sourceAccessHint` with the complete bound folder path, and `selectSourceFolder`. A missing vault grant, known invalid/ambiguous binding metadata, unavailable folder, unsafe path, platform limit, or changing/oversized evidence stays in its existing refusal category. A generic exception never becomes permission to select a source.
2. When the person chooses `selectSourceFolder`, Atlas calls the existing `pickTauriVaultDirectory` with `sourcePickerTitle`. The selected scope and project binding stay in place. The action is busy until this picker/re-preview attempt settles; repeated activation cannot open another picker.
3. When the person cancels, Atlas keeps the access-required state and its action, restoring focus to the trigger. When picking fails or rejects the location, Atlas adds `sourceSelectionFailed` and allows another selection. Neither outcome starts an inspection.
4. When the person selects a folder, the existing native picker applies its normal grant rules. Atlas re-previews the original project binding and checks the selected folder against that bound root by native canonical identity, accepting aliases such as `/tmp` and `/private/tmp`. A different sibling, parent, or child yields `sourceSelectionMismatch` and remains refused. This recovery never substitutes the chosen folder into the binding or reads its contents. The picker's legitimate grant to a different chosen folder remains ordinary picker behavior.
5. When the matching folder is granted and the original binding is still the same, Atlas shows the existing bound-folder preview and `grayArea.inspectFolder`. Only that separate action begins the existing bounded inspection. If the binding, selected project, or scope changes while picking or re-previewing, discard the attempt's completion and require a fresh preview for the current selection.

The existing preview command supplies this one recovery error as `{ code: "source-root-not-granted", sourcePath, bindingDigest }`, derived from the structurally valid binding in the already granted vault; other failures retain their existing categories. This metadata grants no access. Re-preview sends the picker-returned path as `selectedSourcePath` plus the captured `expectedBindingDigest` to the same command. Native code compares canonical selected/bound roots and the binding digest, returning `source-root-selection-mismatch` or existing `binding_changed` on disagreement; the existing content grant and source-identity checks still govern success. Before source access, validate only binding metadata from the granted vault. Git/source identity verification runs after the existing source content-grant gate succeeds; an identity mismatch found then keeps its existing refusal. No ungranted Git metadata is read to classify identity. No new grant command or renderer-created authority is introduced.

## States

| State | Web | macOS app |
|---|---|---|
| Empty | Existing `grayArea.webLimit` / `webStillWorks`; read map/documents | Existing `grayArea.localFolderRequired`; open a local vault |
| Access required | Out of scope — no native picker; existing web degradation | `sourceAccessRequired` + `sourceAccessHint` + `selectSourceFolder`; choose the connected folder |
| Loading | Out of scope — no native picker | Keep `selectSourceFolder` visibly busy/disabled; wait or cancel the OS picker |
| Error: selection failed or mismatched | Out of scope — no native picker | `sourceSelectionFailed` or `sourceSelectionMismatch` plus `selectSourceFolder`; choose again |
| Partial: other refusal | Existing `grayArea.webLimit`; read documents | Existing `unavailable` / `connectHint` / `retry`, or `platformLimit`; source recovery is absent |
| Ready to inspect | Existing web degradation | Existing `preview`, `previewLimit`, `inspectFolder`; decide whether to inspect |
| Largest measured vault | No new scale claim | One project binding in the seven-concept fixture; recovery opens no scan and preserves the current scope |

## Copy

Add only these keys under `grayArea` in `messages/en/grayArea.json` and `messages/ko/grayArea.json`; those catalogues hold the exact English/Korean strings. Existing preview, inspection, and generic refusal copy stays in use.

| Key | Where it appears | English |
|---|---|---|
| `sourceAccessRequired` | Bound source needs an app grant | This app needs permission to read the connected code folder. |
| `sourceAccessHint` | Below access explanation | Select the connected folder: {path}. You will confirm the inspection afterward. |
| `selectSourceFolder` | Recovery action | Select connected code folder |
| `sourcePickerTitle` | Native folder picker title | Select the connected code folder |
| `sourceSelectionFailed` | Picker failed or location was rejected | Atlas could not use that folder selection. Select the connected code folder again. |
| `sourceSelectionMismatch` | Selected folder differs from the bound root | This is not the connected code folder. Select the connected folder to continue. |

## Edge cases

- Zero or multiple bindings remain existing refusals; exactly one valid binding is required. First run has no source to recover. Hangul names and canonical path aliases follow the existing native picker.
- Cancel, rejected location, missing/moved folder, identity mismatch, and concurrent binding/selection changes leave evidence unmeasured. A native picker choice is the sole new grant event; a renderer-supplied path or CLI sidecar cannot grant access.
- Offline recovery stays local. Reopening a granted folder may reuse the existing persisted grant. A source's inferred parent-repository inventory grant does not authorize its content reads.

## Out of scope

General source rebinding, new Rust grant commands, widening `canonical_root` to the inventory gate, implicit grants from sidecars, automatic scans, canonical Markdown/sidecar writes, provider calls, new routes, and redesign of the inspector or project controls. Each exceeds the observed permission-recovery loss.

## Acceptance criteria

1. Given a granted vault and one valid but ungranted bound source, when preview runs, then preview returns the typed `source-root-not-granted` error with that binding's path/digest and no source-content reads or MCP collection. Missing vault grant, known malformed/ambiguous binding metadata, unsafe path, and unavailable source keep their own refusal. Verify Git/source identity only after the content grant succeeds; a mismatch then keeps its existing refusal. Prove with focused Rust Gray Area cases under enforced `vault_grants::EnforcedScope`.
2. Given that category in the inspector, when rendered in either locale, then the new explanation names the bound folder path and the picker action appears; generic refusals and the web surface do not offer it. Prove in `GrayAreaInspector.test.tsx` with the real locale catalogues and distinct error cases.
3. Given the recovery action, when the picker is cancelled, fails, or returns a different sibling/parent/child root, then the inspector remains refused, preserves binding/scope, permits another selection, and never calls `readGrayAreaEvidence`. Prove UI cancellation/failure tests plus native canonical mismatch cases; assert the existing picker is the only grant source.
4. Given the genuine picker selects the original bound root, including an equivalent canonical alias, when re-preview succeeds, then the original source path and binding identity appear and no scan starts until `inspectFolder` is pressed. If binding/project/scope changes meanwhile, the obsolete completion is discarded. Prove native preview identity cases and component race/scan-boundary tests.
5. Given the installed synthetic fixture from the observed incident, when root repeats Cancel, wrong-folder, correct-folder, preview, and explicit Inspect, then fresh screenshot/AX evidence shows recovery and results only after Inspect. Record deployed identity, unchanged binding bytes, and unchanged canonical Markdown; no provider request is sent. This installed replay remains required after implementation.

Planned focused implementation commands: `cargo test --manifest-path src-tauri/Cargo.toml gray_area`; `pnpm test:run src/features/gray-area/ui/GrayAreaInspector.test.tsx`; then `pnpm checks:changed -- --run` and its recommendations. These implementation checks have not run in this planning slice.

## Risks

1. Generic errors expose a permission action for an unsafe root; classify only the exact bound-source content-grant failure and probe other refusals.
2. Wrong-folder selection or a late async completion changes the target; preserve binding identity, compare canonical roots, and discard changed-scope attempts.
3. Selecting a folder starts content collection before the person sees its path; assert zero scans through recovery and keep the separate Inspect action in native proof.

## Later

None — broader project-source regrant/rebinding UX needs its own observed recovery case.

## Owner question

None — use the existing genuine native picker and fail closed through the existing source gate; the owner has authorized the observed repair.
