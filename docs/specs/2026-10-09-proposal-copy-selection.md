---
title: Keep proposal selection intact through copy and apply
doc_type: spec
status: current
area: agents
date: 2026-10-09
decisions: []
---

# Keep proposal selection intact through copy and apply

## Person and moment

An agent user unchecks an edit and copies the rest for their terminal agent. The controlled actual-component baseline showed First edit unchecked, Later edit selected, “Copied,” and one clipboard call in `/tmp/atlas-proposal-copy-proof/baseline-unchecked-copy.png`; the matching full accessibility tree `/tmp/atlas-proposal-copy-proof/baseline-unchecked-copy.ax.txt` and the recorded function probe establish exported `EARLIER_CONTENT` (native CUA Chrome; iab unavailable; `http://127.0.0.1:4297/?guides=off`). No real end-user incident or installed-app proof was observed.
PO: `review`, lenses moment/evidence/boundaries; human correction affected, other boundaries unchanged. Design proof: affected-state audit, agent-handoff walkthrough, computer-use baseline/checkpoint/final. This restores inspect/reject/correct control (`docs/PRODUCT-DIRECTION.md:24-35`).

## Today

Before-state source references below are pinned to `dcfbe2753` (the implementation base); they describe the observed baseline, not the repaired behavior.

- Apply rejects same-file selection gaps; clipboard export does not (`src/features/vault-agent/model/proposal-applier.ts:78-112`, `:145-162`).
- The card sets Copied immediately after a void callback; the hook never awaits clipboard (`src/widgets/vault-agent-panel/ui/AgentProposalCard.tsx:72`, `:219-235`; `src/widgets/vault-agent-panel/model/use-vault-agent.ts:500-503`).
- Title counts edits; volume counts file occurrences and Set membership; expanded diff also uses Sets, omitting repeated-line deletion/reordering (`AgentProposalCard.tsx:77-79`, `:109-115`, `:332-355`; `proposal-applier.ts:166-185`).
- Existing 22 tests passed despite controlled failures.
- Vault boundaries are consented document writes, recovery, and meaning proposals (`docs/ontology/elements/agent-proposal-applier.md:13-23`; `docs/ontology/capabilities/vault-conversation-agent.md:16-28`).
- App-only conversation/terminal packet remain the standing shape (`docs/DECISIONS.md:4613-4619`; `src/widgets/vault-agent-panel/ui/VaultAgentPanel.tsx:538-545`). Installed clipboard behavior and whole-vault scale remain unknown.

## Problem and alternatives

Rank repairs by returned control: (1) exclude unchecked content, (2) truthful copy completion and retry, (3) accurate net counts and edit preview. Causes: separate selection rules, initiation treated as completion, per-step/Set comparison.

| Option | Value/usability | Cost, feasibility, local-first fit | Choice |
|---|---|---|---|
| Keep today | Familiar; exclusions/success can be false | No cost; local but unreliable | Reject: control remains broken |
| Auto-select predecessors | Complete chain; reverses explicit exclusions | Cheap/local; changes chosen scope | Reject: loses rejection ability |
| Block gaps, await copy, show ordered net/edit differences | Explicit selection; repair/retry in existing card | Bounded work using existing local operations | Choose |

First slice restores these three contracts. Users lose invalid/empty copy operations; their proposal stays editable without another model request.

## Flow

1. When the person changes selection, Atlas clears old copy success/error and updates unique selected-path counts and valid original-to-final line totals; Apply still counts selected edit rows.
2. When a selected later edit needs an unchecked same-file predecessor, Atlas keeps the card pending, shows `proposal.selectionConflict` naming the path, disables Apply/Copy, and performs neither write nor clipboard operation. It retains selected file counts, hides executable line totals, and changes no checkboxes. Selecting earlier or unchecking later restores the action.
3. When the person expands an edit, Atlas shows its ordered added/removed lines, including duplicate occurrences and reordered lines, in the existing preview layout. Unread-document warnings remain when evidence is missing.
4. When the person copies valid nonempty edits, Atlas shows `proposal.copying` and emits one final complete body per selected path. Copy stays disabled until the entire local operation settles, including when selection/proposal changes; selection/Cancel remain usable. Editing or retiring the proposal retires success/error feedback separately from the operation lock, so an old clipboard fallback cannot overwrite a newer successful copy.
5. When the actual local operation succeeds for the current selection, Atlas shows `proposal.copied`; failure/unavailability/false/throw shows `proposal.copyFailed` and enables retry with checks intact. Successful local fallback counts as success; late completion cannot mark changed selection copied. Applying retains existing freshness, qualification, save-point, and partial-write recovery checks.

## States

| State | Web | macOS app |
|---|---|---|
| Empty selection | Out of scope — no browser conversation | `proposal.copy`/`proposal.apply` disabled; select or Cancel |
| Valid selection | Out of scope — no browser conversation | `proposal.title`/`proposal.volume`; inspect, then Apply/Copy |
| Selection gap | Out of scope — no browser conversation | `proposal.selectionConflict`; select earlier/uncheck later; actions disabled |
| Copy pending | Out of scope — no browser conversation | `proposal.copying`; wait/edit/Cancel; repeat Copy disabled |
| Copy succeeded | Out of scope — no browser conversation | `proposal.copied`; paste into terminal agent or edit/copy again |
| Copy failed | Out of scope — no browser conversation | `proposal.copyFailed` + `proposal.copy`; retry with checks intact |
| Applying / partial write / missing evidence | Out of scope — no browser conversation | Existing `proposal.applying`, `proposal.failed`, `proposal.partialWrites`, `proposal.refreshFailed`, `proposal.unreadWarning`; wait or inspect named documents before retry |
| Largest controlled case: two edits/one path | Out of scope — browser harness is proof only | `proposal.volume`: one selected file/net lines; inspect both edits; real vault scale unmeasured |

## Copy

Add the following keys to `messages/en/vaultAgentPanel.json` and `messages/ko/vaultAgentPanel.json`; the Korean catalogue owns exact Korean text. Matching Japanese and Chinese translations in their existing catalogues preserve the same states. Existing title/volume/Copy/Copied strings retain their text with corrected counts/timing.

| Key | Location | English |
|---|---|---|
| `proposal.copying` | Pending Copy button | Copying… |
| `proposal.copyFailed` | Recoverable card copy error | Copy failed. Try again. |
| `proposal.selectionConflict` | Selection warning; `{path}` names document | A selected edit to {path} depends on an unchecked earlier edit. Select the earlier edit, or uncheck the later one. |

## Edge cases

- Empty: zero selected files/lines, no side effect. Single: one unique path. Largest controlled chain: two edits; clipboard capacity/whole-vault scale unmeasured. First run retains expanded first-apply diff; Hangul paths/content remain intact.
- Totals use original `before` to last selected `after` per path; preview uses each edit's before/after. Both use order-preserving line differences: duplicates/blanks count by occurrence, empty text is zero lines, final newline adds no phantom line, replacement is one removal/addition, cancelling edits have zero net lines but one selected path.
- Moved/renamed/unreadable folder and concurrent disk edits retain existing Apply guards/recovery; Copy transfers displayed text, reads no folder, and makes no freshness claim. Changed selection/proposal discards obsolete feedback. Offline copy needs no network.

## Out of scope

New routes/surfaces/approval powers/automatic selection, packages, native bridge, source inspection changes, diff layout/tokens, new handoff format, and export files: this repairs existing contracts. Reuse `src/shared/lib/copy-text.ts:1-30` and its awaited boolean/fallback. No installed-native or semantic-acceptance claim. Spec author edits only this spec/two catalogues; starts no server and performs no runtime/vault edits, commit/push/landing.

## Acceptance criteria

1. **Given** the baseline, **when** repaired, **then** computer-use checkpoint/final captures, affected-state audit, and agent-handoff walkthrough cover both locales, selection repair, faithful repeated-line preview, success, and denied-copy retry; retain `/tmp/atlas-proposal-copy-proof` evidence as isolated-component proof.
2. **Given** a gap, **when** Apply/Copy is requested, **then** no write/clipboard occurs, the path warning stays editable, and either selection repair restores action. Check `proposal-applier.test.ts`, `AgentProposalCard.test.tsx`, `use-vault-agent.test.ts`, including direct calls.
3. **Given** a valid prefix with unchecked trailing/unrelated edits, **when** applied/copied, **then** only the selected prefix's final body is written/exported once per path; distinctive unchecked markers are absent. Check `proposal-applier.test.ts`.
4. **Given** valid copy, **when** pending/success/reject/unavailable/false/throw occurs, **then** feedback reflects that outcome, fallback success is allowed, and repeated clicks start no duplicate operation. Check `AgentProposalCard.test.tsx`, `use-vault-agent.test.ts`.
5. **Given** successful/pending copy, **when** selection/proposal changes or is cancelled, **then** obsolete feedback clears and late completion cannot mark current selection copied; failure retry retains checks. Check `AgentProposalCard.test.tsx` and denied-copy recovery walkthrough.
6. **Given** empty selection, **when** rendered/directly copied, **then** Apply/Copy are disabled and no packet, clipboard operation, or write occurs. Check all three named tests.
7. **Given** chains, duplicates/reordering, replacement, Hangul, blank/empty text, create-then-edit, and cancelling edits, **when** rendered, **then** title/volume count unique selected paths and correct net lines, and expanded previews show faithful ordered edit differences (`a\na` → `a`: one removal). Gaps retain file count and omit executable line totals. Check `proposal-applier.test.ts`, `AgentProposalCard.test.tsx`, final captures.
8. **Given** existing Apply freshness/recovery failures, **when** verified, **then** rejection/confirmed-save tests remain green and the lead completes `pnpm checks:changed -- --run` with every recommendation; no copied-source freshness, semantic, or installed proof is implied.

## Risks

1. Apply/export diverge: probe the identical gap/unchecked marker through both paths, including direct calls.
2. Clipboard races/fallback false success: defer/reject/remove clipboard, return false/throw from fallback, change selection pending, then retry.
3. Counts/preview hide duplicate or cancelled edits: probe ordered repeated/reordered/blank lines, create-then-edit, and no-op chains per path.

## Later

1. Installed-app clipboard walk — next if native behavior differs or an end-user failure is reported.
2. Clipboard-capacity measurement — next if a measured large handoff fails; evaluate export against that failure.

## Owner question

None — explicit exclusions and the existing card restore approved contracts; selection is reversible without new authority.
