---
title: Compare bound source dates with the vault that records their meaning
doc_type: spec
status: current
area: analysis
date: 2026-10-11
decisions: [78daf781-cdf9-4826-93e5-7cd4e83884ca]
---

# Compare bound source dates with the vault that records their meaning

## Person and moment

An agent user keeps the ontology in one Git repository and its code in a second local repository, then opens an
implementation claim in Analysis to judge what needs rereading. The owner's reported symptom is the
separate-code-folder refusal. The hook and its test at base `583eca926` reproduced that refusal. The retained installed baseline is an
older 1.6.0 bundle, so it does not establish a same-version visual before/after. Final native proof targets an
isolated bundle with the corrected bridge and preserves the person's running installed app.

Among the two requested evidence slices, initial-document omission leads because it can hide a condition. This
follows because it restores useful drift evidence for a legitimate separate-vault workflow, while the present
refusal is honest. A learner and a person using Atlas without an agent get the same named claim, dates and
reason to inspect its original document.

The owner's PO route is `observed`, `public-contract`, review lenses `moment/evidence/boundaries + spec`. Truth,
transfer, agent-write and human correction boundaries stay unchanged. The first slice supports one explicitly
bound Git source for one project scope, with the existing native source grant. The confined binding reader
currently supports Unix platforms; macOS is the verified app surface. Non-Unix platforms, including Windows,
retain the existing `unsupported_platform` refusal, mapped to `unreadable` with no dates by this command.

## Before this change

The following implementation observations describe base `583eca926`; the implemented contract follows below.

- `useOntologyEvidence` reads the vault's project-source bindings, accepts one distinct root, asks for the vault
  Git root, and returns `different-source` when the roots differ
  (`src/views/ontology-insights/lib/use-ontology-evidence.ts:33-51`). Its first test proves no Git walk runs for
  that case (`use-ontology-evidence.test.tsx:24-31`).
- The native dating call validates a vault grant, resolves both path classes through the vault repository, and
  deduplicates by caller-relative string (`src-tauri/src/git/evidence.rs:29-77`). It caps at 512 paths and 3,000
  commits (`evidence.rs:21-23`). It cannot safely be reused by calling it with a source root: source and vault
  grants are different authorities.
- The resolver currently uses one path map for the document and its source anchors
  (`src/shared/lib/git/evidence-states.ts:87-108`). Identical relative strings from different roots therefore need
  separate identities.
- Native source resolution already validates the single project binding, receipt identity and a binding digest
  (`src-tauri/src/gray_area_scope.rs:42-114`). `verify_identity` checks actual Git-root/kind/source identity
  (`gray_area_scope.rs:688-699`). Vault and source grants are separate (`src-tauri/src/vault/scope.rs:25-51`);
  `pickTauriSourceDirectory` grants source reading through the existing picker
  (`src/shared/lib/vault-folder/tauri-vault-fs.ts:456`).
- The Git runner disables repo-controlled hooks, fsmonitor, external diff, textconv and signature commands for
  reads (`src-tauri/src/git/runner.rs:37-64`, `86-116`). This remains the owner for every new Git read.
- Analysis already shows source status, claim verdicts, paths and an original document action
  (`src/views/ontology-insights/ui/analysis/AnalysisWorkspace.tsx:61`, `117-129`, `135-142`). The copy owner is
  `messages/{en,ko}/ontologyPages.json`, not `OntologyInsights.json` (`messages/en/ontologyPages.json:795-810`,
  `848-852`).
- The full vault concepts read were `capabilities/project-source-binding`,
  `capabilities/evidence-drift-detection` and `capabilities/repo-structure-analysis`. Their bodies separate
  drift from meaning acceptance; their review currentness is not confirmed. Live MCP roots point to the
  main-checkout dogfood vault, so this worktree's source governs implementation facts.
- This upholds the single active source and private-path boundary in `docs/DECISIONS.md:4154-4160`, and the
  existing receipt slot in `docs/DECISIONS.md:4145-4151`. It does not aggregate several code roots or create
  another receipt of accepted meaning. The product thesis remains `docs/PRODUCT-DIRECTION.md:25-53`; native
  grants and web absence remain owned by `.claude/rules/surfaces.md`.

## Problem and alternatives

The refusal exists because the current date walk has only the vault repository as an authority. Removing its
root comparison would compare unrelated files or grant the source folder vault powers. The ability to restore is
narrower: compare the concept document's own Git date with each recorded file's Git date in the already
connected source, and report what could not be compared.

| Option | Value and usability | Feasibility and local-first fit | Decision and cost |
|---|---|---|---|
| Keep the refusal | Honest unknown, but a normal separate-vault setup cannot compare dates | No work; local | Reject: does not return the requested ability |
| Require the person to move the vault into the code repository | Reuses today's path | Local but changes the person's storage and Git history | Reject: high user cost and no need imposed by the product model |
| Remove the root check or run the vault command against source | Appears to restore dates | Conflates grants and relative paths | Reject: wrong evidence and widened authority |
| Read both existing roots under their own grants and compare separated results | Restores the comparison in the existing claim view | Local; native binding validation and two bounded walks | Choose: a bounded read bridge and explicit unavailable states, no source copying or writes |

Existing same-repository use keeps the same date verdict rule. It gains collision protection and the same
fail-closed unknowns. A date comparison remains evidence to reread a claim, not proof of accepted meaning or
runtime impact.

## Flow

1. When the person opens a claim in a single recorded project scope, Atlas reads that project's one binding from
   the granted vault. The native side resolves the source from that binding; a renderer-supplied source path
   cannot select a different repository. More than one binding/source or an unresolvable project scope stays
   unknown.
2. When both vault and source have their required grants and Git history, Atlas dates concept documents relative
   to the vault and implementation anchors relative to the canonical bound source. Both maps keep separate
   identities, even when their relative strings or physical Git repository are the same.
3. When the comparison is complete for a claim, Atlas reuses the existing current/stale/missing/unknown verdict
   and original-document actions. Stale names a changed source file and its date; missing names a verified
   absent path. Current still says that dates were compared and meaning is unverified.
4. When source reading has not been granted, Atlas leaves the evidence unknown and offers `Choose connected code
   folder`. The existing picker grants source reading to the folder the person selects before binding comparison.
   The date read separately requires that folder to match the current binding. A match retries; cancellation keeps
   the claim and connection; a mismatch performs no date read or rebinding. The grant registry policy is unchanged.
5. When the connection, its receipt identity, either canonical root or either Git revision changes during the
   read, Atlas discards that measurement and offers `Compare dates again`. The renderer rereads the binding after the native reply and discards changed receipts or bindings before
   exposing dates. A late result for a different vault, project, source binding or document/path selection never
   becomes the visible result.
6. When the agent is wrong, a folder moved, history is absent, a path is unsafe, access is unreadable, or a
   bounded walk omits a required date, Atlas keeps the affected comparison unknown. The person can inspect the
   original document, retry, or repair the project connection on the map. Nothing corrects the ontology, grants
   vault writing to source, or accepts meaning automatically.

The narrow observable read contract has separate `vaultChanges` and `sourceChanges`, each retaining the existing
path/existence/type/date fields. It carries a typed unavailable reason and explicit partial coverage rather than
using an empty list for success. Requests identify `vaultPath`, `projectSlug`, vault-relative document paths and
source-relative anchors; the source authority comes from the current binding. The native read snapshots binding
identity (project, sourceId, binding digest and receipt identity) and both Git revisions before and after the
walks. An identity mismatch returns no usable comparison.

The total path budget stays at 512 unique candidates, with document paths first and the budget spent before
any metadata inspection, including rejected paths. Each repository walk stays at 3,000 commits. Read-only Git
children disable lazy object fetching and transports; a missing promisor object stays unavailable. Explicit
network workflows retain their existing execution policy.
Unreturned paths, undated entries, invalid dates, known uncommitted changes, and folders without file-level
evidence cannot produce current. A proven missing file or newer source commit can retain the existing verdict
precedence while other unmeasured paths remain disclosed. No filesystem mtime fallback may enter the evidence
verdict. Timestamp ordering across repositories is an advisory comparison of recorded Git dates, not a causality
claim. No new absolute path/remotes are written into Markdown or displayed as product copy.

## States

| State | Web | macOS app |
|---|---|---|
| Empty | Existing `analysis.empty`; open a local ontology folder | Existing `analysis.empty`; open a local ontology folder |
| Loading | `analysis.sourceStatus.app-only`; continue inspecting recorded claims | `analysis.sourceStatus.reading`; retain the selected claim while waiting |
| No binding | `analysis.sourceStatus.app-only`; inspect the declaring document | `analysis.sourceStatus.no-source`; connect this project on the map |
| Multiple/ambiguous source | `analysis.sourceStatus.app-only`; inspect recorded scope | `analysis.sourceStatus.ambiguous-source`; inspect the document or repair its connection on the map |
| Source grant missing | `analysis.sourceStatus.app-only`; native source picker is unavailable | `analysis.sourceStatus.ungranted` plus `analysis.chooseSourceFolder`; choose the bound code folder |
| Wrong picker folder | Out of scope — no native picker | `analysis.sourceRecovery.wrongFolder`; choose again, keep claim and connection |
| Connection changed | `analysis.sourceStatus.app-only`; no native snapshot | `analysis.sourceStatus.binding-changed` plus `analysis.retrySourceDates`; compare again |
| Non-Git or no history | `analysis.sourceStatus.app-only`; inspect recorded claims | `analysis.sourceStatus.no-history`; inspect the document and recorded paths |
| Unreadable error | `analysis.sourceStatus.app-only`; inspect recorded claims | `analysis.sourceStatus.unreadable` plus `analysis.retrySourceDates`; retry or repair connection |
| Partial coverage | `analysis.sourceStatus.app-only`; no local Git verdict | `analysis.sourceStatus.partial`; unmeasured claims remain unknown, while proven missing/newer files keep verdict precedence |
| Current / stale / missing / unknown | `analysis.sourceStatus.app-only`; no invented native verdict | Existing `analysis.sourceShort.*` and `analysis.sourceClaim.*`; open the declaring document |
| No anchors | `analysis.sourceStatus.app-only`; inspect recorded claim | Existing `analysis.sourceStatus.no-anchors`; inspect/correct the claim through the existing action |
| Largest measured count | No scale claim — web Git reading remains absent | Native fixture returned 512 paths from 513 requests (46,110 serialized bytes); a 3,002-commit fixture left a path outside the 3,000-commit window unknown. This is bounded fixture coverage, not a product scale claim. |

All keys above are under `ontologyPages.insights`. Existing Brief consumers use only the vault date map for
document dates, and the same separated verdicts; they must not reconstruct a combined path map or turn
unavailable reads green.

## Copy

| Key | Where it appears | English |
|---|---|---|
| `analysis.sourceStatus.ungranted` | Existing source status | Source · choose the connected code folder to allow reading |
| `analysis.sourceStatus.binding-changed` | Existing source status | Source · connection changed; compare dates again |
| `analysis.sourceStatus.no-history` | Existing source status | Source · Git dates unavailable; inspect the document and its recorded paths |
| `analysis.sourceStatus.partial` | Existing source status | Source · some dates are unknown; inspect the unchecked claims |
| `analysis.sourceStatus.ambiguous-source` | Existing source status, changed | Source · multiple connections; inspect the document or repair its connection on the map |
| `analysis.sourceStatus.no-source` | Existing source status, changed | Source · no connected code folder; connect this project on the map |
| `analysis.sourceStatus.unreadable` | Existing source status, changed | Source · files could not be read; retry or check the connected folder |
| `analysis.chooseSourceFolder` | Source-grant recovery action | Choose connected code folder |
| `analysis.sourcePickerTitle` | Existing native source picker title | Choose the code folder connected to this project |
| `analysis.retrySourceDates` | Read retry action | Compare dates again |
| `analysis.sourceRecovery.wrongFolder` | Inline picker error, preserves selection | The selected folder does not match this project's connection. Choose the connected code folder; the connection is unchanged. |

Copy owners are `messages/{en,ko,ja,zh}/ontologyPages.json`. The approved Korean recovery copy names the
connected code folder in the current scope without repeating the project-kind label. It preserves cancellation,
wrong-folder and unchanged-connection meaning. Keep the existing `sourceClaim.dated` and `sourceShort.dated`
limits. The old `different-source` key remains for compatibility, but a valid separate root no longer selects it.

## Edge cases

- Empty vault/no anchors never starts a source walk; one project, one document and one anchor are the smallest
  useful comparison. The largest measured count is unknown until the bounded fixture is run, not inferred from
  constants.
- A bound separate root outside existing source authority needs the picker. Preserve `canonical_source_root`:
  vault roots and their registered containing repositories already permit source reads
  (`src-tauri/src/vault_grants.rs:51-61`). A matching folder name or old MCP receipt grants nothing new.
- Analysis passes all project slugs to the evidence hook (`AnalysisWorkspace.tsx:35-36`), with no project selector.
  Multi-project scope stays unknown; inspect the document or repair its connection on the map.
- Hangul/spaces in paths retain literal identity; hostile Git pathspec syntax, options, traversal and symlink
  escape must not broaden the read.
- Moved, renamed or unreadable roots return unknown and preserve the original connection; Atlas does not guess
  the replacement folder from its basename.
- Concurrent binding/receipt changes, HEAD changes and known uncommitted paths invalidate the affected result. A
  stale async response cannot restore it.
- Offline operation uses local Git only. No fetch, pull, push or remote probe is needed. Missing commit dates
  and clock anomalies never establish correctness.

## Out of scope

- Multiple source roots, project aggregation and folder-mtime dating: they need a separate evidence rule, not a
  fallback for absent Git proof.
- Browser Git access or a second route/dashboard: preserve the existing native bridge absence and claim-review
  surface.
- Automatic binding repair, source grants, vault writes or meaning acceptance: reading evidence never supplies
  those authorities.
- Date-history expansion, source copying, background monitoring or a release: the owner authorized this bounded
  local read only.

## Acceptance criteria

1. Retain the current-source refusal regression and label the older installed baseline separately. In the
   corrected isolated native bundle, inspect the same separate-vault/source claim, a measured comparison and
   deliberate missing-evidence recovery. Keep fixture identities and captures in scratch, and do not claim a
   same-version visual before/after or a human walkthrough from the older bundle or automated proof.
2. Given granted, separately committed vault and code repositories, when one project is inspected, then
   earlier/equal source dates, newer source dates, proven absent paths and undated paths produce the existing
   four verdicts. Verify native tests in `src-tauri/src/git/evidence/bound/tests.rs` plus
   `src/views/ontology-insights/lib/use-ontology-evidence.test.tsx` and the shared evidence-state/parity tests,
   using real temporary Git repositories natively.
3. Given `capabilities/pay.md` exists in both roots with different dates, and a second fixture nests the vault
   inside the source repository, when dates are resolved, then the document always uses vault coordinates and
   the anchor always uses source coordinates. Verify native and `evidence-states` fixtures; the test must fail
   with a single map keyed only by relative strings.
4. Given a bound separate root outside existing source authority or an unsafe anchor, when dating is requested,
   then no unauthorized date read or vault-write authority is gained. Preserve same-repository access through
   `canonical_source_root`. The picker grants its selected folder (`src-tauri/src/source_access.rs:11,23`), but
   dating requires the current bound root: a wrong choice is never dated or rebound; cancellation keeps selection.
   Verify native grant/path guards, source-access tests and rendered picker recovery; planted Git
   hook/fsmonitor/diff/signature commands must not execute. Do not change the grant registry policy.
5. Given malformed, missing, duplicate or changed binding/receipt identity, a non-Git source, or more than one
   source scope, when comparison is requested, then an explicit unavailable reason replaces a result and no
   arbitrary root is chosen. Verify native binding fixtures and hook tests, including duplicate bindings that
   name the same root. On non-Unix hosts, verify the actual command refuses the unavailable confined reader
   and returns neither document nor source dates, even with valid binding data and both grants.
6. Given a binding, receipt, root or HEAD changes during a delayed measurement, or the visible
   vault/project/paths change while it is pending, when the old result completes, then it cannot produce a
   visible current verdict. Verify native before/after mutation fixtures and the hook's delayed-response tests;
   retry then succeeds for the new stable scope without writing it.
7. Given Hangul paths, 512/513 requested paths, a history-window miss, an invalid timestamp and a known
   uncommitted path, when measurement runs, then all omitted/undated/unsafe facts remain explicit unknowns,
   limits hold, and the largest actually measured counts/bytes are recorded. Verify native limits and shared
   resolver tests; no broad unbounded scan or mtime fallback.
8. Given web and installed macOS with English/Korean copy, when the person reads available, partial and
   unavailable claims, then web invokes no native read, app recovery actions work and the
   current/stale/missing/unknown wording never claims accepted meaning. Verify the existing Analysis component
   tests, web surface smoke and the parent's routed installed-app proof; finish all routed checks and report the
   actual capture dimensions.

## Risks

1. Matching relative names combine unrelated dates. Preserve root-scoped maps through native reply, resolver and
   Brief consumers; require the collision fixture even when both roots share one repository.
2. A convenient read launders vault authority into an arbitrary source. Resolve the binding natively, use the
   separate source gate and hardened Git runner, and prove both the ungranted and malicious-repository negative
   cases.
3. Concurrent change or bounded history creates a reassuring current state. Recheck binding/receipt and Git
   identities, retire stale async results, and keep missing coverage/dirty or undated paths unknown with a
   working retry.

## Later

1. Multi-project comparison, only after a real workflow needs more than one binding and project ownership can be
   preserved without guessing.
2. Non-Git source evidence, only after a date-independent evidence rule and a measured user need exist;
   filesystem timestamps are not that rule.

## Owner question

None — the authorized first slice uses one existing bound Git source and the existing source picker. If a grant
is absent, the person grants reading at the normal picker; no new approval workflow or ontology acceptance is
introduced.
