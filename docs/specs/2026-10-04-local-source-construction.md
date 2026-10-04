---
title: Build a reviewable ontology from a selected code folder with a local model
doc_type: spec
status: draft
area: agents
date: 2026-10-04
decisions: [e5754f2f-ed8a-4592-8c99-afa2102a3fee]
---

# Local source construction

## Person and moment

The owner asked to improve ACP and local-model ontology construction, compare tool efficiency, and judge the usefulness of the resulting map to a source-hidden reader. After the lead reported that the actual app's local source path was still missing, the owner asked to continue. This is an observed owner request and source-confirmed gap, not an installed-app walkthrough. Primary recovery is **handoff**: a local-model user can produce a source-backed draft, inspect its evidence, approve selected document changes, and give a fresh reader the resulting map.

The routed pass is observed / handoff / public-contract, one-way / review with moment, evidence and boundaries lenses. Truth, agent-write and human-correction remain unchanged; transfer changes because selected code excerpts enter the local model. The owner requires background-only work: no foreground app or UI operation. This planning lane may not start servers; that lane limit is not an owner prohibition on root-owned isolated background harnesses. Those harnesses may exercise local transport and harmless proxy fixtures without adding a production backend. Background evidence must name the exercised source/native/transport path; rendered and installed interactive proof remain unavailable under the owner constraint.

## Today

- Unfamiliar-repository meaning recovery is the central product risk; folders, imports and graph health do not establish understanding (`docs/PRODUCT-DIRECTION.md:59-75`). Durable reuse and review cost are distinct outcomes (`docs/PRODUCT-OWNER-OPERATING-SYSTEM.md:42-61`).
- The actual panel turn supplies `AGENT_TOOLS` and a vault executor, with no repository source port (`src/widgets/vault-agent-panel/model/use-vault-agent.ts:199-228`). The local audit still closes tools after three verified read rounds (`src/features/vault-agent/model/providers/local.ts:4-6,242-269`).
- Current panel copy directs source work to the terminal (`messages/en/vaultAgentPanel.json:15`). The panel gates on native bridge, open vault and provider (`src/widgets/vault-agent-panel/ui/VaultAgentPanel.tsx:615-644`).
- Compile has a separate catalogue and proposal loop. Its read-only port admits only inventoried vault `sources/` files; its proposals are wiki pages with paragraph citations, not ontology nodes from an external repository (`src/features/vault-agent/model/source-read-port.ts:1-34`; `src/features/vault-agent/model/compile-tool-catalog.ts:7-28,77-92`). This port cannot simply be treated as external source authority.
- A source-only picker already grants the selected canonical directory without vault writes or parent grants (`src-tauri/src/source_access.rs:3-24,31-46`). Source grants are separate from vault grants (`src-tauri/src/lib.rs:217-243`). Existing project inspection expands to the Git repository root; it is not an exact-selected-folder construction inventory (`src-tauri/src/lib.rs:2145-2173`).
- Native observations use no-follow directory handles and record omissions, but their fingerprint reads Git ancestor metadata. Existing witnesses expose only the first 80 lines, with an 8 KiB excerpt cap; they are not an arbitrary-range construction port (`src-tauri/src/gray_area_scope.rs:216-255,465-492`).
- The shared native transport accepts HTTPS beyond loopback and rejects only remote plaintext HTTP. A local provider label therefore does not itself enforce local-only source transfer (`src-tauri/src/llm.rs:112-156`). Curl ignores user config and does not request redirect following (`src-tauri/src/llm.rs:226-240`), but the send setup creates a curl child without clearing inherited proxy variables (`src-tauri/src/llm.rs:600-611`). Disabling curl configuration does not bypass `HTTP_PROXY`, `HTTPS_PROXY` or `ALL_PROXY`; loopback-only validation alone cannot prove direct local transfer.
- Existing intents become one review proposal; apply uses the vault writer and captured mtimes, preserves failed status, exposes confirmed saved paths and separate reload errors (`src/features/vault-agent/model/proposal-builder.ts:80-124`; `src/widgets/vault-agent-panel/model/use-vault-agent.ts:318-369`). The previously proposed separate recovery dependency is already present here; it is no longer a pending prerequisite.
- Existing proposal assembly drops a relation whose source is newly proposed, because it searches only persisted `port.docs` (`src/features/vault-agent/model/proposal-builder.ts:212-216`). Its new-concept tool advertises `path`, `capabilities` and `elements` (`src/features/vault-agent/model/tool-catalog.ts:383-399`), but assembly omits those fields (`src/features/vault-agent/model/proposal-builder.ts:173-186`). Reusing the applier therefore needs a narrow proposal-assembly repair, not an assumption that current assembly preserves a new graph.
- Root's MCP discovery was bound to the older main-7 vault, so it supplies historical boundaries only. Full current checked-in `capabilities/vault-conversation-agent`, `capabilities/repo-structure-analysis`, `elements/bounded-source-read` and `elements/llm-provider-adapter` bodies were read. They separate source, proposed meaning, approval and unmeasured quality. No installed app or local construction run was performed by this planning lane.

Retain the three-read-round audit decision (`docs/DECISIONS.md:4208-4214`) and separate Compile/approval precedent (`docs/DECISIONS.md:770-776`). Construction is an explicitly selected mode, not an audit-cap increase or a second disk writer. Historical model counts and timing are not current proof. The earlier scratch native spec and preflight patch are proposals, not shipped capability.

## Problem and alternatives

Rank: (1) restore the actual native local-model source path, because a source-unavailable refusal cannot produce the requested map; (2) measure source-hidden usefulness and source errors, because a valid draft may preserve the wrong meaning; (3) reduce repeated construction cost after the path finishes. A faster empty-vault refusal has lower value than restoring this ability.

| Option | Value and usability | Feasibility / local-first fit | Cost / decision |
|---|---|---|---|
| Keep terminal handoff | Existing users can inspect source through their coding agent | Already available | Does not restore the requested app-local ability; retained fallback |
| Explicit local-only action in the existing Agent panel | One code-folder choice, named document destination, same review card | Reuses source-only grants, native audited transport and one applier where their contracts fit | Selected; exact-root reads, direct local transport, evidence validation and graph-preserving proposal assembly are new work |
| Let ordinary chat infer a root or send code to any selected provider | Fewer initial presses | Broadens source and transfer authority by inference | Rejected; unclear source selection and remote transfer |
| Extend Compile's vault source port into a general construction writer | Familiar local model route | Wiki and ontology evidence/target contracts differ | Rejected; disguises a new boundary and duplicates disk ownership |

Existing chat, ACP, Compile and terminal handoff remain available. An action-specific boundary distinguishes ordinary document conversation from chosen code reads. First slice is a bounded draft with visible unknowns; it neither promises complete-project construction nor accepts meaning automatically.

## Flow

1. When the person opens the Agent panel with a native vault, Atlas offers `construction.action`. Choosing it uses the existing source-only native picker. A current local model and loopback endpoint are required; otherwise `construction.localRequired` offers Models. Empty vaults need no project binding. The web shows `construction.webUnavailable` and sends nothing.
2. When the person selects a code folder, Atlas prepares a bounded inventory of that exact canonical directory and previews the source folder, destination document folder, model, endpoint, eligible files found, exclusions and inventory limit. The destination vault and its entire subtree are excluded before inventory or body reads. Selecting the vault itself or a folder inside it yields no eligible source. Preparation sends no source to a model; Cancel preserves chat input and changes no code or document file.
3. When the person presses Run, Atlas binds the turn to the previewed source, vault, local model and endpoint. It reconfirms source identity and direct local-only transport. Native construction requests reject nonloopback endpoints and redirects and bypass inherited uppercase/lowercase `HTTP_PROXY`, `HTTPS_PROXY` and `ALL_PROXY`; an inherited proxy must receive no construction payload even when `NO_PROXY` is absent. Existing curl transport is reused with this narrowly enforced construction policy. Neither source grants, project bindings nor Git ancestor lookup substitute another root, including for fingerprints. The selected session does not create or rewrite a persistent source binding. Code stays read-only; only later approved vault edits can be written.
4. When the model asks for evidence, Atlas returns only eligible inventory members and requested line ranges, with actual ranges, full-file snapshot hashes, returned bytes, file completeness and omissions. Source text is untrusted data, never permission to execute commands. Draft bodies preserve evidenced actors, outcomes, conditions, fallback order, failures and counter-boundaries; unread behavior is unknown. Relations require evidence for their direction and conditions.
5. When a run reaches its finite limits, Atlas stops: at most eight model requests, eight returned ranges, 8 KiB per range, 32 KiB cumulative source text and 64 KiB per serialized model request including instructions, tool schemas and prior evidence. Repeated ranges consume the same cumulative budget again. Inventory is bounded to 500 entries and eight directory levels; counts mean observed eligible files, never complete repository size. Supported input is the existing native code/text manifest allowlist; binaries, symlinks, sensitive names, unsupported paths and files over 256 KiB are excluded before body transfer. Exact exclusions appear as data. Construction uses a cancellable 180-second per-request timeout; ordinary local audit keeps its existing 60-second timeout, cap and catalogue.
6. When the model is wrong, evidence is missing, output is malformed, no draft exists, or limits stop it, Atlas reports the actual stopping reason and preserves the chosen source and input. Only mechanically valid, source-grounded intents may enter the existing proposal card; a partial draft is labeled incomplete. A citation must match a returned path/range/hash receipt, and missing or out-of-range citations block its intent. Receipt identity proves neither the claim nor its sufficiency. No surviving intents means no proposal. Stop or source/vault/model/endpoint change invalidates the turn; late responses cannot produce an actionable draft.
7. When a draft is ready, Atlas shows the same selectable diff card with source root, read ranges, omissions and unknowns. The person can inspect, deselect, cancel or Apply. New concepts keep their supported implementation `path`, `capabilities` and `elements` fields, and evidenced typed relations between concepts in the same new draft appear in its diffs and survive save. Newly proposed relation endpoints are not silently dropped because they were absent from the original vault. This narrowly repairs proposal assembly while keeping the existing single applier. Before Apply, Atlas rechecks the selected source identity and every used witness plus the current vault; changed, moved or unreadable evidence requires Run again. Existing expected-mtime, authorable-schema, approval and qualification guards remain. Applying files does not change meaning acceptance or competency status.
8. When the person approves, the existing applier writes only selected document changes and reloads the vault. Conflicts preserve edits. Mid-write failure stays failed, reports the confirmed completed-call prefix and reload failure separately, and never claims rollback or a rejected writer's internal mutations. Failed runs remain in the audit. A fresh source-hidden reader and separate source audit measure the persisted map's usefulness, wrong claims and gaps; no formal human competency acceptance follows from the run.

## States

| State | Web | macOS app |
|---|---|---|
| Entry / no vault | `construction.webUnavailable`; use installed app | Existing `degraded.noVaultTitle`/`noVaultBody`; open a document folder |
| Empty / first vault | `construction.webUnavailable`; use installed app | `construction.action`/`boundary`; choose a code folder |
| Missing or nonlocal model | `construction.webUnavailable`; use installed app | `construction.localRequired`/`modelsAction`; choose a local model in Models |
| Picking / preparing | `construction.webUnavailable`; no picker | `construction.pickerTitle`/`preparing`; Cancel keeps input |
| Preview | `construction.webUnavailable`; no source request | `construction.previewTitle`/`previewBody`/`scope`; Run, Choose another folder or Cancel |
| Empty source | `construction.webUnavailable`; no source request | `construction.empty`; Choose another folder, Run disabled |
| Limited / largest inventory | `construction.webUnavailable`; no source request | `construction.inventoryLimited` beside preview counts and exclusions; narrow folder or Run within displayed limits. Largest measured count is unknown |
| Running | `construction.webUnavailable`; no model call | Existing thinking/elapsed/Stop with measured source-read rows; Stop cancels |
| Limit / partial draft | `construction.webUnavailable`; no model call | `construction.incomplete` plus actual stopping reason; inspect partial draft or choose a narrower folder |
| Model / no-draft failure | `construction.webUnavailable`; no model call | `construction.failed` plus existing reason notice; check model connection and retry with selection/input kept |
| Draft / unsupported claim | `construction.webUnavailable`; no proposal | `construction.draft` and existing proposal diff; inspect evidence/unknowns, deselect, Cancel or Apply |
| Stale / unreadable source | `construction.webUnavailable`; no apply | `construction.sourceChanged`/`runAgain`; prepare and run again |
| Vault conflict | `construction.webUnavailable`; no apply | Existing `proposal.conflict`; inspect current document and run again |
| Applied / partial write failure | `construction.webUnavailable`; no apply | Existing applied/failed/partialWrites/refreshFailed messages; inspect confirmed saves before retrying |

## Copy

Exact English and Korean strings live under `construction` in `messages/en/vaultAgentPanel.json` and `messages/ko/vaultAgentPanel.json`; matching Japanese and Chinese keys live in `messages/ja/vaultAgentPanel.json` and `messages/zh/vaultAgentPanel.json`. Translations are localized catalogue data; authored prose remains English. Existing Stop, Cancel, Apply, Retry, conflict and recovery keys are reused where accurate. Paths, counts, ranges, exclusion reasons and actual stopping reasons are displayed data.

| Key | Where it appears | English |
|---|---|---|
| construction.action | Agent panel action | Build from code |
| construction.boundary | Beside action | This conversation reads your document folder. Build from code reads a code folder you choose with your local model. |
| construction.webUnavailable | Web construction state | Build from code is available in the macOS app with a local model. Open your document folder there to continue. |
| construction.pickerTitle | Native source picker | Choose a code folder |
| construction.preparing | Source preparation | Checking the selected folder… No code has been sent to the model. |
| construction.previewTitle | Preview | Before your local model reads code |
| construction.previewBody | Preview | Code folder: {sourcePath}\nSave reviewed changes to: {destinationPath}\nLocal model: {model}\nAddress: {endpoint}\nEligible files found: {count} |
| construction.scope | Preview | Run sends code excerpts from this folder to the local model at the address shown. Your document folder is excluded from code reads. Code stays read-only. Only document changes you review and approve can be saved. |
| construction.inventoryLimited | Limited preview | The folder check reached its limit. This list is incomplete; choose a narrower folder or run with the files found. |
| construction.run | Preview action | Run |
| construction.chooseAgain | Source selection action | Choose another folder |
| construction.modelsAction | Local-model recovery action | Open Models |
| construction.localRequired | Provider gate | Build from code needs a local model at an address on this computer. Choose one in Agents → Models, then try again. |
| construction.empty | Empty source | No supported code files were found outside your document folder. Choose another code folder. |
| construction.sourceChanged | Source refusal | The selected code folder or its evidence changed or cannot be read. Choose the folder and run again before applying a draft. |
| construction.runAgain | Source recovery action | Run again |
| construction.incomplete | Limit or partial draft | Construction stopped before finishing. This draft covers only the evidence read; review its gaps or choose a narrower folder. |
| construction.failed | No draft | The local model did not finish a draft. Check the model connection and retry; your folder selection and input are kept. |
| construction.draft | Proposal disclosure | Draft from selected code. Review its evidence and unknowns before applying. |

## Edge cases

Empty, single and largest source: refuse zero eligible files; permit one real file; report observed count, limits and omissions rather than total size. Largest measured source and vault counts remain unknown until the trial. First run: open/create the destination vault through the existing flow, then choose source explicitly; no binding prerequisite. Hangul roots, code and comments: preserve paths/text and measure UTF-8 bytes, not character estimates.

Nested/same vault: exclude the canonical destination vault and descendants before all source inventory/body/witness work; refuse a source inside it. Git subfolder: do not climb to repository parents, even for revision metadata. Folder move, rename, unreadability, symlink or replacement race: refuse without root expansion; keep selection display and input for recovery. Files changed after read: hash the read snapshot; refuse stale Apply and retain its failure evidence. Concurrent vault edits and switching resource scope: preserve edits, cancel old work and prevent stale responses from becoming writable.

Offline/model rejection: keep the source choice/input and actual failure; never fall back to cloud. Inherited HTTP/HTTPS/all-proxy settings, including lowercase forms and empty `NO_PROXY`: bypass proxies for native construction and prove direct delivery with a harmless marker fixture, not real source. Read-only vault: draft may be inspectable/copyable through existing card but Apply remains disabled. Unsupported/binary/secret/build inputs: named exclusions without their bodies. Malformed calls and fake/missing citations: refuse before proposal; a plausible claim with a valid citation still requires human and source audit. Partial apply: inspect confirmed saves and reload failures before retry; do not reapply a successful prefix automatically.

## Out of scope

- Source writes, shell execution, remote code transfer and third-party parsers — no new execution authority.
- A second general ontology writer or primary route — reuse the existing panel, proposal and applier.
- ACP, ordinary local audit and Compile redesign — preserve their current boundaries and caps.
- Complete-project coverage, quality badges and formal competency acceptance — bounded source inspection does not establish them.
- Persistent source binding, incremental sync, resume and parallel construction workers — need evidence from this first completed path.
- Foreground UI and installed interactive walkthrough — prohibited by the owner's background-only constraint; do not label background tests as that proof. This planner cannot start servers; root-owned isolated background source/transport/proxy harnesses are allowed. Production backend, API routes and server actions remain outside the architecture.

## Acceptance criteria

1. Given the current native panel and a selected local model, when Build from code is chosen, then the source-only picker and exact source/vault/model/endpoint/count/exclusion preview precede every model request; Cancel preserves input and writes no documents. Web, nonloopback endpoints, redirects and inherited proxies cannot transfer construction source outside the chosen local address. Proof: panel bridge tests, native endpoint/grant fixtures, and a harmless marker-proxy negative probe for uppercase/lowercase HTTP_PROXY/HTTPS_PROXY/ALL_PROXY with NO_PROXY cleared; a control proves the proxy can receive the marker while construction goes directly to the local runner and never reaches that proxy; rendered/installed interactive capture is explicitly unavailable in this background-only run.
2. Given an empty vault and independently selected source, including a Git subfolder or vault nested within source, when Run occurs, then reads stay within the exact selected root and exclude the vault subtree, without bindings, parent metadata or source-write authority. Proof: native exact-root/same-root/nested-vault/parent/no-write positive and negative fixtures.
3. Given traversal, symlinks, sensitive names, binaries, unsupported or oversized files, races and Hangul, when inventory/range reads occur, then unauthorized bodies never return, hashes identify actual read snapshots, and ranges/UTF-8 bytes/omissions are truthful. Proof: native read adversarial fixtures with one real allowed range and a changed-file case.
4. Given repeated requests and oversized serialized payloads, when construction runs, then all limits in Flow 5 stop further work before transfer and report the actual limit; ordinary local audit keeps three read rounds and its existing catalogue. Proof: construction executor/adapter budget tests and existing local-provider regression, including duplicate reads charged again.
5. Given malformed intents, missing/out-of-range receipts, a wrong claim with a valid citation, no draft or a partial draft, when the model ends, then invalid intents never become actionable, valid partial output stays visibly incomplete, and neither valid citations nor Apply accept meaning. No source or document changes occur before approval. Proof: bad-call/citation fixtures, deliberately wrong cited claim and local-model source audit.
6. Given Stop or source/vault/model/endpoint change, stale evidence, concurrent edits and mid-write/reload failure, when a response or Apply arrives, then stale work cannot write, existing mtime/qualification protections remain, failed writes report only confirmed completed calls and separate reload errors, and retries do not replay saves automatically. Proof: hook scope/cancellation, witness recheck, conflict and existing partial-write recovery regressions; no rollback claim.
7. Given a fixed unfamiliar fixture and configured local 27B model, when the actual construction modules and native source/transport path run in a background harness and selected changes are explicitly approved in that harness, then full-body persisted readback contains at least two fixture-required new concepts, an evidenced typed relation between them, and an implementation path anchored in source actually read. A fresh source-hidden answer must use that persisted relation and implementation path to answer one sealed fixture question; disconnected files or a model-supplied relation that disappeared during assembly fail this criterion. Collect audit receipts and a separate source audit. Report calls, elapsed time, bytes, proposed/approved writes, wrong/partial/unknown claims and failed attempts; unavailable metrics stay unavailable. The eight-request/32 KiB limits have unmeasured feasibility: if the actual trial cannot preserve this minimal useful graph, retain the failed run and narrow source/task scope from that evidence before claiming success, rather than replacing the graph with isolated documents or increasing budgets without review. This tests feasibility and handoff without substituting a generic Node source port, claiming installed UI use or formal human acceptance. Proof: graph-preservation proposal regression and file-backed ontology field-trial artifacts with exact exercised modules/transport substitutions disclosed.
8. Given the completed implementation, when owner documentation and modeled boundaries are reconciled, then actual native/local availability, source and destination scope, approval, measured limits and remaining proof gaps are truthful; all changed-path recommendations pass. Proof: README/FEATURES update, ontology-sync readback and `pnpm checks:changed -- --run`. Planning lane changes only this spec and construction catalogue keys; root owns implementation, docs, sync, decision and landing.

## Risks

1. Source inventory or fingerprints silently reach a Git ancestor, vault or changed path: exact-root source-only authority, vault exclusion before reads, no ancestor metadata and replacement probes.
2. A loopback URL travels through an inherited proxy, remote HTTPS is allowed, or the model exhausts its unproven budget: enforce direct native loopback/no-redirect/no-proxy transport with a marker-proxy probe; retain failed real-model trials and narrow source/task scope from evidence, without semantic-truth promotion.
3. Proposal assembly drops new-node relations or implementation fields, or late/partial saves look complete: require persisted full-body two-concept/relation/path readback and a source-hidden answer using that relation; preserve immutable resource identity, stale-witness/mtime checks and failure-prefix recovery, with cancellation/conflict/reload probes and honest unavailable installed proof.

## Later

1. Expand unfamiliar-repository meaning coverage only after this native path finishes and source-hidden/source-audit evidence identifies the remaining losses.
2. Add targeted continuation/resume only when bounded runs repeatedly lose a useful sealed question and the next required evidence is known.
3. Add persistent source binding/incremental sync only when a later independent task demonstrates source drift or repeated selection cost.

## Owner question

None — explicit local-only selection and existing review reuse restore the requested ability within current authority. Preserve terminal handoff. Reconsider limits or entry only against measured failures; foreground verification requires a later change to the owner's background-only constraint.
