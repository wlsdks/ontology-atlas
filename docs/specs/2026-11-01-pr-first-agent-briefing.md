---
title: PR-first agent briefing
doc_type: spec
status: draft
area: git
date: 2026-11-01
decisions: [453ee956-0cea-490f-9fab-26ae1f143f5c]
---

# PR-first agent briefing

## Person and moment

The owner uses coding agents, sees too many low-signal commits, and asks to catch up on PRs, commits and files in separate views. They want collected PRs explained by the in-app coding agent, with originals accessible without an IDE, in the installed app first and a responsive web experience. They also ask for actual use and a rebuilt/reinstalled app walk. In two owner-provided screenshots at 02:13:12 and 02:13:37 on 2026-11-01, the same Code detail contains a 53-file list followed by seven commit messages; the owner asks to separate them and show only the chosen item in detail. The captures are session attachments at `/var/folders/c6/vccybz6x45s4csc77hq86dpc0000gn/T/orca-drops-501/orca-drop-SjEA2V/` and `/var/folders/c6/vccybz6x45s4csc77hq86dpc0000gn/T/orca-drops-501/orca-drop-fjcA6W/`. In a later installed-app walk the owner also found the one-color diff difficult to scan for additions and removals. Neither comprehension nor the new flow has yet been observed.

## Today

- Briefing reads a selected repository's current-HEAD first-parent commits by local calendar dates; separately counted merged-branch commits and uncommitted changes are excluded (`docs/features/change-briefing.md:11-20`). Selecting a repository directly does not open a vault or grant vault writes (`docs/features/change-briefing.md:76-83`; `src-tauri/src/git/briefing/tests.rs:510-532`).
- The explanation/PR reader currently appears only when the period has commits. Overview, Sources and Code are exclusive reading views, and the source reader retains its return position (`docs/features/change-briefing.md`). The Code group now separates files from commit messages; the file list and one comparison share wide screens, while narrow screens and text zoom show one pane at a time. Filtered navigation follows the visible matches and retains the search and list position across group and route returns. The installed build still needs its own walkthrough. A PR-only source inventory independent of commits is not yet implemented.
- Current PR reading uses public GitHub, matches descriptions against the selected first-parent commits, and reports unchecked commits and unlinked candidates (`src-tauri/src/git/briefing/prs.rs:225-260,266-309,344-388`). A local saved copy has its read time and unchecked current coverage; failed refresh preserves previous versions (`docs/features/change-briefing.md:78-83`). These are not a repository-wide PR list.
- The local-model explanation sends bounded whole author records, validates passage IDs, and keeps omissions distinct; a citation does not prove a claim or code behavior (`docs/features/change-briefing.md:84-95`; `src/views/change-briefing/model/narrative.ts:15-21,42-72`). Explanation quality and the owner's comprehension are not established.
- The existing ACP panel starts with a vault root as its working directory (`src/features/acp-session/model/use-acp-session.ts:820-835,992-1010`); the Map panel requires that root (`src/views/home/ui/TopologyAgentDock.tsx:302-317`). A queued opening request sends automatically when ready (`src/shared/lib/agent-chat/agent-chat-intent.ts:11-18`; `src/widgets/acp-chat-panel/ui/chat-panel/use-opening-request.ts:49-60,73-88`). The existing client and `autoDecide` can allow some reads without a card (`src/features/acp-session/model/acp-client.ts:447-475`; `src/features/acp-session/model/use-acp-session.ts:751-761,954-973`). A source grant is not a vault grant (`src-tauri/src/vault/scope.rs:25-50`); an app-owned working directory alone is not an operating-system sandbox.
- GitHub's [PR list API](https://docs.github.com/en/rest/pulls/pulls#list-pull-requests) supports open/closed/all and updated ordering, not a merged-date sort. Its [pagination](https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api) exposes subsequent pages. A private repository needs a credential with access and PR read permission; an inaccessible repository cannot be distinguished safely from a missing one on every failure. An anonymous one-record public API probe of this repository on 2026-11-01 returned the documented page and next-link plus status, draft, merged, updated and original-text fields; it did not test private access or completeness.
- The in-app-agent vault concept records the external runtime and human meaning decision, but marks its runtime measurements unreproduced (`docs/ontology/capabilities/in-app-coding-agent.md:16-29`); the MCP read reports review currentness not confirmed. Source-only ACP behavior is not established by that concept.
- Atlas has a separately approved GitHub MCP connector with read/write capabilities and keychain references (`docs/features/agents.md:160-193`; `src/shared/config/mcp-catalogue.generated.ts:54-83`); the current PR collector does not use it. On this Mac, `gh auth status --active --hostname github.com --json hosts` reported an active successful account on 2026-11-01, without displaying a token or account name. This does not establish access to any private repository. GitHub CLI can use existing credentials and has environment overrides ([GitHub CLI environment](https://cli.github.com/manual/gh_help_environment)).
- The 2026-10-26 record chose exclusive reading modes and a compact toolbar ([e33872d5](../records/decisions/2026-10-26-reading-first-git-briefing-e33872d5-45ee-4545-ba0d-e91635ebc0b5.md)); the 2026-11-01 record put original records ahead of generation ([55781ce6](../records/decisions/2026-11-01-briefing-records-before-generation-55781ce6-1508-432a-8df6-efebf7716a17.md)). The original PR spec deferred ACP until its different tool boundary could be established (`docs/specs/2026-10-25-git-pr-briefing.md:261-264`).

## Problem and alternatives

Rank by value against cost: (1) a real PR inventory with an explanation and accessible originals, including the owner's private projects when their existing account permits; (2) distinct commit and file reading, so only the chosen original or comparison occupies the detail; (3) richer PR date filters and providers. First is the owner's recurring catch-up problem; a prettier mixed summary leaves them assembling PR work from commits. Commit messages remain useful when PRs are unavailable or the person wants the granular history; file comparisons answer a separate code-reading question.

| Option | Value and usability | Cost, feasibility and local-first fit | Decision |
|---|---|---|---|
| Keep the mixed first-parent list and local-model explanation | Retains current capability; a PR unrelated to a selected commit cannot appear | Lowest change; avoids new account/agent boundaries | Reject: still requires reconstructing the PR inventory |
| Add PR/commit tabs over only the currently matched descriptions | Clear separation; saved matches remain useful | Small change and existing explicit lookup | Reject as the PR solution: absent, unchecked, unmerged and unlinked are not all PRs |
| Direct PR inventory plus an explicit in-app agent request, with separate commits | Shows open and merged work independently of local commits; exact author records remain reachable | New paginated read, optional GitHub CLI credential boundary, source-only ACP session and evidence validation; no hosted service | Choose, subject to the probes below |
| Let the coding agent discover PRs with arbitrary tools | Can use its own credentials, but the person cannot tell what was searched, transferred or omitted | Runtime/tool behavior varies and existing GitHub connector includes writes | Reject as inventory authority; keep tool actions visible and permission-gated |

This reopens e33872d5's mandatory Overview/Sources/Code selector: PRs, Commits and Files become the first choice, while each selected original or file comparison is an exclusive drill-in with exact return. It retains the compact toolbar, readable evidence and provenance. For the Files view this also replaces the old full-group previous/next rule with the active search result order and retains the search on return. Dissent: full-group navigation is stable even when filtering; filtering navigation is more legible when the list remains beside the comparison. Reopen if an installed walkthrough at the proof widths cannot identify the active sequence, loses the file on search/return, or makes the code unreadable. It reopens 55781ce6's mixed first list: PRs lead, but originals still appear before generation and the explicit lookup remains. It revisits the earlier ACP deferral at the owner's explicit request, without changing approval for writes or treating ACP as a text-only model. If the declared agent or credential boundary cannot be proven, the affected action stays unavailable and the implementation is incomplete; it must not claim full PR support.

Deliver and reinstall three independently verifiable units: (1) public PR list plus separate PR/commit/file reading and existing commit-only explanation; (2) account-bound private PR reading; (3) source-only ACP explanation and citations. The first gives usable originals but does not complete the owner's request. Begin unit 3 after unit 1 even if unit 2's credential proof is blocked; neither missing unit is silently represented as done. Each unit has its own installed-app proof below.

## Flow

1. When the person opens Briefing and chooses a repository and period, Atlas opens **Pull requests** first, with **Commits** and **Files** alongside it. PR and commit views contain only their named author records; Files contains file navigation and comparisons, never a commit-message list. Show the exact date basis and source before the list. Choosing any of these views, changing dates, entering it, or restoring a session sends no request to GitHub or an agent.
2. When the person explicitly reads PRs, Atlas presents the GitHub repository and either unauthenticated public access or, once verified, a chosen existing GitHub CLI account. Account detection that contacts GitHub also needs an explicit action. Multiple remotes require a choice. Public github.com reading is unit 1; private reading is unit 2 and is unavailable until the following credential and transport contract is proved. No app login, token entry or credential storage is added.
   Bind the displayed account's stable identity and host to one immutable per-scan credential or an account-specific handle whose immutability is proved, and verify that identity using the same bound credential before the first page. Every page uses that same binding; global `gh auth switch`, mutable active-account selection and before/after account-name checks are insufficient, including an A→B→A race. Abort before accepting a response if the binding expires, changes or cannot be established. If account-specific pinning cannot be proved for this CLI/platform, display `accountPinUnsupported` and leave private reading unavailable; public reading remains available. A successful login does not prove repository access or least privilege.
   Resolve the executable outside the selected repository, show its validated path/version, and bind the file identity actually executed to the validated executable for every invocation. Do not silently substitute a changed binary; fail closed if the platform cannot establish the check-to-execution boundary. Use a minimal explicit environment: strip inherited token/host/repository overrides, shell injection, debug, pager and notifier settings; disable interactive prompts and update checks. No implicit proxy, redirect or insecure TLS override is allowed. Never expose credentials in arguments, the renderer, diagnostics or logs. A credential may be held transiently in native process memory only for the bound read and never persisted by Atlas.
3. When the read runs, Atlas requests the selected repository's PR list across branches with open and closed state, newest `updated_at` first, then keeps PRs whose update timestamp falls within the inclusive selected local dates. Label each Open, Merged, Closed without merge, Draft as applicable, or unknown if the returned fields do not establish status. Created and merged dates do not determine membership. An older PR updated in the period can appear; a PR merged in the period but updated only outside it can be absent. This is not a list of PRs merged in that period.
4. When reading pages, Atlas constructs each request itself for the selected validated owner/repository and its `pulls` endpoint, with fixed `state=all`, `sort=updated`, `direction=desc`, page size and positive page number; it never sends a server-supplied next URL directly. The method is explicitly `GET`, including when using `gh api` parameters. A next link only signals the next page after validating its host, endpoint, repository and fixed query. Reject different repositories, paths, hosts, parameters or redirects; do not forward a credential to any redirect. One explicit action reads at most five pages of 20 records, 2 MiB or 60 seconds, whichever comes first. Count examined entries separately from distinct matching PRs: the identity is the canonical repository plus PR number, so a PR counts once even when multiple versions are observed. Preserve each observed original version, digest and read time within the stated limits; mark a changed version and coverage as uncertain, and require the person to review and choose one retained version before sending. If a limit prevents retaining a version, keep its identity and omission visible and block analysis of that unavailable version. Offer another explicit read when safe. Stop at the first safely observed update older than the period or the end, but say the moving list can change during paging; neither result certifies an atomic complete inventory. Keep at most 400 complete originals/16 MiB in the app session, with a 512 KiB per-original limit; never pass a truncated original as complete.
   If one page exceeds the response bound, preserve prior results and offer `retrySmaller`: restart at page 1 using a strictly smaller page size (20→10→5→2→1), deduplicate previously seen records, and retain an explicit partial-coverage warning because GitHub's list may move. Each retry is a separate press; never continue forever on the same page and size. If a size-one page still cannot be read within the bound, stop and show `scanCannotContinue`, with an explicit external GitHub link and retained originals; do not skip the unread page or suggest that narrower dates necessarily bypass it. A parsed individual record over 512 KiB is an identified, unsent gap; an unreadable size-one response may not reveal its identity.
5. When a prior public saved copy is eligible, show it as a saved copy linked to selected first-parent history, with its original read time and unchecked current PR list. It is not a fresh repository-list result. Current matched, unchecked and unlinked candidate counts stay distinct from the independently discovered PR list. A GitHub failure or 403/404 leaves prior results and dates intact and says access is unknown; never silently fall back, report no PRs, or retry automatically. Public saved-copy behavior remains; newly read private originals stay in session memory only.
6. When the person selects complete PRs and prepares an explanation, Atlas retains the request in Briefing and previews each exact source packet, all Atlas-supplied instructions, source identities and versions, editable question, omissions, agent/mode/working folder and the exact number of ACP part turns Atlas will send. This count does not include runtime initialization or provider-internal network requests, whose number is unknown. Each part starts a fresh ACP session; Atlas does not put earlier generated answers, tool output or session transcript into later parts. Runtime/provider-internal context is unknown unless independently established and must be disclosed as unknown. There is no overview request in the initial plan: the report groups validated per-source claims without generating new headings or claims. The Commits view retains the existing explicit local-model explanation using only complete commit records; it sends no PR descriptions. Before the first Send, cancelling, changing tabs or opening an original sends nothing and retains the editable plan.
7. When the person explicitly sends, the coding runtime may use its own tools and provider. Before sending, show for the exact runtime/version/mode what is measured as allowed, denied, permission-gated, auto-allowed or unknown for filesystem reads/writes, process execution, network and connectors, including any self-loaded tools and the destination when known. An app-owned working directory is not an OS sandbox and is not evidence that other paths or the network are inaccessible. Do not promote a source grant to a vault grant, attach the vault or external connectors silently, or route the request through the existing automatic opening-request path. The PR session must not inherit `autoDecide` or the ACP client's automatic read allowances for non-previewed sources; unapproved outside reads, writes, commands and non-provider network transfers must be blocked or reach an explicit permission card. Enable only a runtime/version/mode whose effective enforcement was measured in the native environment; otherwise show `unverifiedRuntime` and do not send. Use the new `folder` message only for a source-only session, since a vault session can have a different working folder.
8. When the initial Send is pressed, it authorizes exactly the previewed number of sequential part turns, their full inputs and the stated fresh-session policy; no later synthesis or unpreviewed transfer is implied. Each complete fitting original is in exactly one part and is never split or silently truncated. Once the run starts, switching tabs or opening an original is navigation only: it does not start another run, pause the current one, or add requests; the person can explicitly Stop. A part known not to have been sent uses `notSent` and may be retried explicitly. If a stop, disconnect or failure occurs after send may have begun, show `deliveryUnknown`, preserve completed parts and originals, and do not treat that part as unsent or retry it automatically. The person may explicitly skip it, leaving a visible unexplained gap, or choose `retryUnknown` after seeing `retryWarning` that delivery may be duplicated. Continue sends only previewed unattempted parts after each unknown is explicitly resolved. A separately named oversized or unavailable record remains readable and unexplained.
9. When the agent responds, present concise changes, reasons, author-reported checks and unresolved limits as separate claims. Generated text may appear in the report only through a closed schema of claim text plus submitted source identity, exact passage ID and source version; reject missing, foreign or stale IDs. Headings and PR identifiers come from static interface copy or the original source identity, never from a free-form generated title. A claim may still combine supported and unsupported assertions: validating an ID proves only that the cited submitted passage exists, not that the text supports the claim, that every clause is covered, or that code behaves as described. Show `citationLimit`, mark inference and gaps, and let the person inspect the pinned original. Retain rejected or raw agent output separately as an unverified transcript, never as an accepted report. Treat PR text as untrusted data rather than instructions.
10. When the person opens a PR or commit, Atlas replaces the list with that one original, showing its identity and scope. A citation opens the pinned original at its exact submitted passage; Back restores the originating row or claim, focus and scroll. No unrelated original, commit list or file list is expanded under the selected record.
11. When the person chooses Files, Atlas shows the period's navigable file groups without commit messages or PR descriptions. Choosing a group opens only its files; search covers every path and shows total and matched counts in the existing group order. On wide desktop, a bounded, independently scrollable file list and the one selected comparison sit side by side. With no selection, the comparison seat asks the person to choose a file. On narrow widths and at text zoom, show the list or one comparison at a time, with Back to files restoring the same query, row, focus and list scroll.
12. When searching, Previous and Next use only matching paths in their original group order, with labels saying they are search matches. A zero-match search keeps the query and current comparison but disables both controls. If the open file is excluded by a new search, keep that comparison and disable both controls until a matching file is selected or the search is cleared. Clearing search restores full-group order from the open file. Without a search, Previous and Next use full-group order. Tab reaches search, rows, Previous/Next and Back; Enter/Space activates the focused control. Resizing preserves selection and focus.
13. When the person opens a file, the one comparison shows its full path, both selected period endpoints and the possibility of intervening out-of-period changes; it is not a per-commit diff or verified PR change. Preserve the original +/− line markers and distinguish added and removed lines with visual treatment that does not depend on color alone; headers and context remain recognizable, text remains selectable and copying preserves the original patch. Show binary, truncated, unavailable and no-difference states using existing messages, never implying a partial patch is complete. Back to groups clears the active group and file selection, actually shows the group overview and returns focus to the group row. Re-entering the group restores its prior query and list scroll for this session. Large lists remain bounded and browsable without pushing unrelated sections onto the page.
14. When the person moves from a commit to its recorded touched files, Atlas filters the Files view to that commit's recorded paths but still labels each comparison as the selected period's endpoints. From a PR, offer period files only, unless a PR-to-local-history match has separately been established; never call all period files the PR's files. Back returns to the originating PR or commit. Preserve earlier mixed explanations as labelled earlier mixed results, not as PR-only or commit-only results. A repository, remote, period, selected source version, account, agent, or request change retires the unsent plan; an older result remains attributed to its original scope.

## States

| State | Web | macOS app |
|---|---|---|
| First entry / no folder | `prTab`, `commitsTab`, `filesTab`, `web`; switch tabs or open the app | `prTab`, `commitsTab`, `filesTab` and existing repository picker; choose a folder |
| PR not yet requested | `web`; open the app | `prScope`, `readPrs`; inspect saved copies or choose a public/CLI read |
| No commits but PR updates | `web`; open the app | `prTab`, `readPrs`; read the independent PR list |
| Reading | `web`; open the app | `prLoading` for public or existing `gitBriefing.prLoading` for CLI; stop and retain prior records |
| Empty, scan reached period/end | `web`; open the app | `prEmpty`; choose dates or refresh explicitly |
| Partial page, bound or rate limit | `web`; open the app | `prPartial`, `prCoverage`, `prMore`; read more when available or inspect what was read |
| Oversized page | `web`; open the app | `retrySmaller` or `scanCannotContinue`; restart smaller or stop and retain results |
| Unavailable, offline or access denied | `web`; open the app | `prFailed` or `privateUnavailable`; retry explicitly or read retained originals |
| File list, selected file or unreadable comparison | `web`; open the app | `filesTab`, `filesScope`, `chooseFile`, `fileComparison`, `periodBasis`, `backToFiles`, `filePartial` and existing `changeBriefing.patchBinary` / `patchTruncated`; select one file or return |
| Search empty, selected file filtered out | `web`; open the app | `noFileMatch` or `selectionFiltered`; select a match or clear search to restore full order |
| Multiple versions of one PR | `web`; open the app | `versionConflict`, `reviewVersions`; inspect available originals and choose one before sending |
| Saved/matched/unchecked/unlinked | `web`; open the app | `prSaved`, `linkedUnchecked`, `linkedUnlinked`; open saved originals or request a fresh list |
| Private credential absent or account binding unproved | `web`; open the app | `githubNotReady` when absent; otherwise `accountPinUnsupported`; choose public reading or repair and return |
| PR preview and unready agent | `web`; open the app | `preview`, `destination`, `folder`, `agentPermissions`, `noAgent` or `unverifiedRuntime`; edit request, choose an agent, send or cancel |
| PR agent running/stopped/failed | `web`; open the app | `working`, `stopped`, `failed`, `notSent`, `continue`; stop, retry a known-unsent part or read completed parts |
| Delivery of a part unconfirmed | `web`; open the app | `deliveryUnknown`, `skipUnknown`, `retryUnknown`, `retryWarning`; skip or explicitly resend after warning |
| Wrong, unsupported or partial PR answer | `web`; open the app | `invalid`, `unverified`, `citationLimit`, `partialResult`; inspect raw answer and originals or retry |
| Stale PR folder, dates or records | `web`; open the app | `stale`; reselect/review and prepare again; old results and the draft remain attributed |
| Largest measured period | `web`; open the app | `prCoverage`, `partialResult`; account for the previously observed 39 PR originals; the new list path itself has not yet been measured |

## Copy

The following exact keys are in all four `messages/{en,ko,ja,zh}/prBriefing.json` catalogues. Existing actions such as the repository picker and app link retain their existing keys.

| Key | Where it appears | English |
|---|---|---|
| `prBriefing.prTab` | View switch | Pull requests |
| `prBriefing.commitsTab` | View switch | Commits |
| `prBriefing.prScope` | View scope | PRs updated in the selected local dates across this GitHub repository, including open and closed PRs. This is not a list of PRs merged during those dates. |
| `prBriefing.commitScope` | View scope | Commits on the current branch's first-parent history, using the selected local dates. |
| `prBriefing.readPrs` | GitHub read | Read GitHub PRs |
| `prBriefing.prTransfer` | GitHub read | GitHub receives {repository}; Atlas requests its public PR list. This read sends no Git credentials, commit messages or code. |
| `prBriefing.prLoading` | GitHub read | Reading the public PR list… |
| `prBriefing.prEmpty` | GitHub read | No PRs updated in these dates were returned. GitHub's changing list may have omissions. |
| `prBriefing.prPartial` | GitHub read | PR list reading stopped before finishing these dates or reaching the end of the list. More PRs may be missing. |
| `prBriefing.prMore` | GitHub read | Read more PRs |
| `prBriefing.prFailed` | GitHub read | Could not read the PR list. Earlier results stay available; check the connection and retry. |
| `prBriefing.prCoverage` | GitHub read | Examined {scanned} PR entries on GitHub; {shown} distinct PRs have update dates in this period. The list can change while it is read. |
| `prBriefing.prSaved` | PR original and status | Saved copy linked to a commit in these dates. Atlas has not checked this copy against GitHub. |
| `prBriefing.prFresh` | PR original and status | PR updated {updatedAt} · read {fetchedAt} |
| `prBriefing.statusOpen` | PR original and status | Open |
| `prBriefing.statusMerged` | PR original and status | Merged |
| `prBriefing.statusClosed` | PR original and status | Closed without merge |
| `prBriefing.statusDraft` | PR original and status | Draft |
| `prBriefing.statusUnknown` | PR original and status | Status unavailable |
| `prBriefing.linkedUnchecked` | PR original and status | {count} commits have not been checked for matching PRs. |
| `prBriefing.linkedUnlinked` | PR original and status | {count} PR candidates could not be tied to these commits and were excluded from the linked-history list. |
| `prBriefing.prepare` | Agent preparation | Prepare an agent explanation |
| `prBriefing.preview` | Agent preparation | ACP part turns Atlas will send: {parts}. Review the originals, your request and omissions. Runtime setup and provider-internal network request counts are unknown. |
| `prBriefing.destination` | Agent preparation | {agent} may send these records and anything its tools read to its provider. Review tool permission requests as they appear. |
| `prBriefing.folder` | Agent preparation | Agent working folder: {folder}. The selected repository is not the agent's working folder. |
| `prBriefing.send` | Agent preparation | Send to agent |
| `prBriefing.cancel` | Agent preparation | Cancel |
| `prBriefing.working` | Agent progress and result | The agent is explaining part {current} of {total}. |
| `prBriefing.stopped` | Agent progress and result | Stopped. Completed parts and the original PRs are kept. Check each part’s delivery status before continuing. |
| `prBriefing.continue` | Agent progress and result | Continue remaining parts |
| `prBriefing.failed` | Agent progress and result | The agent could not finish this part. The PRs and completed parts are kept; check whether it was sent before retrying. |
| `prBriefing.invalid` | Agent progress and result | The agent's answer cites missing or unavailable PR passages. It was not added to the explanation; inspect the answer or retry. |
| `prBriefing.stale` | Agent progress and result | The repository, dates, agent or PR records changed. The previous explanation keeps its original scope; prepare again to continue. |
| `prBriefing.result` | Agent progress and result | Agent explanation |
| `prBriefing.unverified` | Agent progress and result | The explanation interprets PR author records. It does not verify code behavior or test results. |
| `prBriefing.partialResult` | Agent progress and result | This explanation is partial. Open coverage for records that were not read, sent, cited or explained. |
| `prBriefing.noAgent` | Agent preparation | No supported coding agent is ready. Set up an agent, then return to this request; the PRs stay available. |
| `prBriefing.noRecords` | Agent preparation | Choose at least one complete PR record to prepare an explanation. |
| `prBriefing.original` | Original reader | Open original PR |
| `prBriefing.return` | Original reader | Back to explanation |
| `prBriefing.web` | Web limitation | Reading local Git history and running a coding agent need the installed app. |
| `prBriefing.publicChoice` | GitHub read | Public GitHub |
| `prBriefing.githubAccount` | GitHub read | GitHub CLI account |
| `prBriefing.privateTransfer` | GitHub read | GitHub CLI will use {account} on github.com to request PRs from {repository}. The account's existing permissions apply. Atlas keeps private originals only in this app session; sending them to an agent may create copies elsewhere. |
| `prBriefing.privateUnavailable` | GitHub read | Could not read this repository with the selected GitHub CLI account. Check its repository access and pull request read permission, then retry. |
| `prBriefing.githubNotReady` | GitHub read | GitHub CLI is unavailable or not signed in on this Mac. Read public PRs or set up GitHub CLI and retry. |
| `prBriefing.commitPrepare` | Agent preparation | Prepare a commit explanation |
| `prBriefing.commitNone` | Agent preparation | Choose at least one complete commit record to prepare an explanation. |
| `prBriefing.commitOriginal` | Original reader | Open original commit |
| `prBriefing.filesTab` | View switch | Files |
| `prBriefing.filesScope` | View scope | Files touched by first-parent commits in the selected period. Opening a file compares the selected period's endpoints. |
| `prBriefing.filesFromCommit` | Files view | View files touched by this commit |
| `prBriefing.filesFromPr` | Files view | View files touched in this period |
| `prBriefing.filesFromPrNote` | Files view | These are files touched in the selected period, not a verified list of files changed by this PR. |
| `prBriefing.fileComparison` | Files view | Period endpoint comparison |
| `prBriefing.backToFiles` | Files view | Back to files |
| `prBriefing.filesEmpty` | Files view | No files were recorded for this scope. Choose another period or return. |
| `prBriefing.filePartial` | Files view | Some file changes could not be read. Refresh or return to the file list. |
| `prBriefing.backToCommit` | Original reader | Back to commit |
| `prBriefing.backToPr` | Original reader | Back to PR |
| `prBriefing.chooseFile` | Files view | Select a file to compare for this period. |
| `prBriefing.previousMatch` | Files view | Previous matching file |
| `prBriefing.nextMatch` | Files view | Next matching file |
| `prBriefing.selectionFiltered` | Files view | The open file does not match your search. Select a match or clear the search to navigate. |
| `prBriefing.noFileMatch` | Files view | No files match this search. Clear the search to see all files. |
| `prBriefing.backToGroup` | Files view | Back to groups |
| `prBriefing.periodBasis` | Files view | Compares {before} to {after}, not a single PR or commit. Intervening changes may fall outside the selected dates. |
| `prBriefing.accountPinUnsupported` | GitHub read | Atlas cannot safely keep this GitHub account fixed during reading. Public PR reading is still available. |
| `prBriefing.retrySmaller` | GitHub read | Read again using smaller pages |
| `prBriefing.scanCannotContinue` | GitHub read | This page is still too large to read. Earlier PRs remain available; stop or open the repository on GitHub. |
| `prBriefing.unverifiedRuntime` | Agent preparation | Atlas cannot verify this agent’s permissions. Choose another agent or review its setup. |
| `prBriefing.agentPermissions` | Agent preparation | Review what this agent can read, write, run and send. Unverified access is marked unknown. |
| `prBriefing.notSent` | Agent progress and result | Part {part} was not sent. Retry when ready. |
| `prBriefing.deliveryUnknown` | Agent progress and result | Delivery of part {part} is unconfirmed. The agent may have received it. |
| `prBriefing.skipUnknown` | Agent progress and result | Skip this part |
| `prBriefing.retryUnknown` | Agent progress and result | Send this part again |
| `prBriefing.retryWarning` | Agent progress and result | The agent may have received this part. Sending it again may duplicate the request. |
| `prBriefing.citationLimit` | Agent progress and result | Citations locate passages; they do not prove the explanation is supported. |
| `prBriefing.versionConflict` | PR original and status | PR #{number} was seen in multiple versions. Review the available versions before sending. |
| `prBriefing.reviewVersions` | PR original and status | Review versions |

| `prBriefing.selectionTitle` | Manual PR preparation | Select PRs to review |
| `prBriefing.selectPr` | Manual PR preparation | Select PR #{number}: {title} |
| `prBriefing.selectedPrs` | Manual PR preparation | {count} selected |
| `prBriefing.reviewSelected` | Manual PR preparation | Prepare agent request |
| `prBriefing.questionLabel` | Manual PR preparation | What should the agent explain? |
| `prBriefing.questionDefault` | Manual PR preparation | Explain the changes, why they were made, reported checks, and known limitations. |
| `prBriefing.manualNotice` | Manual PR preparation | Atlas does not send this request. Your agent may read other files or send data according to its settings. |
| `prBriefing.manualParts` | Manual PR preparation | {count} copyable parts |
| `prBriefing.manualPart` | Manual PR preparation | Part {number} of {total} |
| `prBriefing.copyPart` | Manual PR preparation | Copy part {number} |
| `prBriefing.copiedPart` | Manual PR preparation | Part {number} copied. |
| `prBriefing.copyFailed` | Manual PR preparation | Could not copy. Select the packet text and copy it manually. |
| `prBriefing.packetText` | Manual PR preparation | Exact packet |
| `prBriefing.selectedOriginals` | Manual PR preparation | Selected PR originals |
| `prBriefing.omittedUnavailable` | Manual PR preparation | PR #{number}: original unavailable |
| `prBriefing.omittedOverlarge` | Manual PR preparation | PR #{number}: original exceeds the part limit |
| `prBriefing.previewEmpty` | Manual PR preparation | Enter a question and select at least one PR. |
| `prBriefing.previewStale` | Manual PR preparation | The repository or PRs changed or cannot be checked. Check the repository or refresh, then prepare again. |
| `prBriefing.backToSelection` | Manual PR preparation | Back to PR selection |
| `prBriefing.appAgentUnavailable` | Manual PR preparation | In-app agent analysis is not available yet. |
| `prBriefing.backToPreparation` | Manual PR preparation | Back to preparation |
| `prBriefing.questionTooLong` | Manual PR preparation | The question is too long. Shorten it and try again. |

| `prBriefing.checkingSource` | Manual PR preparation | Checking source… |

| `prBriefing.packetInstructions` | Manual PR preparation | Instructions |
| `prBriefing.packetRaw` | Manual PR preparation | Exact copied text (JSON) |
| `prBriefing.copyRequestTitle` | Manual PR preparation | Ready to copy |
| `prBriefing.copyRequest` | Manual PR preparation | Copy request |
| `prBriefing.copiedRequest` | Manual PR preparation | Copied. Paste it into your coding agent. |
| `prBriefing.omittedList` | PR inventory | Omitted PRs |
| `prBriefing.nativeOmittedOversized` | PR inventory | Original exceeds the read limit |
| `prBriefing.nativeOmittedLimit` | PR inventory | Read limit reached |
| `prBriefing.sessionOmittedLimit` | PR inventory | Session storage limit reached |
| `prBriefing.nativeOmittedUnlisted` | PR inventory | Additional omitted PRs are not listed. |

## Edge cases

- Zero selected-period commits does not block a PR-list read; zero scanned PRs, one PR, open/draft/merged/closed, and the previous largest measured 39 PR originals all have distinct, testable results. The earlier 39-original period is recorded in `docs/specs/2026-10-26-git-pr-period-coverage.md:14-17`. The direct list's largest real period is unknown; synthetic paging and limit probes do not establish a measured maximum.
- A malformed or inconsistent next link, a moved item, duplicate PR number, changed body, partial response, oversize original, or a rate limit is not silently counted as a complete read. Never follow a server-supplied URL, even on GitHub, to another repository or endpoint; construct the fixed request and page locally. A retry or smaller-page restart is explicit.
- First run can select a source without creating a vault. Hangul composition in the editable request is preserved. A moved, renamed, replaced or unreadable folder retains the text and prior attributed results, but blocks a new plan/send until the person reselects it.
- A concurrent period, remote, credential, agent or source change retires an unsent plan and rejects stale late results. Concurrently changed GitHub pages remain a possible collection gap; do not call a moving pagination result a snapshot.
- Offline, expired credentials, denied repository permission, unavailable runtime or rejected answer preserve original records and the request. Private PR content must not be saved to the existing public-copy cache, logs, error messages or a vault. A coding runtime/provider may retain data after explicit sending, and Atlas cannot promise otherwise.

## Out of scope

- GitHub Enterprise Server, other forges, importing arbitrary URLs, new login or token entry: this slice reuses an existing github.com CLI account or public read.
- PR-specific diffs, review comments, CI/check results and independent verification: this slice analyzes author descriptions and shows local period-endpoint comparisons, not an individual PR diff or verified test result. Missing evidence stays unknown.
- Accepting ontology meaning, automatic source writes, unattended collection, automatic agent sends and background polling: the person keeps those decisions.
- Created-date and merged-date filters: updated-date membership is explicit; add other choices when the owner needs those separate questions.

## Acceptance criteria

1. Given a selected repository and period with zero first-parent commits but real PR updates, when the installed app reads the direct PR list, then a real open PR and a real merged PR in the chosen range are individually visible with their correct state and original. A fixture also covers closed-without-merge and missing status; no vault is created. Capture the selected dates, returned update times and first entry.
2. Given a real period whose lookup stops after only some pages, when the person reads, stops and explicitly continues, then counts and incomplete coverage remain visible, earlier results survive, and no retry or missing-history conclusion occurs. Real transport fixtures must reject altered hosts, owner/repository, endpoint and query, redirects, non-GET methods and credential forwarding. Exercise an oversized page through at least two explicit smaller-page restarts and a size-one oversized response: progress is visible or the stop/link path is reachable; no unread page is skipped. A fixture presenting two body versions of the same repository/PR number must count one PR, retain both observed versions and timestamps within limits, mark the version/coverage uncertainty, and require an explicit version choice; stale analysis cannot silently replace either. Native transport tests plus installed captures distinguish a finished scan from atomic completeness.
3. Given an existing GitHub CLI account with permitted private PRs, when the person chooses it and explicitly reads, the same immutable account-specific credential must authenticate identity verification and every page; a real private original opens without exposing a token in renderer, argv, diagnostics, logs or saved copies. Fixtures for A→B→A active-account changes, inherited token/host/debug/pager/notifier/proxy settings, binary replacement during check/launch and between pages, and identity mismatch must never send or attribute data under the wrong account. No global account switch is permitted. Missing or expired credentials, 403/404 and partial responses preserve the draft; if the executable-to-process or credential binding cannot be proved, the private path stays unsupported. An inaccessible real private repository leaves private support unverified.
4. Given both PRs and commits plus a previously saved linked PR and an old mixed explanation, when switching the three views, selecting one item and preparing requests, then PR requests contain no commit messages, commit requests contain no PR descriptions, Files contains no commit messages, and saved/matched/unchecked/unlinked labels do not claim a fresh full list. A 53-file/seven-commit fixture and installed walk prove only the selected record or file comparison is expanded, wide list/diff and narrow single views work, and the comparison's endpoints are labelled. Probe zero matches, filtering out the selected file, clearing search, filtered previous/next in original group order, keyboard use, actual group-overview return, and list query/focus/scroll restoration. The installed diff shows distinct additions/removals with +/− retained without color alone, the complete path and both revisions; a real or fixture comparison preserves copied patch text and visible binary/truncation states.
5. Given source-only and open-vault entries, when previewing/cancelling and sending, ACP fixtures prove zero turns before Send, the exact disclosed parts after Send, no grant promotion and no silent vault/connector attachment. For every enabled runtime/version/mode, an installed native probe must measure actual filesystem reads/writes, process execution, network, connectors and both auto-allow paths, with planted hostile PR text and canary outside reads, writes, commands and non-provider transfers. Verify the real OS effects and network, not only a transcript; unsupported or changed permission behavior blocks the action. Capture actual agent, mode, working folder, displayed permission states and outcome. Cwd alone is never proof of isolation.
6. Given real selected PR originals and an actual ACP response, when the person follows a displayed claim, its citation opens the exact submitted version and returns to the claim. Reject invented IDs, old passage versions, unknown schema fields and hostile generated titles from the report; headings use source identity or static copy. A fixture containing one claim with both supported and unsupported assertions must remain visibly unverified, not be passed as semantically supported just because its ID exists. A live source audit retains adverse checks or named limits where present and separates author text, ACP output and code verification.
7. Given 39 previously observed PR originals, one oversized source and multiple parts, capture before Send the exact instructions, source packets, fresh-session policy and number of subsequent ACP part turns Atlas sends; the UI separately states that runtime initialization and provider-internal network request counts are unknown. Later parts contain no earlier generated answers, tool output or transcript from Atlas. Probe tab changes before Send and while running, confirmed-unsent versus delivery-unknown failures, Stop, explicit skip and explicit resend with duplicate warning. Account for sent/unsent/unknown/explained records, preserve completed parts and reject stale late output. Exercise Korean IME and folder move/rename/unreadable recovery in focused tests and the installed walk.
8. Given each completed unit, rebuild and reinstall the macOS app and capture its own installed walk: (1) public PR, commit and file separation at 2560 and 1920 widths; (2) a real permitted private PR or a visibly unsupported account path; (3) a real source-linked ACP response under a measured runtime. Routed UI proof covers keyboard, reduced motion, narrow width/zoom and responsive web limitations. `pnpm checks:changed -- --run` and all recommendations pass for each change. A partial unit is not the completed request; actual comprehension remains unclaimed without the owner’s response.

## Risks

1. PR results appear complete despite mutable pagination, partial reads or an unavailable private repository. Probe zero-commit/open/merged cases and a real interrupted page; expose scan scope, account and unknowns.
2. A polished agent answer misattributes or omits adverse evidence, or follows instructions in a PR. Probe hostile text, incorrect citations and real author passages; preserve raw output and let the person inspect the original.
3. Reusing credentials or starting ACP widens access or leaks private text. Probe immutable account/binary binding, endpoint-constrained GET and redaction, session-only private copies, and real runtime effects; disable any unproved boundary.

## Later

1. Unit 2: private PR reading with proven per-account credential and executable binding, after unit 1; an unproved path stays unsupported.
2. Unit 3: source-only ACP explanation and claim/citation validation after unit 1; start even if unit 2 is blocked, and do not claim the goal complete without it.
3. GitHub Enterprise Server and other forges, when real repositories cannot use github.com and host/credential boundaries are measured.
4. Created-date and merged-date PR lists, when the owner needs those questions separately from updated-date catch-up.
5. PR-specific review inside Atlas without an IDE: read the actual changed-file list and diff for the PR’s pinned base/head revisions, review comments and GitHub-reported CI/check results as separate attributed evidence from the author’s description. Show version, coverage and missing/partial states for each; GitHub-reported status does not independently verify code or tests. Define and measure the access/transfer boundary before implementing; none of this is provided by the current author-description flow.

## Owner question

None — the owner already requested PRs, commits and the existing agent; updated date is named on screen and can later gain a different date basis.
