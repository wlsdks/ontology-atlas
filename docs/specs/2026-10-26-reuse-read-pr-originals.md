---
title: Reopen previously read PR originals
doc_type: spec
status: current
area: git
date: 2026-10-26
decisions: [76f02165-64aa-4f43-8e47-5bccac5873e4]
---

# Reopen previously read PR originals

## Person and moment

An owner delegates frequent code changes to agents, then returns to Changes to understand the recorded work.
They repeatedly found catch-up hard to understand and requested day/week/month/year/custom reading without an ontology prerequisite.
The native walkthrough read 39 PR descriptions for 28 commits, inspected PR #2934's author text, and later had zero PR descriptions after restart and a failed lookup.
Evidence: `/tmp/atlas-git-pr-build/pr-first-transfer-observation.json` and its `115-pr-first-author-original` / `118-pr-state-unavailable` captures.
The later native run reached GitHub's request limit; local sources remained usable, but originals and cooldown still lasted only for the session.
Evidence: `/tmp/atlas-git-pr-build/pr-rate-proof.json`, binary `4890ff0a1896b8b902af47f31a741f8f71e10cc1071976612c0a362cf4c09385`.
Outcome: explain the same work later by reopening author records, while knowing what has and has not been checked again.

## Pre-change baseline

These observations and source-line references describe the rate-limit build `4890ff0a1896b8b902af47f31a741f8f71e10cc1071976612c0a362cf4c09385`, before this retention change. They are not claims about the newly implemented cache.

- PR records and repository choice use arrival memory keyed by source snapshot and period (`src/views/change-briefing/ui/BriefingNarrative.tsx:23`).
  Its backing store is an in-memory map for the tab's lifetime (`src/shared/lib/navigation/route-arrival-memory-store.ts:11`).
- Collection starts with a public-repository check and a request-local PR map (`src-tauri/src/git/briefing/prs.rs:234`, `:255`).
  Limits are 40 PRs, 80 requests, 2 MiB and 60 seconds (`:10`, `:270`). There is no persistent store in this path.
- Source receipts bind current root, filesystem object, HEAD and interval (`src-tauri/src/git/briefing/prs.rs:62`);
  accepted PRs must be merged in the selected repository and introduced by a selected integration commit (`:145`, `:336`).
- Returned PRs contain title/body, update/read timestamps, digest and integration commit, but omit merge SHA (`src-tauri/src/git/briefing/prs.rs:16`, `:355`).
- Failed/rate-limited refresh retains an existing set; a successful empty result replaces it (`src/views/change-briefing/ui/BriefingNarrative.tsx:63`).
  The reader exposes version metadata and mutable-description qualification (`:119`); sending needs a separate preview (`:155`).
- Rate responses expose normalized failure/retry time, not response bodies (`src-tauri/src/git/briefing/prs/response.rs:31`).
  Native rate-limit, local recovery and clock-expiry observations are in the capture above; persistence has not been measured.
- The fully read `capabilities/vault-git-history` concept covers ontology-folder history and excludes source-repository history.
  This source-only job cannot reuse its vault write authority. General reader comprehension, other operating systems and restart recovery remain unproved.

## Problem and alternatives

Rank: (1) reopen already-read originals after restart; (2) resume completed model explanations; (3) find more PRs per period.
The first restores existing evidence when it disappears and avoids spending quota to reread it. It does not claim to fix explanation quality.
The cause is session-only retention, not missing ontology or a model connection. Repeated usefulness is the product priority (`docs/PRODUCT-DIRECTION.md:40`).

| Option | Value and usability | Cost, feasibility and local-first fit | Decision |
|---|---|---|---|
| Keep session-only originals | Quit removes retained text; each return needs a network read | Lowest cost; local, but observed quota failure blocks rereading | Reject for this moment |
| Save only exact HEAD/period results | Restarts one unchanged snapshot | Smaller key design, but normal agent commits invalidate useful copies | Reject; repeated work goes cold |
| Export original text to repository or ontology | Durable and inspectable | Changes the person's files; adds import/cleanup and unrelated write authority | Reject |
| Bounded app-owned originals, rechecked against local history | Offline return with visible version and explicit refresh | Native storage/identity/failure work; no server or repository writes | First slice |

Existing users lose automatic disposal of fetched public PR text on quit. Before Read PRs, disclose local retention, limits and clear control.
Retain [b1a09b49](../records/decisions/2026-10-25-git-pr-source-first-briefing-b1a09b49-2a38-4d3a-b913-c59186a58761.md)'s public-only explicit reads, source association and proposed-meaning boundary.
Narrowly supersede the session-only/no-cross-restart-originals clause in [the original spec](2026-10-25-git-pr-briefing.md); model progress/results and audit receipts are unchanged.
Route: observed / explain / substantial-investment; review and decision required; truth affected, transfer/agent-write/human-correction unchanged.
Lenses: moment, evidence, boundaries, smallest-slice, spec and security. The lead records the decision; `decisions: [76f02165-64aa-4f43-8e47-5bccac5873e4]` remains until then.

## Flow

1. When the person chooses a granted folder, period and public GitHub repository in Changes, Atlas reads current local history and checks saved copies locally.
   Restoring cannot grant folder access. Expired grants need the existing picker; multiple remotes need the existing selection.
   No GitHub or model request occurs on arrival, restart, local history change, cache read, clear or cooldown expiry.
2. When matching saved originals exist, Atlas puts them in Read sources and labels them Saved PR copy with their original read time.
   The summary names the count and says GitHub has not been checked. Current repository visibility and current PR text remain unknown.
   Local commits remain readable while checking disk. No matches means no saved copies for this selection, not no PRs.
   Accept a restore only for its still-current receipt and before a later manual read/clear; it cannot overwrite a newer session result.
3. When the person opens a saved original, Atlas shows its exact title/body, original GitHub update/read times and digest.
   Back restores source-row focus. Read latest PR descriptions stays beside the saved-copy state, subject to existing cooldown.
   Saved text may enter the unchanged explicit model preview; its version/provenance remains visible and no send is automatic.
4. When the person chooses Read latest PR descriptions, Atlas performs the existing explicit bounded public lookup.
   Valid fresh originals replace the current result and update saved versions. Show Read from GitHub separately from successful disk saving.
   Save failure preserves fresh text and states that earlier disk versions may remain after restart; reading never depends on persistence success.
5. When refresh fails, is rate-limited or is cancelled, Atlas keeps previously opened originals and original timestamps; it never calls them refreshed.
   With no prior set, valid returned originals before a non-cancellation failure remain partial. Preserve unchecked coverage and cooldown behavior.
   A successful partial result without failure replaces the active set but leaves disk copies for unchecked integrations available for a later, labelled restore.
   A fully measured empty result replaces the current set with empty and removes this selection's saved entries. In other successful refreshes,
   remove absent saved entries only for checked integrations; retain unchecked integrations and other selections. Failed reconciliation warns about earlier disk versions.
6. When the agent is wrong or evidence is missing, the person can inspect the saved original and its age, reread GitHub explicitly, or continue with local commits.
   Missing/rejected copies never become a complete account, accepted meaning, successful refresh or a substitute fabricated from commit subjects.
7. Changes always offers Saved PR copies in the installed app, including before folder selection, expired/unavailable grants and empty periods.
   This app-owned management control requires no source receipt or remote; native clear accepts no caller path.
   When the person chooses Clear all saved PR copies, Atlas clears only this feature's app-owned copies across repositories.
   Explain that scope beside the control; no second confirmation is needed. Keep repository/dates and already-open session originals/explanations.
   Mark those originals App-session copy and fence work started before clear from saving again. A later explicit GitHub read may save new copies.
   Report success only after clear succeeds; failure says some copies may remain. Never delete repository, ontology or transfer-record files.

Saved-copy contract:

- Scope is the canonical granted source root plus filesystem object identity and normalized selected GitHub owner/repository.
  HEAD is not a cache key: a fresh local receipt validates current HEAD, snapshot and interval before and after each restore.
  A new clone, replaced directory, changed remote or ungranted root cannot borrow another scope's copies.
- Store only accepted public PR title/body, number, canonical URL, update/read times, digest, merge SHA and integration commit with scope and format version.
  Never persist raw API responses, credentials, model outputs, patches, commit bodies or a reusable source grant in this store.
  Recheck `introduced(merge SHA, integration)` locally and require integration in the current selected commit set; number mentions/ancestors alone are insufficient.
  A digest checks stored-byte consistency, not independent truth or current GitHub authorship. Every original remains untrusted source text.
- Keep one latest fetched version per scoped PR: at most 400 records and 16 MiB serialized saved data in total, including metadata.
  Each serialized entry is at most 512 KiB; retain whole entries only. Oversized fresh originals stay in session and are explicitly unsaved.
  Evict oldest GitHub-read timestamps first until both bounds hold; show eviction count after a write. No age-based expiry or automatic refresh.
- Restore at most 40 PRs / 2 MiB for the entire serialized restore reply, including coverage and omission metadata, per selection, in selected integration order then PR number; stop before exceeding either bound.
  Return omitted counts; narrowing the period can recover omitted entries. All current commits remain remotely unchecked on disk-only restore.
  Saved positives never prove complete PR discovery or a negative result. Do not persist negative lookup results.
- Successful refresh reconciles only actually checked integrations. Failed refresh with a prior displayed set never deletes prior saved versions. Cancellation observed before atomic publication blocks the update under the store lock and at publication; Stop cannot retract an already published save.
  With a prior displayed set, failed refresh retains that set without merging partly refreshed versions into it.
  With no prior displayed set, individually valid partial originals may be saved; partial status and original read times remain visible.
- Fixed native app-owned storage is private to the local user and separate from transfer records. Reject symlinks, nonregular files, out-of-scope identities,
  unsupported formats, bad digests and oversized entries before exposing text. No arbitrary-path or weaker-write fallback.
  Count rejected matching entries where safely knowable; an unreadable/unsafe store is unavailable, never empty success. Fresh reads remain possible.
- Concurrent processes/windows cannot mix roots/versions, expose torn entries, delete outside this store or resurrect pre-clear writes.
  Each explicit remote read changes the persisted generation before network work, so a later-started read or clear fences earlier writers even if the newer read fails. Superseded originals stay session-only with `prSaveSuperseded`; no negative lookup is persisted.
  Clear also changes this persisted generation; a remote read captures it before starting and may save only if it still matches when serialized with clear.
  Bound deserialization by record count and bytes; do not enumerate arbitrary directories. Interrupted updates keep the last complete version or report unavailable.
  Temporary storage is bounded and cleaned safely. Where safe storage operations are unsupported, explicitly offer session-only fresh reads.

## States

| State | Web | macOS app |
|---|---|---|
| No source / expired grant / moved or replaced folder | `webBody`; `navRail.getApp` | `sourceUnavailable`; choose folder again, keep dates; `prSavedDetails` and clear remain available |
| Empty period | `webBody`; `navRail.getApp` | Existing empty-period message; `prSavedDetails` and clear remain available |
| First read / no matching copies | `webBody`; `navRail.getApp` | `prSavedNone`, `prSavedPolicy`; Read GitHub PR descriptions or local sources |
| Checking disk | `webBody`; `navRail.getApp` | `prSavedLoading`; local sources remain readable |
| Restored / offline / single / 39 observed originals | `webBody`; `navRail.getApp` | `prSavedReady`, `prSavedVersion`, `prSavedUnchecked`; originals or `prRefresh` |
| Restore bound / rejected matching entries | `webBody`; `navRail.getApp` | `prSavedOmitted` / `prSavedIgnored`; narrow dates / `prRefresh` |
| Unsafe, corrupt or unreadable store | `webBody`; `navRail.getApp` | `prSavedUnavailable`; fresh read or `prClearSaved` |
| Safe storage unsupported | `webBody`; `navRail.getApp` | `prSavedUnsupported`; fresh reads remain session-only |
| Manual GitHub read | `webBody`; `navRail.getApp` | `prLoading`; stop, keep previous originals |
| Fresh result / saving / saved | `webBody`; `navRail.getApp` | `prFreshVersion`, `prSavedSaving` / `prSavedUpdated`; read originals |
| Save failure / entry too large | `webBody`; `navRail.getApp` | `prSaveFailed` / `prSaveTooLarge`; keep originals, retry read or clear |
| Bounded eviction | `webBody`; `navRail.getApp` | `prSavedEvicted`, `prSavedPolicy`; fresh read if older text remains available |
| Fresh partial / successful empty | `webBody`; `navRail.getApp` | `prPartial` / `noPr`; inspect coverage or choose another period |
| Failed refresh / rate limit / cancellation | `webBody`; `navRail.getApp` | `prRefreshFailed`, `prRateLimited` and retry-time keys / `prCancelled`; originals or local sources |
| Local identity changes during restore | `webBody`; `navRail.getApp` | `stale`; reread local history before copies can attach |
| Wrong explanation / missing evidence | `webBody`; `navRail.getApp` | `invalidAnalysis` / `sourceUnavailableInline`; original or explicit refresh |
| Clearing / cleared / partial failure | `webBody`; `navRail.getApp` | `prClearingSaved` / `prSavedCleared`, `prSessionVersion` / `prClearFailed`; session originals or retry clear |

## Copy

New keys use `gitBriefing`. English entries are in `messages/en/gitBriefing.json`; exact Korean counterparts are in `messages/ko/gitBriefing.json`.
The source and code panels use labelled icon buttons; reading/transfer details remain available through an explicit information button. Existing author-record and transfer boundaries are unchanged. Timestamp placeholders use the interface locale; web retains its installed-app explanation.

| Key | Where it appears | English |
|---|---|---|
| `backSources` | Both ends of an original opened from the source list | Back to source list |
| `prSavedDetails` | Always available app-only Changes button | Manage saved PR copies |
| `prSavedNotice` | Visible before PR read | Read PR originals are saved on this device (up to 400 copies / 16 MiB). |
| `prSavedPolicy` | Before first PR read and saved-copy details | Atlas saves the public PR descriptions you ask it to read on this device: one version per PR, up to 400 copies or 16 MiB. Older reads are removed first. Saved text and repository visibility may have changed on GitHub. You can clear all saved PR copies below. |
| `prSavedLoading` | Local restore status | Checking saved PR copies on this device… |
| `prSavedNone` | Empty saved-copy state | No saved PR originals for this period. |
| `prSavedReady` | Restored-copy summary | Opened {count} saved PR descriptions. GitHub has not been checked. |
| `prSavedVersion` | Saved source row, reader and send preview | Saved PR copy · read {fetchedAt} |
| `prFreshVersion` | Fresh source row, reader and send preview | Read from GitHub · {fetchedAt} |
| `prSessionVersion` | Source after clear or unsupported saving | App-session copy · read {fetchedAt} |
| `prSavedUnchecked` | Restored-copy coverage | PRs for {count} commits have not been checked in this read. Saved copies are not a complete PR lookup. |
| `prSavedOmitted` | Restore limit | {count} more saved PR descriptions match this period but exceed the read limit. Narrow the dates to open them. |
| `prSavedIgnored` | Rejected matching entries | {count} saved PR descriptions failed local checks and were not opened. Read GitHub again to replace them. |
| `prSavedUnavailable` | Store read failure | Could not open saved PR copies safely. Read GitHub again for this period, or clear the saved copies and try again. |
| `prSavedUnsupported` | Unsupported safe storage | Saving PR copies is unavailable on this system. You can read GitHub now; those originals will last only for this app session. |
| `prSavedSaving` | Pending disk write | Saving these PR descriptions on this device… |
| `prSavedUpdated` | Successful nonempty disk write | Saved {count} PR descriptions on this device. Choose the same repository and period to reopen them after restarting Atlas. |
| `prSaveSuperseded` | Older read fenced by a later read or clear | A newer PR read or clear started. These originals remain in this app session; saved copies were not replaced. |
| `prVersion` | Original modification metadata | PR #{number} · description updated {updatedAt} |
| `prSaveFailed` | Save or reconciliation failure | Could not update saved PR copies. This read stays available in this app session; earlier saved versions may remain after restart. Check storage access, then read GitHub again or clear saved copies. |
| `prSaveTooLarge` | Oversized unsaved fresh entries | {count} PR descriptions exceed the saved-copy limit. They remain available for this app session; read GitHub again to retrieve them later. |
| `prSavedEvicted` | Eviction after saving | Removed {count} older saved PR copies to stay within the storage limit. Read GitHub again if you need them. |
| `prRefresh` | Explicit network action | Read latest PR descriptions |
| `prClearSaved` | Saved-copy details | Clear all saved PR copies |
| `prSavedClearScope` | Beside clear control | Clears saved PR copies for every repository on this device. Open originals and explanations stay in this app session; repositories, ontology folders and transfer records are unchanged. |
| `prClearingSaved` | Clear in progress | Clearing saved PR copies… |
| `prSavedCleared` | Successful clear | Saved PR copies cleared. Originals already open remain available for this app session. A new GitHub read can save them again. |
| `prClearFailed` | Clear failure | Could not clear all saved PR copies. Some may remain on this device. Check storage access, then try again. |

## Edge cases

- Empty, one, observed 39 and bound 40: complete originals or explicit omissions; zero saved matches never asserts zero remote PRs.
  First run explains retention before the first network read. Test 400/401 entries and exact byte boundaries; they are not observed real-world counts.
- Hangul folder names, PR titles and bodies survive byte-identical UTF-8 round trips; byte limits never use character counts or truncate title/body.
- Renamed/moved folder: choose it again; changed canonical root gets a new scope without automatic migration. Replaced/unreadable folders cannot reuse a path-only match.
- HEAD advance keeps eligible integrations; rewritten history or a different remote cannot attach them. Scope changes discard pending stale results before rendering.
  Remote PR edits appear only after manual refresh. Offline return opens matching copies without a network probe.
- Deleted/private-now repositories remain historical saved copies until refresh can establish otherwise. A complete successful empty removes checked scoped entries;
  failed refresh preserves them, while failed disk reconciliation warns about earlier saved versions.
- Clear wins over previously started writes. Disk-full, permission, corruption and interruption failures preserve current fresh text and never falsely report save/clear success.

## Out of scope

- Persisting explanations, model plans, rate-limit state or audit changes: separate retention/resume contracts; this slice saves original PR records only.
- Private repositories, credentials, login, GitHub Enterprise, background polling and new transfer destinations: preserve the public explicit-read boundary.
- Repository/vault writes, ontology construction or meaning acceptance: saved author records grant none of them.
- Archive/export/version browser, cross-clone/moved-folder migration and cross-device sync: bounded disposable copies restore this observed repeated-read ability.
- Larger network limits, explanation-quality changes and general PR search: independent work with separate evidence.
- Forbidden fallbacks: automatic refetch/send, restore by repository name/PR number alone, silently accepting unsafe files, truncating originals as complete,
  claiming stored text is current/public/accepted, restoring removed measured-empty results as fresh, or treating an unavailable store as empty success.

## Acceptance criteria

These named tests/captures are required implementation proof, not results claimed by this draft.

1. Given the observed 39-PR selection saved successfully, when the installed app quits/relaunches offline and the person reselects its folder/period,
   then eligible originals reopen byte-identically with original versions, saved/unchecked labels and zero GitHub/model calls.
   Check: native restart captures at 2560×1440 and 1920×1080, request counts and Rust persistence round-trip cases.
2. Given saved PRs and a new HEAD containing their integrations, when a fresh receipt is collected, then eligible copies still open;
   other roots, replaced objects, changed remotes, expired grants, rewritten integrations, forged associations and late results cannot attach.
   Check: Rust identity/association cases and `tests/e2e/projects/git-pr-briefing.spec.ts` scope-change cases.
3. Given saved originals, when manual refresh changes text, succeeds empty, fails, is cancelled or is rate-limited,
   then replacement/removal/retention follow Flow 4–5 with exact timestamps and checked-integration reconciliation; a persisted fully measured empty result stays empty after restart.
   Check: Rust reconciliation cases and controlled GitHub-call/result cases in `git-pr-briefing.spec.ts`.
4. Given 0/1/39/40/401 entries, Hangul, oversized records and exact serialized-byte boundaries, when saving/restoring,
   then count/byte limits, oldest-read eviction, whole-record retention and omission/unchecked metadata hold.
   Check: Rust storage-boundary cases and source/preview coverage cases in `git-pr-briefing.spec.ts`.
5. Given planted symlinks, nonregular/oversize/corrupt files, digest/identity mismatch, unavailable safe operations and failed writes,
   when loading/saving, then no unsafe text/outside write occurs; fresh originals stay readable and no false persisted/empty claim appears.
   Check: native storage rejection/failure probes and corresponding rendered-state captures.
6. Given copies across two sources, concurrent processes, pending reads/writes and unrelated app data, when clear succeeds or partly fails,
   then clear is reachable after restart without a source grant and in an empty period, only owned copies change, pre-clear work cannot restore them across processes/restart, session labels remain correct and the result is truthful.
   Check: native clear/concurrency cases, app-data before/after inventory and installed-app clear/relaunch capture.
7. Given the running app and no source-code explanation, when a reader is asked to reopen yesterday's PR, identify its read time,
   say whether GitHub was checked now, and recover from failed refresh, then they do so from the screen without claiming complete discovery/current visibility.
   Check: source-hidden installed-app task transcript; preserve first confusion/failure. Automatic gates alone cannot pass this criterion.
8. Given saved/fresh originals, when arriving, changing dates, restoring, clearing or passing cooldown, then no automatic network/model send,
   repository/vault write or model-result persistence occurs; explicit preview and web degradation still work.
   Check: `git-pr-briefing.spec.ts` request counts, native receipts/source-tree comparison, web smoke and required `pnpm checks:changed -- --run` recommendations.

## Risks

1. Old author text appears current/complete: per-source provenance, original timestamps, remotely unchecked coverage and source-hidden recovery task.
2. Text crosses source/storage boundaries: filesystem scope plus fresh receipt/association proof; planted mismatch/symlink/cross-process race probes fail closed.
3. Retention promises outlive disk success/bounds: distinct saving/unsaved/evicted/clear-failed states and restart/disk-failure/interrupted-write probes.

## Later

1. Resume completed explanation parts after restart if repeated model work still blocks return after originals become reusable.
2. Reuse verified originals to reduce explicit refresh requests after version freshness and incomplete-discovery accounting have independent proof.
3. Broader history or moved-folder recovery after measured omissions or moves prevent a real reader from reopening needed work.

## Owner question

None. Bounded local retention, visible provenance and exact clear scope restore the observed ability within authorized work.
The lead can revert to session-only storage without changing source authority or model transfer; preserve adverse recovery evidence first.
