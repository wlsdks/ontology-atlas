---
title: Codex Permission Profiles
doc_type: spec
status: current
area: agents
date: 2026-11-09
decisions:
  - 8dbc959b-a86c-4672-8d03-6067304ad096
---

# Codex Permission Profiles

## Person and moment

The owner asked to finish and release v1.9.2. During release validation the
adapter-version contract rejected Codex ACP 2.6.0. Source inspection then found
new, locally configured permission profiles entering the same mode catalogue
as the built-in read-only mode. Computer Use then exercised a disposable
protocol response in isolated Chrome at `http://127.0.0.1:3201/en/library`:
“Release write profile · Not checked” was selectable, and clicking it changed
the picker's current value. After the fix, only read-only remained. This is a
real rendered fixture observation, not a production sandbox or installed-adapter
permission measurement; actual installed profile behavior remains unmeasured.

The person using in-app Codex needs to choose a working mode without silently
replacing Atlas's reviewed read-only startup with arbitrary local permissions.

## Today

- Observed: `src/features/acp-session/model/session-choices/mode-safety.ts:96`
  rejects permission-profile ids and known gate-removing ids and kinds, then
  offers other ids as unverified.
- Observed: `src/widgets/acp-chat-panel/ui/chat-panel/ComposerFooter.tsx:44`
  presents those unverified modes using `acpChat.modeUnverified`.
- Observed: upstream [Codex ACP 2.6.0 AgentMode.ts](https://github.com/agentclientprotocol/codex-acp/blob/f3208913693bd4d5171d6c6b9be5ec1ff96c6431/src/AgentMode.ts#L161)
  appends `permission-profile:<id>` choices. Their kind and sandbox fields are
  null; the actual permissions come from the selected local profile. The source
  establishes a configurable permission boundary, not the behavior of every
  installed profile.
- Observed: `src/features/acp-session/model/use-acp-session.ts:1026` applies
  `read-only` before Codex becomes ready and fails startup if that request fails.
- Observed: `src/features/acp-session/model/use-acp-session.ts:625` announces an
  unsolicited gate-removing mode change; it does not stop or re-clamp the runtime.
  `src/features/acp-session/model/acp-client.ts:126` keeps its current id without
  adding it back to the picker.
- Observed: `messages/en/acpChat.json:311` describes a profile move with
  uncertainty about approval behavior. The existing definite warning for known
  approval-bypassing modes remains at line 313.
- The current vault concept `elements/acp-runtime-gate` separates runtime mode
  enforcement from the server write checkpoint and marks its measurement stale.
  It is context, not current installed-runtime proof.

## Problem and alternatives

First priority is preserving the reviewed startup boundary while adopting the
current adapter. Broad profile support and UI redesign return less release
value than closing this single newly exposed selection path.

| Option | Value and usability | Cost and local-first fit | Decision |
|---|---|---|---|
| Keep profiles selectable as Not checked | Preserves every local option but lets a choice leave the reviewed sandbox | No implementation cost; a label cannot establish permission behavior | Reject |
| Hide only the known permission-profile namespace | Retains read-only and ordinary unknown modes; temporarily removes local-profile convenience | Small filter and regression slice; reads no user settings or external data | Choose |
| Parse and certify each local profile | Could expose individually safe profiles | Requires new configuration authority, refresh rules and runtime measurement | Later |

Narrow the 2026-09-05 mode-policy decision in `docs/DECISIONS.md:941` only for
this known configurable namespace. Ordinary unknown ids stay offered and
labelled. A future adapter that supplies trustworthy effective sandbox facts
and passes installed approval probes can reopen this exclusion. Decision
`8dbc959b-a86c-4672-8d03-6067304ad096` records this narrow exception.

Route: observed / judge / rollback-cheap; truth unchanged, transfer unchanged,
agent-write affected, human-correction unchanged. Result: one-way review with
moment, evidence, boundaries and spec lenses.

## Flow

1. When the person opens a Codex session, Atlas still applies read-only before
   presenting the ready conversation.
2. When the person opens the mode picker, Atlas omits every normalized
   `permission-profile:` id, even if its name suggests read-only or its metadata
   claims a safe kind. Read-only remains available. A stale or direct selection
   callback for a blocked id sends no mode-change request.
3. When the adapter supplies an unrelated unknown mode, Atlas retains the
   existing Not checked label and behavior.
4. When the adapter moves into a profile without a picker action, Atlas reflects
   that current id without adding it to the choices and gives a truthful warning
   that approval behavior cannot be confirmed. The person can choose read-only
   again or end the conversation. This warning is not runtime enforcement.

## States

| State | Web | macOS app |
|---|---|---|
| Opening | Out of scope — no native ACP runtime | Existing loading state; wait for read-only acknowledgement |
| Read-only with profiles advertised | Out of scope — no native ACP runtime | Existing `acpChat.mode` picker; select read-only, profiles absent |
| Ordinary unknown choice | Out of scope — no native ACP runtime | `acpChat.modeUnverified`; inspect the Not checked label |
| Unsolicited profile move | Out of scope — no native ACP runtime | `acpChat.notice.profileModeMoved` or `profileModeMovedServerGate`; choose read-only or end chat |
| Empty or rejected mode list | Out of scope — no native ACP runtime | Preserve existing empty picker and startup failure; no invented safe fallback |

## Copy

Use profile-specific notice keys so the existing definite warning for known
approval-bypassing modes remains unchanged. The server-checkpoint suffix stays
conditional on the actual server gate. No layout change is required.

The exact English below is implemented in `messages/en/acpChat.json`, with
matching Korean, Japanese and Chinese entries in the other three catalogues.
All four describe uncertainty rather than guaranteed bypass.

| Key | Where it appears | English |
|---|---|---|
| `acpChat.notice.profileModeMoved` | Existing mode-change transcript notice for a permission profile | The tool moved this conversation into {mode}, a locally configured permission profile. Atlas has not verified whether it asks before file edits. |
| `acpChat.notice.profileModeMovedServerGate` | Same notice when server consent is enabled | The tool moved this conversation into {mode}, a locally configured permission profile. Atlas has not verified whether it asks before file edits. Changes made through Atlas tools still stop at the server for your approval. |

Existing `modeMoved`, `modeUnverified`, picker labels and read-only copy stay
unchanged.

## Edge cases

- Empty list, a single profile, and a mixed list: exclusion never fabricates a
  read-only option. Test at least 256 generated profile ids; this is synthetic
  filter coverage, not a claim about a measured installed catalogue size.
- Names containing Hangul, misleading safe names, mixed case and surrounding
  whitespace: classify by normalized id namespace, not the display name.
- First run and resumed sessions: existing read-only startup acknowledgement
  remains mandatory; a failed acknowledgement never becomes ready.
- Moved, renamed or unreadable folders and concurrent file edits: no new folder
  access or write behavior; existing failure and write-consent paths remain.
- Offline: filtering is local; no profile discovery request or network check.
- A profile sent as current mode is represented truthfully but never reinserted
  as a selectable unverified mode.

## Out of scope

- Certifying profile contents or reading user configuration: no effective-policy
  contract is available in this slice.
- Automatically stopping or re-clamping unsolicited mode changes: existing
  behavior only warns; this slice makes no stronger safety claim.
- General unknown-mode policy, provider settings, native sandbox changes and
  server-consent changes: they are independent authorities.
- New layout, new routes and ontology acceptance: no such change is needed.

## Acceptance criteria

1. Given the pre-change filter and a disposable Codex 2.6.0 response containing
   a profile, when its choices are rendered and selected, then record that the
   profile is offered as unverified and becomes current. Satisfied by Computer
   Use in isolated Chrome at `http://127.0.0.1:3201/en/library`: “Release write
   profile · Not checked” was selectable and changed the picker value; after
   the fix, only read-only remained. This rendered protocol fixture does not
   establish production sandbox or installed-adapter permission behavior.
2. Given built-ins plus profile ids with absent or safe-looking metadata, when
   choices are filtered, then only read-only remains from the Codex catalogue.
   `tests/contract/security/acp-gate-safe-modes.contract.test.ts` covers both AIR
   and non-AIR input and pins the source version to the launched registry. A direct or stale
   selection callback sends no `session/set_mode` request for a blocked id;
   `use-acp-session.test.tsx` proves that caller boundary.
3. Given a profile-only, empty, mixed-case or 256-profile list, when partitioned,
   then no profile appears in offered or unverified ids and no replacement mode
   is invented. `session-choices/mode-safety.test.ts` owns this behavior.
4. Given an unrelated unknown id, when partitioned, then it remains offered and
   unverified. The same unit suite proves this is not a blanket unknown ban.
5. Given a profile current-mode update, when consumed, then its current id is
   retained, it is not re-added to the picker, and the notice states uncertainty
   with server reassurance only when enabled. `acp-client.test.ts`,
   `use-acp-session.test.tsx` and `AcpChatPanel.test.tsx` check those boundaries;
   a target-app capture verifies the existing notice still fits.
6. Given Codex startup with a configured profile, when read-only is acknowledged,
   then ready reports read-only; when it fails, then startup fails. Retain the
   existing `use-acp-session.test.tsx` startup cases. This proves Atlas wiring,
   not the actual adapter's direct-write permission matrix.
7. Given the completed exclusion, when the prefix condition is temporarily
   removed, then the profile regression turns red; restore it and require green.
   Record the probe and CI wiring in the PR, not in this spec.

## Risks

1. An upstream rename escapes the prefix: registry-version transcription fails
   until the new catalogue is inspected; do not loosen that check.
2. A current-mode event silently reoffers a profile: exercise the event path,
   not only the initial list, and preserve honest warning copy.
3. A UI filter is mistaken for sandbox proof: report installed behavior as
   unmeasured until the actual adapter matrix runs; retain startup and server
   consent tests independently.

## Later

1. Certify individual profiles only when an adapter exposes effective permission
   facts and installed approval probes can test them without reading private settings.
2. Consider stopping or re-clamping unsafe unsolicited mode moves only as a
   separate proposal with recovery behavior and interruption evidence.

## Owner question

None — the owner authorized resolving release blockers. This narrow exclusion
can be reversed after profile permissions become inspectable and measured.
