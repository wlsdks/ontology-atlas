---
title: Library Service Save
doc_type: spec
status: current
area: library
date: 2026-10-25
decisions: [8b7becb1-9f52-4a6a-8a70-0b3836d7b39e]
---

# Library Service Save

## Person and moment

A developer gathering service documents for agent work opens Library, chooses
Notion, and reaches a masked field labelled only "Value" and a disabled Connect
button. The installed-app capture and accessibility tree at
`/tmp/atlas-ux-service-entry-DW7X3q/06-native-connect-after.{png,ax.txt}` show this
empty-input state, not saving or failure. The lead identifies the installed binary
as `cd463ce0de241dd6be0b7cbc696f4b8b603cae033b8bc23181bb9bc80c130955`.

The next observation is a controlled renderer probe: two presses start two saves;
three credential failures advance; closing during a folder save still starts a
credential write. The person needs an honest result and recoverable setup before
asking an agent to fetch documents. This serves the distinction between evidence
and confidence in `docs/PRODUCT-DIRECTION.md:29`.

## Observed baseline (before this change)

- `src/widgets/library-import/ui/LibraryImportDialog.tsx:131` creates a new ID per
  press, awaits the folder write, ignores rejected/null/negative credential results,
  then enters choose. `:108` resets on close without invalidating suspended work;
  `:345` disables Save only for blank input.
- `src/widgets/library-import/model/import-flow.ts:92` explicitly chooses an enabled
  import record; `src/widgets/library-import/ui/LibraryImportDialog.test.tsx:165`
  pins that old choice. The five new probes at `:72` failed; 13 existing cases passed
  in 46.38 seconds. Evidence: `/tmp/atlas-ux-service-save-NPO1ws/probe-red.log`.
  Operations were mocked; no real token or service request was used.
- `src/shared/lib/connectors/connector-store.ts:125` serializes one store's jobs,
  but `:143` replaces a same-ID row without checking an expected definition.
  `src/features/mcp-connectors/model/use-vault-connectors.ts:171` records approval
  before writes; its `allowHere` at `:164` uses the rendered snapshot.
- `src/shared/lib/connectors/tauri-connector-secrets.ts:22` requires no browser token
  field; `:50` exposes only reference, presence and last four characters.
  The baseline `LibraryImportDialog.tsx:301` offered the field without that check.
- `docs/features/library/workspace.md:679` owns service imports and explicitly leaves
  live fetching unproven. The lead read `capabilities/library-workspace` and
  `elements/vault-connector-registry`: supplied scope remains original imports and
  connector metadata, without new meaning acceptance. No vault writes are requested.

`pnpm decisions:find 'connector enable'` and `pnpm decisions:find 'library import'`
returned no matches. Relevant standing authority is
[this Mac's exact-definition consent](../records/decisions/2026-09-27-folder-switch-needs-this-mac-a8e0fbd2-9695-4834-b771-5ae30d1c5791.md)
and `docs/DECISIONS.md:905`. This overturns the observed enabled-first import
choice, not an invented historical record. The route is `review`, one-way,
`correct`, meaning risk; one independent reviewer precedes implementation.
The lead records the final decision; `decisions: [8b7becb1-9f52-4a6a-8a70-0b3836d7b39e]` remains empty here.

## Problem and alternatives

Rank: (1) prevent premature use and false success, (2) retain one recoverable setup
through failure/cancellation, (3) clarify feedback and capability limits. The first
two return control over what an agent can use. Cosmetic feedback alone leaves that
control broken. Existing users lose immediate apparent completion of an incomplete
save; their completed settings remain usable. Remote validation comes later.

| Alternative | Value and usability | Cost, feasibility and local-first fit | Decision |
|---|---|---|---|
| Status quo: enabled settings first | Fast apparent completion; hidden failures | No build cost; violates readiness and web keychain contracts | Reject |
| Token first, then enabled settings | One folder write | Failed write leaves a keychain entry with no inspectable row; cleanup adds deletion authority | Reject |
| Enabled settings without approval, then token and approval | One folder write; inspectable waiting row | Relies solely on machine consent and writes a transferable on-switch before readiness | Reject |
| Disabled settings, confirmed token, guarded activation and approval | Inspectable partial state and truthful recovery | Two folder writes and conflict handling; no backend or new canonical store | Choose |

Dissent: the second folder write can fail after storing a token. Retain that one
row and token for explicit retry; never auto-delete them. Falsifier: an unconfirmed
or changed definition becomes usable, a retry adds another row, or abandoned work
starts another operation. Rollback disables guided saving in favor of existing
settings review/Add files; it never restores enabled-first behavior or deletes data.

## Flow

1. When the person picks a service, Atlas checks the folder and capability. Web
   shows `webSetupTitle`/`webSetupBody`, no token field or Save, and offers Get the
   app and Add files. Add files closes this dialog and opens the existing picker.
2. When the person opens app setup, Atlas resolves the required local tool before
   allowing Save. Missing/non-absolute paths offer settings review or Add files;
   an unavailable folder offers reopening. No secret is written at this stage.
3. When the person presses Save setup, Atlas immediately admits one attempt,
   freezes its inputs, and announces `savePending`. The attempt belongs to the
   captured folder, service, stable connector ID and expected service definition.
   Repeated pointer/keyboard presses start nothing else.
4. When the folder confirms that exact row saved with `enabled:false`, Atlas may
   store the token. Only the requested reference with `stored:true` confirms it;
   null, a mismatched reference, false and exceptions fail. Unconfirmed input stays
   masked in memory for retry; confirmed storage clears it. No token enters a file,
   log, URL, brief or approval record, and no stored token is read back into the UI.
5. When the token is confirmed, Atlas activates only the unchanged saved row,
   confirms the stored result, and records this Mac's exact-definition consent only
   while the attempt and folder are current. Then `connected` announces setup
   saved, explicitly unverified, and the document-request field receives focus.
6. When a stage fails, Atlas remains in setup and offers Retry save or saved-settings
   review. Retry reuses the ID. After confirmed token storage it rechecks presence
   and retries activation without requesting the token again. A changed/deleted
   row stops the retry for review; it is never recreated or overwritten silently.
7. When the person closes, goes Back, changes folder/service, or the view unmounts,
   Atlas invalidates that attempt and clears token input. No subsequent write,
   approval, conversation or screen transition runs. Back focuses the service tile;
   Close focuses the import control. Neither waits for a bridge or asks confirmation.
8. When the person reopens a partial setup, Atlas inspects its row and credential
   presence, then offers explicit Resume setup. The non-secret ID survives closing
   within the folder session; after restarting, one matching
   `library-import:<service>` row recovers it. Multiple rows or a definition other
   than the expected service setup require saved-settings review, never a second
   row. A complete unchanged setup enters choose without writes or new consent.
   Already-enabled matching rows remain enabled; resume never stages them off.
9. When an agent claims service access without evidence, Atlas keeps the local
   setup labelled unverified. Only a later explicit Bring action hands off the
   existing bounded brief and per-file permission flow; saving sends no service call.

**Cancellation and partial results.** Close/Back remain available even if a bridge
never settles. One already-issued OS/folder write may finish: it can leave a
disabled row, a token for that row, or an enabled row awaiting this Mac's approval
if final activation had already started. No automatic cleanup follows. An
in-memory, non-secret lease keeps that ID from overlapping saves until the issued
operation settles; a reopened flow can inspect it. Service tiles, other folders
and Add files stay reachable; a stalled write may still block this folder's save
queue. A fresh UI never adopts the old continuation.

**Narrow source/API decisions.** Replace this Library caller's general
`upsert(..., {allowHere:true})` with no-approval staging and guarded finalization.
Carry the captured session/handle identity and absolute root; `sources.vaultScope` alone is insufficient. Before staging and finalization/readback, reject a name colliding with any sibling,
including disabled or manually configured rows, without writes or credential storage.
Require one unique matching ID at inspection, mutation and readback; ambiguous IDs
cannot replace any row.
Staging creates an
absent ID or confirms the same disabled row; it does not replace a different one.
Guard activation inside the serialized mutation: re-read, compare
`connectorFingerprint` plus expected enabled state, and change only that current
row's enabled field, preserving all other fields and siblings. Return typed
conflict/cancelled outcomes. Check lifetime before a queued write starts and after
every await. Exceptions also settle into the appropriate failure state.

After activation, read back the current row before approving the explicit expected
fingerprint, never a stale React `shown(id)`. A fresh Resume press can authorize
an exact matching saved row already enabled but not allowed here; an old attempt
cannot. A changed definition, missing row/credential/folder root or lost attempt
prevents approval and completion. Runtime results obey the same lifetime guard.
If an already-approved resumed row's token is absent, keep it in settings review
until the person repairs it; never replace that token implicitly. A disabled,
unapproved partial row can request the missing token again under its existing ID.
The queue/readback detect changes visible at those reads; they do not provide
atomicity with arbitrary external writers between a read and write. Preserve this
limit. Do not redesign general connector editing or machine approval persistence.

## States

| State | Web | macOS app |
|---|---|---|
| Service selection | `pickBody`; select or Close | `pickBody`; select or Close |
| Empty token / first run | `webSetupBody`; Get the app or Add files; no input | `connectToken`, `tokenLabel`; type; Save disabled for blank input |
| Folder absent/unreadable | `webSetupBody`; Close and open folder for Add files | `setupFolderUnavailable`; Close and reopen folder |
| Checking saved setup/tool | `webSetupBody`; local fallback; no secret lookup | `checkingSetup`; Back/Close; Save waits |
| Required tool missing | `webSetupBody`; Get the app or Add files | `setupRuntimeUnavailable`; Review saved settings or Add files |
| Folder/token/activation pending | Out of scope — no guided save on web | `savePending`, `savePendingBody`; Save/input disabled; Back/Close available |
| Folder save unconfirmed | Out of scope — no guided save on web | `connectFailed`; Retry save with input kept or Close |
| Disabled row saved, token unconfirmed | Out of scope — no guided save on web | `secretSaveFailed`; Retry save with input kept or Review saved settings |
| Token confirmed, finalization unconfirmed | Out of scope — no guided save on web | `activationFailed`; Retry save or Review saved settings; token input cleared |
| Cancelled operation still settling | `webSetupBody`; no native operation on this surface | `setupStopped`; Review saved settings or Close; same-ID resume waits |
| Partial setup ready to resume | `webSetupBody`; open same folder in app | `resumeSetupBody`; Resume setup or Review saved settings |
| Changed/deleted/ambiguous row | `webSetupBody`; open same folder in app | `setupConflict`; Review saved settings; no overwrite/approval/new row |
| Setup saved; service unverified | Out of scope — browser cannot complete this setup | `connected`, `whatLabel`; choose request; Bring only with ready agent |
| No ready agent | `noAgentBodyWeb`; Get the app or Add files; no saved claim | `connected`, `noAgentBodyRuntime`; See your coding tools; no Bring |
| Largest measured flow | `webSetupBody`; three service tiles | Three tiles, one attempted row in probes; `savePending` or `connected`; no large-registry claim |

Pending is one polite live status with `aria-busy` on Save. Errors use `role=alert`
and preserve focus near the remedy. Reduced motion retains every fact without
requiring a spinner. Review saved settings closes this dialog and opens the
existing Agents connector list for this folder; no stacked dialogs.

## Copy

Keys belong to `libraryImport` in `messages/en/libraryImport.json` and
`messages/ko/libraryImport.json`; English is exact, Korean stays in the catalogue.
Back, Close, Get the app and coding-tool links are reused. The builder supplies
Japanese/Chinese parity before integration checks.

| Key | Where it appears | English |
|---|---|---|
| `pickBody` | Service selection | Pick where your documents already live. Save the service settings, then ask your coding agent to find documents and bring the ones you choose into this folder as Markdown files. |
| `connectToken` | App setup | Save settings for {service}. Paste an access token issued by the service. |
| `connectTokenWho` | Before Save | The token is stored in this Mac’s keychain, never in your folder’s files. Saving allows these settings for agent conversations on this Mac; it does not check access to the service. |
| `connectAction` | Save button | Save setup |
| `connectFailed` | Folder save error | Atlas could not confirm that the settings were saved to this folder. Check that the folder is writable, then retry. Your input is still here. |
| `tokenLabel` | Masked field | Access token |
| `connected` | Confirmed local setup | {service} setup is saved. Access to the service has not been checked. |
| `savePending` | Busy button | Saving setup… |
| `savePendingBody` | Busy status | Saving {service} for this folder. You can close this window; a save already started may finish. |
| `checkingSetup` | Readiness check | Checking the saved settings for {service}… |
| `resumeSetupBody` | Partial setup | Settings for {service} are already saved. Resume setup to check what is ready and finish using the same settings. |
| `resumeSetup` | Recovery action | Resume setup |
| `retrySave` | Failed stage action | Retry save |
| `inspectSetup` | Partial/conflict recovery | Review saved settings |
| `secretSaveFailed` | Credential error | Atlas could not confirm the token in this Mac’s keychain. Retry, or review the saved settings. |
| `activationFailed` | Finalization error | The token is stored, but setup is not confirmed. Retry to check this folder and finish, or review the saved settings. |
| `setupConflict` | Changed/ambiguous row | These settings changed, were removed, or match more than one saved entry. Review the current settings before continuing. |
| `setupStopped` | Cancelled pending setup | Setup stopped. A save already started may finish. Review the saved settings before continuing. |
| `setupFolderUnavailable` | Lost folder | This folder is unavailable. Reopen the folder to resume setup, or close this window. |
| `setupRuntimeUnavailable` | Required tool missing | Atlas could not find the local tool this service needs. Review the service settings in Agents, or use Add files. |
| `webSetupTitle` | Browser fallback title | Save service access in the app |
| `webSetupBody` | Browser fallback | A browser cannot store this access token in the Mac keychain. Open this folder in the app, or download the documents from {service} and use Add files here. |
| `addFiles` | Local fallback | Add files |
| `noAgentBodyWeb` | Browser agent fallback | A browser cannot start a coding tool. Open this folder in the app to review the service settings, or download the documents and use Add files here. |
| `noAgentBodyRuntime` | App agent fallback | No coding tool is ready on this Mac yet. The service setup is saved, but access has not been checked. Set up a coding tool, then return here to choose documents. |

## Edge cases

- Empty/first run: no folder means no save; whitespace token disables Save. One
  partial row resumes by ID; multiple rows require review. The measured UI has
  three tiles; large connector registries remain unmeasured.
- Hangul document requests survive errors and ordinary Back navigation; IME/Enter
  cannot submit twice. Closing clears sensitive input.
- A detected session/handle/root change or read failure invalidates the attempt.
  No result or consent migrates to a new session or path. Physical replacement at
  the same path without a changed handle is unproven; no native filesystem identity
  coordination is claimed.
- A colliding name leaves the existing manual or catalogue connector attachable.
  Same-ID edit/deletion before guarded activation is a conflict; sibling edits
  visible at the read survive. Resume cannot bless a changed command, address,
  argument, credential reference or other definition field.
- Offline local setup may succeed; reachability remains unverified. Denied keychain
  access, null results, read/write exceptions and malformed files remain failures.

## Out of scope

Remote validation/fetching and actual account credentials: this proves local setup
only. New services, account selection and generic editing stay in existing
settings. No secret deletion on cancellation, automatic retry, persistent recovery
database, schema/ontology change, transfer destination change, permission expansion
or browser token storage. No cross-process filesystem transactionality or native
cancellation guarantee. General machine approval persistence stays unchanged.

## Acceptance criteria

1. **Given** any delayed save stage, **when** Save is pressed twice by pointer or
   keyboard, **then** one attempt runs, Save is busy/disabled and Back/Close work.
   Check `src/widgets/library-import/ui/LibraryImportDialog.test.tsx` deferred cases.
2. **Given** token reject/null/false/wrong-reference and folder typed/throw failures,
   **when** saving, **then** choose/approval never happen; errors keep unconfirmed
   input and retry uses one ID. Check the five red probes plus that failure matrix.
3. **Given** confirmed token storage and failed activation, **when** retrying or
   resuming, **then** the same row completes without a second token entry or row;
   serialized metadata contains no token. Check component recovery cases and
   `src/shared/lib/connectors/connector-store.test.ts`.
4. **Given** suspended work at each boundary, **when** Close, Back, unmount or
   service/folder replacement occurs, **then** the already-issued effect is the
   maximum result: no next write, approval, brief or replacement-flow state. Check
   deferred component/hook cases, including close during final activation.
5. **Given** same-ID edit/deletion/enabled change or a sibling edit before activation
   or readback, **when** finalizing, **then** changed targets stop without overwrite
   or approval, siblings survive, and only confirmed unchanged definitions receive
   consent. Check guarded store cases and
   `src/features/mcp-connectors/model/use-vault-connectors.test.ts`.
6. **Given** a real browser, **when** selecting Notion/GitHub, **then** no token field,
   guided save, keychain invocation or connected claim appears; Get the app and Add
   files work. Correct `tests/e2e/library/library-import-service.spec.ts` and the
   existing `tests/e2e/web-surface-smoke.spec.ts` entry. A mocked browser token is
   not storage proof.
7. **Given** missing/late local runtime resolution or no ready agent, **when** using
   setup, **then** no invalid local command is reported ready, stale lookup results
   are ignored and the actual remedy opens. Check component cases and affected e2e.
8. **Given** the rebuilt installed app in real full screen and a shared renderer
   with isolated mocked native bridges, **when** walking empty/pending/failure/
   partial/resumed/saved states in English/Korean, **then** focus, recovery, wrapping
   and wording match this spec. Capture the ordinary native path; inject faults
   without actual credentials. Complete the routed UI audit/responsive bands and
   `pnpm checks:changed -- --run` recommendations. This proves no live service access.

## Risks

1. Cancellation arrives during an irreversible local write. Guard every boundary,
   withhold later approval, retain the inspectable row, and probe each suspended
   stage; Close does not promise to undo a write.
2. A newer definition receives stale consent or is replaced. Compare inside the
   serialized mutation, read back before exact-definition approval, and probe edits
   and deletion. The cross-process read/write race remains a known limit.
3. Tests confuse mocked storage with service or browser capability. Prove real web
   absence, rebuild the ordinary native path, and keep the saved/unverified wording.

## Later

1. Real service verification, when the owner authorizes an account trial and a clear transfer boundary exists.
2. Persistent multi-account recovery UX, when observed use exceeds the existing connector settings.
3. Stronger cross-process write coordination, when a reproducer defeats the guarded-store/readback boundary.

## Owner question

None — existing UI/UX repair authority covers this readiness change. The single
independent reviewer judges it before implementation; fallback can disable guided
saving while retaining inspectable saved data.

## Implementation boundary

The reviewed corrections are applied: all sibling names are checked before staging and
inside guarded finalization; captured session/handle plus absolute-root identity guards
transient work. The dialog remounts on that setup session identity, clearing inputs
and completed state before any new-folder action. Failed unconfirmed staging keeps
its ID without asserting that a row was persisted. `connector-setup.ts` coordinates the attempt without storing plaintext.
The existing Library and connector-registry ontology scopes remain accurate; this adds
no accepted meaning, service-access evidence, new node, or vault write authority.

The baseline source line references above describe the observed pre-change source.
Current implementation lives in `src/shared/lib/connectors/connector-setup.ts`,
`connector-store.ts`, `use-vault-connectors.ts` and `LibraryImportDialog.tsx`.
