# CHANGELOG

> Major change history. Code commit messages answer *why*; this file answers
> *when / which surface changed*, for a person who uses the product.
>
> Newest at the top. One entry per release, named by its tag; the single
> `Unreleased` entry at the top collects what has merged since the last tag,
> and the release cut renames it. `v1.0.0` shipped on 2026-09-01 after
> nineteen release candidates.
>
> **Versioning baseline (2026-09-01, from v1.0.0).** `package.json` is the
> version authority, and the v-prefixed release tag must match it together with
> `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` (`pnpm desktop:check`
> enforces the alignment). From here:
>
> - **Patch (`1.0.N`)** is the default for every release: bug fixes, hardening,
>   copy, and small improvements. N has no ceiling and never rolls over into a
>   minor: `1.0.200` is an ordinary, expected version.
> - **Minor (`1.X.0`)** marks a new user-visible capability or surface, or a
>   backward-compatible MCP/CLI/schema addition.
> - **Major (`X.0.0`)** marks a break in a public contract or the local-first
>   promise, and convenes the PO council before the work.
> - `-rc.N` prereleases are no longer the default; cut one only when a release
>   needs a public soak before the plain tag.
>
> **Entry format.** A dated heading that names the release, then one to four
> category lines in this order, each a single line, within 6 lines and 900
> bytes. `pnpm changelog:check` (part of `pnpm docs:check`) refuses anything
> else. A pull request adds to the `Unreleased` lines; what a user cannot see
> belongs in the commit message.
>
> ```md
> ## YYYY-MM-DD · vX.Y.Z: <what this release means in one line>
>
> **Added**: <a new user-visible capability or surface>
> **Changed**: <behavior that differs from before>
> **Fixed**: <what was wrong and is now right>
> **Removed**: <what no longer exists>
> ```
>
> On 2026-09-02 every earlier entry (415 of them, most in Korean, one per pull
> request) was condensed into this shape and translated to English; dates and
> release markers are unchanged, and the original text stays in Git history
> before commit `ed15e6ec5`.

---

## 2026-09-05 · Unreleased: changes since v1.0.6

<<<<<<< HEAD
**Added**: Lookups show targets; an MCP screen, external Connectors off by default. Library opens on a live graph of named sources and write-ups (drag/hover/zoom), guides three steps in a popup, compiles on a local model behind a card. Insights repairs back-links. Meaning asks reasons; trails say how steps connect. Strata, a third 3D view: labelled planes.

**Changed**: Insights opens on four measurements; Cone fills its canvas; Strata's plane names ride a trailing legend, lit on hover; chat widens, keeps a clock, one height, a shut dock; Agents and MCP read one column; connection cards lead with reasons; toasts sit under the toolbar.

**Fixed**: 3D relations stay visible at rest; a concept's centre clicks; repeat lookups fold to a row; permission cards read plainly; saved analyses announce once; rails stop blinking; reason fields grow; footprints follow curves; docks name tool and mode.
=======
**Added**: Lookups show targets; an MCP screen, external Connectors default off. Library opens on a graph of sources and write-ups, guides three steps in a popup, compiles on a local model behind a card. Insights repairs back-links. Meaning asks for reasons; trails say how steps connect. Strata, a third 3D view: labelled planes.

**Changed**: Insights opens on four measures; Cone fills the canvas; Strata's plane names follow their planes or a corner, lit on hover; chat widens, keeps a clock, one height, closed dock; Agents and MCP read one column; connection cards lead with a reason; toasts sit under the toolbar.

**Fixed**: 3D relations stay visible at rest on any screen; a concept's centre is clickable; repeat lookups fold to a row; permission cards read plainly; saved analyses announce once; rails stop blinking; reason fields grow; footprints follow curves; docks name tool and mode.
>>>>>>> origin/main

## 2026-09-05 · v1.0.6: the in-app Claude chat keeps its permission gate

**Fixed**: The in-app Claude chat no longer offers the Auto mode that decides permissions by itself; a mode is judged by the class its adapter states, not only its name, and when the tool moves a conversation into a mode that accepts edits without asking, the screen says so and never offers that mode back.

## 2026-09-04 · v1.0.5: the map replays and cones its ontology, and a task handoff follows reviewed claims

**Added**: A play tile replays the ontology appearing piece by piece; `+`, `-` and `0` zoom and fit the map; an architecture profile can carry a role's sentence per locale.
**Changed**: The 3D ownership view is a cone tree named Cone that morphs to and from Cloud; hovering a concept lights its own relations; rail screens crossfade. A profile with `summary_<role>_<locale>` needs this version to open.
**Fixed**: Dimmed nodes keep a findable ring and labels stay off neighbours; the overview frames expanded concepts; the tour names the ringed dot and offers a button when it is off screen; search, settings, projects and Agents screens say what they mean; Codex ACP runs the reviewed adapter read-only behind allow/reject cards; a task handoff selects the capability its name or Includes claim and verifies coordinates against live files; CLI exit codes say whether the input was answerable.

## 2026-09-02 · v1.0.4: the installed app proves its own bundle, and the records fit one screen

**Changed**: The changelog and the decision ledger now follow fixed one-screen templates in English, with gates that refuse anything else; ontology qualification no longer assumes an FDE persona unless the project owns that audience with evidence.
**Fixed**: A local deploy fails when the installed app bundle differs from the built one, so a stale app or MCP server cannot pass as current; evidence keeps the exact letter case of paths like `readme.md`; a README that mixes current and outdated sections only flags the outdated lines; reviewed concept text saves byte for byte; an unrelated reStructuredText section no longer marks current information as deprecated.
## 2026-09-01 · v1.0.3: the CI planner stops missing PRs, and the harness can be judged

**Changed**: Internal CI checks and release-health reporting were strengthened to catch gaps earlier and stay accurate over time.
**Fixed**: Renaming a node in the browser now keeps all its relations to other concepts instead of leaving broken links; a concept titled `2026` no longer gets misread as a number; project pages show their own social preview image again instead of the generic site image.

## 2026-09-01 · v1.0.2: the full-codebase sweep hardens every write path

**Fixed**: Vault writes, renames, and merges no longer corrupt edges or drop relations; Korean file names work throughout the CLI, web, and desktop git tools; CLI commands keep their documented behavior; deep links survive locale switches; the map stops burning idle CPU; and numerous smaller editor and agent bugs are resolved.

## 2026-09-01 · v1.0.1: the post-release bug sweep lands

**Fixed**: An in-app agent's own file edits inside the vault now ask for permission first; relation aliases, renames, and merges no longer corrupt or duplicate links; `absorb_document` rolls back cleanly on failure; Hangul file names resolve correctly; frontmatter booleans and numbers survive round trips; and two agent-session bugs are closed.

## 2026-08-31 · Installed-app crashes leave a trace, and the chat's first suggestions say what they ask

**Changed**: Chat suggestion chips now state the observed fact and the request instead of a bare label; the analysis screen's Do-next tab is a single list of clear actions; about 64 on-screen labels were rewritten in plain language (for example, "Repair queue" became "Things to fix").
**Fixed**: Installed-app crashes are now logged for diagnosis and several crash-causing bugs were closed; broken frontmatter, missing files, failed config writes, and other errors now show a clear message instead of failing silently or showing the wrong one.

## 2026-08-31 · Rust dependency evidence stays exact, bounded, and review-only

**Added**: Ontology evidence now reads Rust source: `use` paths, file-backed `mod` declarations, and literal path or include forms are recognized as dependency evidence by `infer_imports`, `index_project`, and the CLI's `infer-imports`.
**Changed**: The public evidence coverage contract now lists Rust as supported bounded static evidence.

## 2026-08-30 · A known task can start at the exact reviewed source batch

**Added**: Agent handoffs can include compact v2 briefs pointing to one reviewed primary implementation symbol, a supporting symbol, up to three focused tests, and the relevant boundary, opt-in via MCP or CLI; bootstrap proposals can also cite bounded `navigation:primary|supporting|test:<path>#<symbol>` evidence.

## 2026-08-30 · Agent handoff starts with one project and one bounded task view

**Added**: Coding agents can opt into `detail:"compact"` with a request-local `task` (CLI: `--compact --task`) for a smaller response capped at 8,000 bytes.
**Changed**: `agent_brief(project: ...)` now reports only the selected project's containment tree instead of global vault-wide starter-project counts and hubs.
**Fixed**: The copyable handoff prompt is regenerated after checks complete, so it no longer shows a stale "ready" status alongside a different final result.

## 2026-08-30 · The download hero splits only when the column can hold the decision

**Fixed**: On the download page, the hero image and text now split into two columns only when there is enough room (from 1280px wide); below that width they stack vertically instead of the buttons overlapping.

## 2026-08-30 · Choosing a role no longer turns the chain

**Fixed**: Selecting a role in the architecture diagram's role chain no longer rotates the whole chain into a vertical column; it keeps its layout and scrolls the chosen role into view. A duplicated rule and count label on the same pair of roles no longer draws on top of itself.

## 2026-08-30 · What the review found: the count stays on the fade, sentences clear every arc, and the headline hydrates clean

**Fixed**: The "N more below" count on the architecture canvas no longer sits on top of the last item; relation-label sentences no longer overlap the lines they describe; the download page headline no longer flashes a mismatched style under reduced motion; and pressing the hero object clears its hover ring and caption instead of leaving them stuck to the pointer.

## 2026-08-30 · The architecture chain stays whole in the installed app, and the README shows it

**Changed**: The README's architecture screenshot is retaken from the installed app, showing exact boxes with summaries and receipts.
**Fixed**: In the installed app, the architecture role chain no longer overflows its canvas or shows a stray scrollbar, and the "N more below" count no longer shrinks the canvas it is counting against.

## 2026-08-30 · The installed app never paints a sample over a real vault

**Fixed**: The installed app no longer briefly shows sample data before your real vault loads when restoring a project; project-root resolution (for a vault nested under `atlas/`) now works the same way from the picker, the recent list, and a cold restart.
**Removed**: The installed app's first run and Docs source menu no longer offer the bundled Storefront sample; that stays a web-demo-only feature.

## 2026-08-30 · ACP next steps use names a person can read

**Changed**: Containment-repair recommendations now show each concept's readable display name and state the action directly, instead of raw identifiers like `elements/qualification-handoff-helper`; the editable agent prompt still keeps canonical slugs alongside.
**Fixed**: A corrupted Korean display name is repaired, and a broken localized name now falls back to the canonical title; the composer's model and mode grid no longer overlaps the Stop button in a narrow agent panel.

## 2026-08-30 · The download hero assembles as the headline is typed

**Added**: Pointing at a lit node in the hero graphic draws its connecting line and shows the relationship in a caption below the canvas (for example, "Ontology Atlas contains Topology map").
**Changed**: The download page's hero graphic now assembles in sync with the headline being typed, lighting up nodes of the vault graph as each character appears, instead of fading in on its own timer.
**Fixed**: Below the fold, the download page now animates only three elements on scroll instead of twelve separate moving parts.

## 2026-08-30 · The gateway demo now reaches the agent handoff

**Added**: The download pages now include a 44-second installed-app demo video, in Korean and English, showing a capability's relations and evidence, then an AI agent using Atlas MCP to explain how two concepts connect, plus a separate 23-second Korean clip touring Map, Architecture, Docs, Insights, Projects, Agents, and Git History.

## 2026-08-30 · Every stroke on the architecture canvas says its sentence

**Changed**: Every stroke on the architecture diagram now shows its own explanation beside it (for example, "Routes may depend on Application shell" or "Views reaches Widgets in 314 imports") instead of requiring a closed side panel; the canvas draws with precise boxes and clean curves, and hovering a role dims unrelated strokes instead of cutting them.

## 2026-08-30 · The reason on a relation is findable, and the agent reads what it wrote

**Added**: `find_path`'s edges and `get_concept`'s `outgoingEdges` now include the stored reason for a relation as an optional `rationale` field, the same one `query_ontology` already returned.
**Changed**: `relation_notes` is now documented in the MCP schema, the README, and the ontology spec, so it is discoverable as a real field.
**Fixed**: A `relation_notes` value with an unquoted comma no longer silently corrupts vault validation; it is now reported as `orphaned-relation-note`.

## 2026-08-30 · ACP next steps move on when the vault does

**Changed**: The repository's Run action now uses an updater-disabled local app build, so installed-app testing no longer requires a release updater private key.
**Fixed**: Re-reading the vault after a save no longer makes completed-turn recommendations disappear or briefly show as empty; a completed source connect or disconnect now correctly updates the recommendations shown, and switching folders fails closed instead of showing stale facts.

## 2026-08-30 · A role box finishes its sentence

**Fixed**: Each role's one-line summary in the architecture diagram no longer cuts off mid-sentence; it now wraps to two lines so the first clause reads in full, with the ellipsis placed after the clause instead of inside it. The role box grew slightly and row spacing tightened so the full chain still fits on a 1512x945 screen.

## 2026-08-30 · The architecture chain is drawn as a chain

**Fixed**: The architecture diagram now draws a connecting line between each role and the next, showing the full chain instead of disconnected boxes.

## 2026-08-30 · A role box says what the role is

**Changed**: Each role box now shows a short description of that role instead of module/concept counts, and hovering a role highlights it and every connection with its measured import count.

## 2026-08-30 · The architecture screen became a canvas with panels, and violations are drawn

**Added**: Violations found by the review are now drawn on the diagram itself as dashed lines, even when they skip a role, instead of only being counted in the verdict text.
**Changed**: On `/architecture`, the diagram now fills the screen, with roles, rules, and the receipt opening in a side panel when you click a role or "Roles and rules" (Escape closes it), instead of a squeezed, scrolling page.

## 2026-08-30 · Every role on the architecture canvas carries its own receipt

**Added**: Each role box on the architecture diagram now shows its own outgoing-edge summary, such as "no violations out - 411 imports" or "2/5 edges violated", when a review receipt exists.

## 2026-08-30 · First-ontology handoff keeps its evidence boundaries intact

**Changed**: Internal work strengthened the evidence and qualification checks used when constructing a first ontology from a new codebase, with no visible change to the product.

## 2026-08-29 · The map says the names it draws, and answers everything it paints

**Changed**: The architecture diagram now uses the full width of its panel instead of sitting flush left with empty space on the right.
**Fixed**: Domain names on the map no longer render garbled or duplicated at a distance, and every circle on the map can now be named, hovered, clicked, and dragged as soon as it's visible instead of briefly being unresponsive right after zooming.

## 2026-08-29 · The architecture screen is a drawing, and the drawing is measured

**Added**: The Architecture screen now draws each reviewed role as a sized shape holding its modules and concepts, connected by lines whose thickness reflects measured import traffic; clicking a role opens its concepts and scope rules in place.
**Changed**: Verify now measures the current source and commit each time instead of replaying a stored answer, and marks anything it could not establish as unknown rather than showing it as passing.

## 2026-08-29 · A release cannot start while the download page names an older build

**Fixed**: The download page could show an outdated version and checksums after a release; a release build now fails automatically if the published download facts don't match the newest release.

## 2026-08-29 · Completed agent turns lead into grounded next steps

**Added**: After the agent finishes answering in the in-app chat, up to three suggested next steps now appear below the answer; choosing one fills the message box for you to review and send yourself.
**Changed**: When recommending you link a capability to its implementation, the assistant now says it's "not yet linked to code" instead of incorrectly claiming no code exists for it.

## 2026-08-29 · Gateway identity completes the mascot rollout

**Added**: Added the pixel mascot in a static raised-hand pose beside the download page's hero graphic.
**Changed**: Replaced the last generic orbit logo across the home, download, guide, and changelog pages with the pixel mascot.

## 2026-08-29 · Pixel mascot replaces the compatibility identity

**Added**: The mascot now animates through walking, reading, and success poses while the agent is verifiably working, with a static equivalent when reduced motion is on.
**Changed**: Replaced the app's icon and brand mark everywhere (favicon, app icons, loading screen, macOS menu bar icon, and more) with a new pixel-art mascot in place of the previous nested-hex mark.
**Removed**: The permanent mascot and wordmark at the top of the navigation rail; the rail now starts directly with its destinations.

## 2026-08-29 · One reviewed construction ends without hidden repair

**Changed**: The `health` check no longer suggests adding a redundant direct domain relation for an element already connected to a domain through its capability.
**Fixed**: Bootstrapping an ontology from a new codebase now surfaces an exact, unaccepted gap notice when evidence only partially covers a project exclusion, instead of treating it as accepted automatically.

## 2026-08-28 · Bounded capability lists stay bounded through agent handoff

**Added**: README now states the concrete moment to use Atlas: before a change, to see where to start, what else is touched, what to verify, and what remains uncertain.
**Changed**: `analyze_repo_structure`, `agent_brief`, and the ontology-bootstrap skill now avoid overclaiming completeness: unlisted behavior goes under `Uncertainty` rather than `Excludes`, and `Definition`/`Includes` lists are treated as representative (no "only", "all", "every", or "exactly") unless a cited source proves they're exhaustive.

## 2026-08-28 · First ontology answers batch and reuse summary history

**Changed**: Internal performance work made repeated ontology reads (`health`, `workspace_brief`, `agent_brief`) substantially faster by reusing cached history, with the same results returned as before.

## 2026-08-28 · Architecture distinguishes value and type-only imports

**Added**: Architecture profiles can now declare `dependency_usages` to distinguish real (value) imports from type-only imports when checking dependency direction rules.
**Fixed**: Atlas's own architecture check no longer flags 18 `shared → entities` type-only imports as real layering violations; they were already allowed by the ESLint policy and now show only as observations.

## 2026-08-26 · The Architecture tab draws a shape, and its empty state does something

**Changed**: The Architecture tab now draws the role dependency diagram as a numbered ladder beside a policy matrix (rows are the consumer, columns the provider), and hovering a role highlights it and everything it may reach.
**Fixed**: The empty-state button now asks the agent to draft a profile from your folders and imports instead of just changing the screen, with copyable text when no agent can run; `atlas architecture` no longer fails at a repo root on a false duplicate-vault match; an architecture record is listed among documents again; and a release disk image now retries packaging when the disk reports busy.

## 2026-08-26 · Architecture becomes a reviewed, agent-executable contract

**Added**: Added a separate `/architecture` Living Blueprint (reviewed architecture patterns, scopes, roles, path mappings, and dependency rules) plus MCP `inspect_architecture` and CLI `architecture`, which compare your current imports against it and report unknown rather than guessing when coverage is incomplete.
**Changed**: Architecture is additive in the app's navigation rail: Git keeps its uncommitted-change badge, `G G` shortcut, and guided tour, and mobile keeps Architecture in the bottom navigation.
**Fixed**: Fixed two layout issues found during testing: a missing scroll area on wide screens, and the Plan stage's copy button being hidden behind the mobile tab bar.

## 2026-08-25 · Atlas narrows its identity to the codebase

**Changed**: Atlas now describes itself as a codebase ontology workbench, focused on what a codebase builds, why it's structured that way, and what a change affects, rather than a general-purpose ontology editor; "agent memory" remains a benefit, not the category.

## 2026-08-26 · The Architecture tab has something to show

**Changed**: The empty state no longer asks you to write the profile document by hand; its button now goes to the map where an agent is already connected. An architecture record no longer appears in the list of documents in the reading surface.
**Fixed**: The bundled sample vault now ships with its own architecture profile, so the Architecture tab shows something for every first-time visitor instead of being empty.

## 2026-08-26 · A change you are asked to approve reads as one tidy list

**Fixed**: The rows describing a proposed relation, its two ends, and the reason for it now share one aligned grid that fits its labels, instead of four separate grids that only lined up by accident and left blank space beside a short label; the first label no longer sits flush against the row above it.

## 2026-08-26 · The download page keeps up with the release on its own

**Changed**: The download page's version now reads from `package.json` instead of a hand-maintained copy, so bumping the version touches three files and the download page follows; releasing also regenerates and opens a pull request with the download facts automatically, with merging as the only manual step.
**Fixed**: A permission card no longer sits under a message saying the agent has gone quiet; it's now clear that the person, not the agent, is being waited on.

## 2026-08-25 · The chat says when the agent has stopped answering

**Fixed**: A turn that silently ended without the app noticing used to leave the chat panel stuck saying it was working and refusing input, with no hint that Stop would recover it; now the panel names how long the silence has lasted and points at Stop.

## 2026-08-25 · Verify waits long enough for a slower machine

**Changed**: The retry hint now suggests doubling the timeout that actually failed instead of naming a fixed number.
**Fixed**: Verify no longer times out on a slower machine; the default timeout is now 30 seconds and the release gate's is 90 seconds (up from as little as 8-15), since checking a large source tree can take longer than a quick server hang.

## 2026-08-25 · The map lives inside your project, and the door finds the people who need it

**Added**: The first-run card now leads with reading your existing codebase through the connected agent, showing the exact folder path (a new `atlas` folder in your project) before anything is written; permission requests now say where the write lands, in three colors, separating the durable "allow for this conversation" choice from one-off answers.
**Changed**: The map-from-code door now appears for anyone who hasn't built a map yet, not only first-time folder openers, and an agent-started session now gets your project root, not just the vault path, so it can see your code.
**Fixed**: The empty map no longer offers a "Browse concepts" link that only leads back to itself; three dead ends in the map-from-code flow are closed, and `init` no longer rewires a project it wasn't run inside.

## 2026-08-25 · The `atlas` command works from anywhere, and one thing has one name

**Added**: `atlas install-shim` puts `atlas` on your PATH by writing one launcher into `~/.local/bin` (no registry, no sudo), printing its exact contents first; `atlas remove-relation` takes a relation back off a node, also removing its recorded rationale.
**Changed**: Typing bare `atlas` now reads your situation (no ontology, empty one, full one) and shows only the steps that make sense, instead of printing all 56 commands; the full list stays one flag away. The ontology folder is now referred to by one consistent name everywhere instead of four different names.
**Fixed**: The CLI now prints only English; 140 lines of Korean text in command output, including some that switched languages mid-sentence, have been translated.

## 2026-08-25 · The released app carries its third-party notices

**Added**: The macOS app and Windows installer now include `NOTICE.md` and `LICENSE` files inside the bundle, covering JavaScriptCore, WebKit, and the Pretendard font.
**Changed**: The bundled notice is generated from the actual dependency tree, and a release is blocked if the notice goes stale.

## 2026-08-25 · A domain says when its description has fallen behind what it holds

**Added**: `validate_vault` now reports `summaryFreshness`, and `query_ontology({operation:'maintenance_plan'})` raises a `rejudge_summary_membership` action when a domain's or project's member list changed after its description was last written.
**Changed**: Both checks are advisory only, they block nothing and propose no rewrite; outside a Git repository they report `checked: false` instead of a clean result.

## 2026-08-24 · Codex in-app chat pauses until Atlas MCP writes have an app-owned review gate

**Changed**: Codex is still detected and its external MCP connection setup is unchanged, and Claude Agent remains available for in-app chat. Setup text now says clearly that the coding agent itself may still talk to its own provider, even though the Atlas MCP process uses no network.
**Removed**: Codex in-app chat is no longer offered, because it could execute an Atlas MCP write without the review card meant to gate it.

## 2026-08-23 · Selecting a node in the 3D dome lights its line to the top

**Changed**: In the 3D dome view, selecting a node now lights the whole chain it belongs to, from element to capability to domain to the project at the apex, in the same indigo used for selection, and the dome turns to face it. Clicking empty space clears the selection. The flat map is unchanged.

## 2026-08-23 · The download page moves where the product is working

**Added**: The download page's evidence section now plays a short linked demo: three beats highlight a line of the file on the right while the map on the left focuses the matching node, domain, or dependency, then release. Touching the map stops the demo immediately, and readers with motion turned off see only the resting section.
**Changed**: The agent scene's tool call now appears as typed text, like a terminal, instead of fading in. The concept and relation counts under the map, and the file count in the evidence panel, count up briefly when they first come into view.

## 2026-08-23 · The gateway map labels only what the overview needs

**Changed**: The download page's evidence map no longer labels every node that fits. It now labels only the hub, the seven domains, and the busiest capabilities, twelve labels instead of thirty three, and every other concept stays a dot until you hover or press it. All 82 dots are still drawn.

## 2026-08-23 · The demo clip loops without a control bar, and two sections read more plainly

**Changed**: The demo clip now loops with no timecode or progress bar, still pausing off screen, with the play button kept for motion-off readers. The evidence panel shows only meaningful file lines and states how many were left out. The agents section now says plainly: the app starts the agent you already have, no new key, no sign-in, approval before any file moves.

## 2026-08-23 · Every concept in the dogfood vault now has a Korean name

**Added**: All 83 nodes in the dogfood vault now carry a Korean display name, up from 21.
**Changed**: On a Korean screen, the map, the INDEX panel, node details, and the download page's evidence section no longer mix English names into Korean text. English screens are unchanged.

## 2026-08-23 · The evidence section shows one real file instead of counts

**Changed**: The download page's evidence section now shows one real file from this repository, plus what an agent reads out of it, in place of kind counts and a sampled relation list. A link opens that file on GitHub, and a check fails if the shown content and the vault disagree. The section heading now says what actually happens instead of claiming the map is this repository.
**Removed**: The caption under the agents section about agent writes ending up as a line in a file.

## 2026-08-23 · The demo section is now centered, and its caption matches the actual video

**Changed**: The demo section's title, caption, video, and label are now aligned on one center axis, instead of only the video being centered while the title sat left, leaving the right side empty.
**Fixed**: The caption now describes what the current nine-second clip actually shows, since it previously described a folder-picking scene that no longer appears, and insider phrasing like "unedited, silent" and "one take" was replaced with plain language.

## 2026-08-23 · The gateway title now types out letter by letter, and the demo stage matches its own heading again

**Added**: The download page's title now types out letter by letter with a blinking cursor, finishing in 1.14 seconds in Korean and 1.80 seconds in English, so neither language waits longer; readers with motion turned off see the full sentence immediately.
**Fixed**: The typing effect reserves each letter's space in advance, so content below never shifts while it types. The demo video was misaligned with its own section heading by 369px because it alone was center aligned; it now lines up with the other two sections without changing size.

## 2026-08-22 · The demo video now has a separate English recording

**Added**: The English page's demo video is now a separate English-language screen recording, with on-screen text and node names in English; the Korean page keeps its Korean recording.
**Fixed**: A check now catches the two video files accidentally becoming the same file again, since that happened for the first two days while every existing check stayed green because both files existed at their declared length.
**Removed**: The caption claiming both languages share the same recording, since that is no longer true.

## 2026-08-22 · The gateway demo video is now one nine-second scene, and it plays again on the Korean page

**Changed**: The gateway's demo video shrank from a three-minute feature tour to one nine-second scene: the map is already drawn from a connected folder, and pressing one node narrows to its neighbors while its ancestry and evidence document appear. There are no cuts or speed changes, so it takes exactly as long as the real app takes, and the asset shrank from 12.3MB to 1.5MB.
**Fixed**: The demo video was not playing at all on the Korean page since 2026-08-20; the video element is recreated per language, but the code watching for it entering view kept watching the discarded element, so English auto-played while Korean stayed frozen on its poster.

## 2026-08-22 · The map shows what the agent just found, and a large map can be expanded all at once

**Added**: When the map agent looks up a concept, the map now selects that node, and finding a path highlights just the resulting route. An "Expand all" button opens every collapsed group, and a large map now shows a loading spinner with status instead of stalling.
**Changed**: Node detail actions are now one primary action plus "Edit" and "More" menus, and the agent chat panel is a compact inset panel instead of a full height wall.
**Fixed**: The chat panel no longer flashes empty on open, a long status label no longer gets cut off, and starting a chat now waits for the tool to be ready. Setup failures no longer show a duplicate error toast.

## 2026-08-22 · You can see every change in an agent's batch request, and find the decision again later

**Added**: A batch request now shows every item as an accordion row instead of just a count, and selecting a relation previews its direction and reason on the map; the card states that approving or rejecting applies to the whole batch. Every ontology write is now logged locally as a reopenable receipt, without storing conversation text or tool output.
**Changed**: A starter vault with no connected code folder no longer lets an agent treat the vault itself as source; it is directed to connect a project folder first. Tables in agent replies now get header shading and scroll horizontally instead of widening the chat dock.

## 2026-08-22 · The map now shows plainly what an agent is doing right now

**Added**: The status line for an agent on the map now names known tools plainly, such as Codex, Claude, or Cursor, and labels its target "current target:" or "last changed:"; clicking it selects the node. It also opens a card with the request, step, target, and last tool used.
**Changed**: The status now only says "planning," "editing," "verifying," or "waiting for approval" while confirmed live. Thinking and tool calls now collapse into one line per question, with the answer shown separately.
**Removed**: The non-functional "human-authored" INDEX tab and its mistaken review-pending red ring; the reserved "Atlas' own vault" reader guide no longer appears on the map or in INDEX.

## 2026-08-21 · Relation editing moves into the map, and every write shows a preview first

**Added**: Editing a relation now opens in place in the map's info card, showing the new direction as a dashed arrow before you commit; a "preview" step shows what will change before you approve. Adding a concept also requires confirming its details before writing the file.
**Changed**: Changing or removing an existing relation goes through the same preview, and every in-app agent write now pauses to show a typed preview and waits for one-time approval; meaning writes are never "always allow."
**Removed**: The left rail's "Studio" entry and shortcut; old `/ontology/studio` and `/ontology/edit` links redirect into the same in-map editing state. The radial Compass screen was removed with it.

## 2026-08-21 · The skill inspection screen has been removed

**Changed**: The "Agents" screen keeps doing its own job of install, connect, check, and chat. The docs-library check comparing the real `.claude/skills` and `.agents/skills` copies, `skills:audit`, and the CLI `agent-files` command are unchanged.
**Removed**: The left rail's "Skills" screen, its `G K` shortcut, the `/skills` route, its dedicated inspector for when agent skills run, and its procedure-bundle copy feature. This was retired deliberately, not moved, since it required a separate folder from the current map and never connected to editing the current vault.

## 2026-08-20 · The app can install Node for you too, and it checks the hash

**Added**: The app can now download and install Node itself when missing, showing the download address and hash before you click, then verifying the hash after download and stopping if it does not match. It installs to an app-only location, never touching a system Node, and an existing install always wins; the version installed is pinned.

## 2026-08-20 · If a tool is missing, the app can install it for you

**Added**: An "Install in this app" button now appears where only an installation-instructions link used to be. It installs only when clicked, shows the exact command above the button first, and installs to an app-only location without touching global npm or the system PATH; an existing install always wins, and the version is pinned. Afterward it re-measures and shows the result.

## 2026-08-20 · Fixed external links inside the app not opening

**Changed**: The tool list no longer stays collapsed when nothing is installed, its label now reads "38 available tools" instead of "38 more," the app no longer suggests fixing app-side settings when no tool is installed, the missing-key screen now mentions that Claude Code and Codex work without one, and button spacing was widened.
**Fixed**: The "install instructions" link and nine other outbound links inside the app did nothing when clicked, since the app never opened a new window itself; all ten now open correctly.

## 2026-08-20 · The connection check now covers the gate too, and reconnect has been added

**Added**: The connection check now also verifies whether a tool asks permission before touching anything outside the chosen folder, noting when a tool enforces that itself and when Atlas cannot. A "Reconnect" action removes only what the app created and rebuilds it from scratch; it is not called "log out" because the app has no login of its own and reuses your terminal login as-is.
**Changed**: When the app cannot fix a problem itself, it now says exactly what to do: install instructions if a tool is missing, a Node install if Node is missing, or a one-time terminal login if you are not signed in.

## 2026-08-20 · A Check Connection button has been added

**Added**: A "Check connection" button now appears in Settings under Agents, and on the problem card shown when a chat fails. It checks seven things per tool: installed, launchable, download intact, app-side setup ready, terminal login reused, no stale login blocking it, and signed in for this folder; all-clear collapses to one line, expandable into the full list.
**Changed**: A step gets a "Fix" button only when the app can fix it itself, since it never installs another tool's software for you; an unverifiable step says "could not check" rather than a false pass, and after fixing something the screen shows freshly re-measured results instead of just claiming success. No step counts are shown, since different tools check a different number of steps.

## 2026-08-20 · Removed the repeated sign-in prompt when using an agent in the app

**Changed**: The screen now explains what was blocking the connection, and states that pressing "New chat" clears it.
**Fixed**: Opening in-app chat no longer prompts you to sign in again by pasting a terminal command, and no longer keeps reappearing afterward. The app checks itself whether a stale app-scoped login exists and clears it automatically, falling back to the same login your terminal already uses.

## 2026-08-20 · The homepage demo video was re-recorded with the current app

**Changed**: The homepage demo video was re-recorded with the current app, replacing a clip that no longer matched it and showed the recording person's own folder name during folder selection. The new 3 minute 19 second video walks through the 2D map, auto-layout, 3D dome assembly, the 3D cloud, and an agent answering a question about the vault with real data. Only idle stretches are sped up; every real action plays at real speed.
**Fixed**: The Korean page was silently playing the English recording behind a Korean poster; both locales now point to the same recording. A release check now blocks if the declared video length and the actual file length disagree.

## 2026-08-19 · Talk in App agent no longer gets stuck on first launch

**Changed**: In Settings, "Talk in App" is now labeled Agents, and "Connect from terminal" is now labeled MCP Connection.
**Fixed**: Talk in App no longer fails with a bare "Could not read package.json" error when a first-time download was interrupted; the app now detects a corrupted cached download, clears only that item, retries automatically, shows progress during the download, and explains what to do if a broken download is ever left behind.

## 2026-08-19 · 3D rotation renders faster without changing what you see

**Changed**: Rotating the 3D dome view now costs less per frame by fading out low-visibility decoration (halos, shading, gloss, outlines, domain tick marks) on the hidden back hemisphere; nodes and relationship lines are never removed, and the visible front half is pixel-for-pixel identical.

## 2026-08-19 · Gateway pages use more of the screen on wide monitors

**Changed**: On the gateway pages, the content column now widens up to 1920px (from 1600px) on displays 2560px and wider, reducing side margins; layouts at 1920px and below are unchanged, and reading columns such as the hero description, docs prose, and captions keep their own narrower widths.

## 2026-08-19 · Switching tabs away from the 3D map is faster

**Fixed**: Leaving the 3D map to switch to another rail tab is now noticeably faster, since the map stops redrawing once you navigate away, and canceling a switch resumes it instantly; the Insights screen also opens faster, with unchanged results.

## 2026-08-19 · The demo stage on the gateway grows on very wide screens

**Fixed**: On monitors 2,240px and wider, the gateway demo stage was fixed at 768px wide and looked small; it now scales with screen width (896px at 2,240px, 1,024px at 2,560px, 1,280px at 3,440px), while layouts at 1,920px and below are unchanged.

## 2026-08-19 · Gateway pages idle down, and every screen loads less data

**Changed**: Screens now download only the docs vault data they need instead of the whole vault, shrinking initial downloads for `/` and `/docs`, and 3D rendering is cheaper per frame for smoother rotation and panning; nothing you see changes.
**Fixed**: The gateway pages (`/` and `/download`) no longer keep the CPU busy when left idle; animations now pause after 30 seconds of no input, matching the map, and resume instantly on any input.

## 2026-08-19 · The map stops working in the background when left open

**Fixed**: Leaving the 3D map open no longer keeps your laptop working continuously: 3D rotation now pauses when idle like the 2D map, a stuck node highlight no longer keeps the map redrawing forever after you move the cursor off canvas, and dragging a node in 3D is noticeably smoother.

## 2026-08-19 · New demo video: an 89-second single take covering both 3D layouts and a Codex round trip

**Added**: The download page's demo video is a new 89-second single-take recording filmed on the installed app using this repository's own vault: picking a folder, the map appearing, focusing a node in 2D, the 3D dome and cloud layouts assembling and rotating, and asking Codex a question as a connected agent.
**Changed**: The video is now 89 seconds, up from 24; the on-screen UI is still Korean, which the caption beneath it states.
**Removed**: The older demo assets `one-folder`, `one-folder-new`, and `one-button`.

## 2026-08-19 · Domain names in the 3D map no longer overlap

**Fixed**: Selecting a domain in the 3D dome view used to draw its name twice in an overlapping, garbled way; the two label styles (the readable name and the distant decorative label) now hand off cleanly instead of overlapping.

## 2026-08-19 · The download page is shorter, with the redundant Install section removed

**Changed**: The four downloads (Apple Silicon Mac, Intel Mac, Windows, or open in browser) remain in the top button row; a line beneath them reads "Apple signed and notarized. Sends nothing to a server," and the demo video is now smaller, fixed at 766×465 instead of scaling up on wide screens.
**Removed**: The bottom Install section, including the step-by-step walkthrough, per-file SHA-256 checksums, the `shasum` command, signing/notarization proof lines, and the GitHub repository link.

## 2026-08-18 · 3D rotation is smoother

**Fixed**: Occasional stutter while rotating the 3D view is reduced, and the visible pause when switching to the cloud layout now falls under 100 milliseconds, the threshold at which a delay stops feeling instant.

## 2026-08-18 · The 3D map now offers two layouts: Dome and Cloud

**Added**: The 3D chip atop the map now opens a layout picker with three options: Flat (the ordinary 2D map), Dome (the existing 3D layout, unchanged), and Cloud (a new layout where relationships alone determine position, revealing what's attached to what).
**Changed**: Both layouts share the same camera, controls, and depth rendering, and reloading the page always produces the same layout.

## 2026-08-18 · Camera movement no longer whips past nearby items

**Changed**: When the map moves the camera on its own, it now keeps a constant rate of motion across the move instead of rushing past nearby items, pulling back before zooming in on long moves; zoom also interpolates so the midpoint between 1x and 4x feels like 2x, and the 3D view settles at a natural angle near a nearby domain after you release a drag.
**Fixed**: Two cases where rotation could visibly freeze mid-motion are resolved.

## 2026-08-18 · The 3D map can now be panned by hand, and camera motion has more weight

**Added**: Dragging the black area outside the dome now pans the 3D map instead of only rotating it, with the cursor changing to show which zone you're in; turning on 3D now plays a stand-up animation you can take over at any point, skipped when reduced motion is enabled.
**Changed**: When the camera flies to a clicked node, the latitude rings now lag slightly and catch up, producing a brief settle wobble on arrival.

## 2026-08-18 · App accent color is back to indigo, with copper still available in Settings

**Changed**: The default accent color is indigo (`#5e6ad2`) again, after a same-day switch to copper was reverted; copper remains selectable under Settings > Appearance > Accent Color, and your choice persists across launches.
**Fixed**: The app icon, favicon, and social preview image are rebuilt in indigo, and several map elements left in copper for indigo users (toolbar chip, utility rail, selection and hover rings) now follow the accent setting correctly.

## 2026-08-18 · The 3D map looks like a real dome: curved relationship lines, latitude rings, depth occlusion

**Added**: Latitude rings are now drawn for the domain, capability, and element layers with only front-facing arcs visible, and nodes render as shaded spheres lit from above, giving rotation a visible sense of which way is front.
**Changed**: Relationship lines now curve along the dome's surface like meridians instead of cutting through its interior, and perspective is stronger, so nodes visibly grow as they rotate toward the viewer.
**Fixed**: Nearer lines and points now properly hide farther ones instead of just fading with fog, and the orbit button's tooltip no longer slides unreadably across the scene in the 3D view.

## 2026-08-18 · The homepage hero now offers every download destination, with platform detection

**Added**: A second row of outline buttons is now always visible below the primary download button, offering Intel Mac, Windows (marked unsigned), and "Open directly in browser"; every platform's download is now reachable from the hero.
**Changed**: The primary button now detects your platform, showing a Windows x64 beta (.exe) download with the unsigned/SmartScreen warning first for Windows visitors and defaulting to macOS otherwise; "Watch demo first" is now a full outline button.

## 2026-08-18 · The homepage and download page got a five-section remake

**Changed**: `/` and `/download` are now a five-section landing page: a hero with an animated 3D graphic built from this project's own vault, an autoplaying demo video, a live map that assembles on scroll, a section replaying a real in-app agent conversation, and a static install/download section.
**Removed**: The map no longer appears on the very first screen.

## 2026-08-18 · The Skills screen is now a graph, and more procedures are readable

**Added**: Each skill's detail view now shows both directions of connection, "hands off to" and "called by," with clicking a listed skill jumping straight to it; the summary view adds a section counting these separately so unused entry points and tool-only skills are visible.
**Fixed**: Step-by-step procedures are now recognized for many more skills (15 of 18, up from 9); step cards no longer leak raw Markdown or backticks, and a script-running skill shows that fact next to its name with a link to the file.

## 2026-08-17 · New vaults now include three procedure skills for coding agents

**Added**: A vault created with `init`, or by the app or web on first run, now includes three skills: `atlas-review` checks the vault and reports only what needs attention, `atlas-grow` suggests up to five next steps and writes only what you approve, and `atlas-absorb` checks for duplicates before extracting concepts from prose.

## 2026-08-17 · Release signing now migrates to API-key credentials safely

**Changed**: The desktop release process now proves it can sign, notarize, and publish using only the new API-based Apple credentials before the older Apple ID, app-password, and Team ID credentials are removed.

## 2026-08-17 · `find_evidence` no longer requires graph identity from plain documents

**Fixed**: Every result from the `find_evidence` MCP tool now includes `isNode`, marking whether it is a graph node or a plain Markdown document; only graph nodes require a permanent `uid` and `kind`, so plain documents no longer need to fake them.

## 2026-08-17 · Release credential scope finalized around what can actually be recovered

**Changed**: Release signing now keeps the three App Store Connect API credentials in the main-only `release-signing` environment, while the Developer ID certificates and Tauri updater identities remain as repository secrets that cannot be read back out; older Apple ID, app-password, and Team ID credentials are removed only after the first API-key release succeeds.

## 2026-08-17 · Notarization credentials no longer pass through process arguments

**Changed**: Hosted notarization now uses an App Store Connect API key instead of an Apple ID app password, with the key existing only briefly as a locked-down temporary file; the release process no longer hands its signing secrets to build, smoke-test, or packaging steps that don't need them.

## 2026-08-17 · Desktop release process now documented for main-branch dispatch

**Changed**: The desktop release procedure is now documented for the current workflow: pushing a tag first, then dispatching the release from `main`, along with the credential scopes and approval boundaries involved.

## 2026-08-17 · Release status no longer reports ready when download verification is skipped

**Fixed**: Setting `OATLAS_RELEASE_STATUS_SKIP_DOWNLOAD_VERIFY=1` to skip DMG and checksum verification now marks `download_assets` as a blocker instead of silently passing; release status no longer returns `ready: true` with exit code 0 unless verification actually succeeded.

## 2026-08-17 · Release metadata generation rejects malformed GitHub release data

**Fixed**: The release metadata generator now fails instead of accepting a macOS asset name whose version does not exactly match the requested tag, closing a path where quotes or code fragments in an asset name could reach generated code in `macos-release.generated.ts`.

## 2026-08-17 · Vault log and receipt writes no longer follow hardlinks outside the vault

**Fixed**: If a `.ontology-atlas` log or receipt file is a hardlink with another name outside the vault, Atlas now refuses to read, replace, append to, or delete it, closing a path where an activity log write could change a file outside the vault that shared the same inode.

## 2026-08-17 · Vault file writes on macOS and Linux resist a parent-folder swap

**Fixed**: Writing an ordinary vault file or creating a directory on macOS and Linux no longer reopens the path by name after checking it; each parent folder is held open from the vault root down, so a symlink swapped in right after the check, such as replacing `.ontology-atlas`, cannot redirect the write outside the vault. Proven on Unix only; Windows keeps its existing checks.

## 2026-08-17 · Agent config writes no longer modify files outside the vault

**Fixed**: Writing an allowed file such as `.mcp.json` no longer empties the original file's contents when that file is a hardlink pointing outside the vault; Atlas now writes a private temporary file in the same folder and renames it into place, leaving the external target's bytes untouched. Proven on Unix only, not yet on Windows.

## 2026-08-17 · Codex sessions no longer get a duplicate Ontology Atlas MCP server

**Changed**: When Codex already reads the same Ontology Atlas MCP server from the vault's `.codex/config.toml`, the app no longer launches a second `atlas-vault` copy of it, so the same tools no longer appear twice under different names. It still injects its own server when the existing config is stale or points to a different vault.

## 2026-08-17 · Closing a coding agent session cleans up processes that outlive its leader

**Fixed**: When the app closes a coding agent session, it no longer treats cleanup as complete just because the adapter's leader process exited. If a CLI, MCP server, or subagent in the same process group ignores termination, the app now gives it one second to exit before force-killing the entire group.

## 2026-08-17 · Coding agent permission checks can't be redirected to a different vault mid-session

**Fixed**: The in-app coding agent's file permission checks now bind to the folder that was checked and normalized when the session started, identified only by session ID, instead of trusting the vault path sent with each request. An empty path, relative path, filesystem root, or a folder swapped in after the session starts is never auto-allowed; Atlas still asks when it cannot decide.

## 2026-08-17 · Project descriptions can no longer break out of embedded JSON-LD data

**Fixed**: A project name or description containing `</script>` could previously close the page's embedded JSON-LD tag early. The root, download, and project detail pages now share one `JsonLd` component that prevents this, and the structured data search engines read from these pages is unaffected.

## 2026-08-17 · Unverified coding agent modes are labeled instead of hidden

**Changed**: When a coding agent adapter offers a mode of operation Atlas has not yet verified, the mode list now marks it "not verified" next to its name and explains what that means, instead of silently listing it as if it were safe. A mode that removes permission checks entirely stays hidden from the list.

## 2026-08-17 · The LLM audit log resists being redirected outside the vault

**Changed**: Two overlapping LLM requests in the same vault no longer race for the same log position; the second now fails before sending instead of freezing. Proven on Unix and macOS only; the Windows beta is unchanged.
**Fixed**: If the `.ontology-atlas` folder or `llm-audit.jsonl` is replaced with a symlink or hardlink pointing outside the vault, Atlas no longer opens or writes to that target, and will not send a request to the network if the audit line cannot be safely recorded.

## 2026-08-16 · Settings can find your coding agents, and app sessions follow the app's rules

**Added**: Settings gained a Runners section that detects coding agents on your computer, showing which are ready to use and what each is missing (Node, uv, or a manual install), using an offline snapshot so it works without internet; there is no in-app chat panel for these agents yet.
**Changed**: A coding agent session launched inside the app uses its own managed configuration instead of your global one, so it always asks before touching files outside the vault, even if your terminal skips prompts; global skills, MCP servers, and model preferences do not carry over; The app now rejects unsafe vault or session folders such as the filesystem root, your home directory, or OS and app directories, and closing the app also stops any processes an agent session started.

## 2026-08-16 · Analyzing large Go repositories preserves purpose and package boundaries

**Changed**: Repository analysis and `infer_imports` now handle large Go codebases without running the Go toolchain, keeping a README's purpose and capability sections intact instead of truncating them, and reporting each package's real import boundaries as `goPackageImports:v1` evidence instead of inventing files.

## 2026-08-16 · Meaning review works for large projects without an oversized handoff

**Changed**: Reviewing a large project's meaning now pages through evidence using `query_ontology`'s `meaning_repair_review` operation instead of returning everything in one oversized handoff.
**Fixed**: `connect-source --root <path>` and `--root=<path>` in the CLI no longer parse their value backwards.

## 2026-08-16 · High-confidence purpose and domain claims require two independent sources

**Changed**: `analyze_repo_structure` now requires two independent, corroborating documents before reporting high confidence for a project's purpose or a domain's responsibility; a single source stays an honest low-confidence result instead of being reported as complete.

## 2026-08-16 · C repository analysis is clearer about what it does not support

**Changed**: Analyzing an Autotools-based C project now reports each file's real build role, such as public interface, shared implementation, or platform backend, instead of calling everything an "entry point", and clearly flags when `infer_imports` could not scan a C project rather than reporting zero dependencies as if none existed.

## 2026-08-15 · A failed independent review still blocks ontology writes

**Fixed**: If the independent source-hidden review comes back failed or unknown, Atlas no longer issues a write plan even when a person accepts the remaining gap; the construction process stays blocked.

## 2026-08-13 · Creating a first ontology now requires structural validity and explicit approval

**Changed**: `bootstrap`, `index --apply`, and `init --quick-start` no longer write concepts or relations on their own; they return `approval_required` and `writes: 0` until a person approves a matching `constructionQualification:v1` write plan.
**Fixed**: Malformed frontmatter and list items with no parent are now reported as structural errors, and the agent brief no longer shows a project as healthy or ready when its meaning evaluation is invalid or still needs review.

## 2026-08-13 · Listing concepts in a large vault no longer hides items past the first page

**Added**: `list_concepts` now returns deterministic ordering and pagination metadata (`offset`, `limit`, `total`, `returned`, `hasMore`, `nextOffset`), so a vault with more than 100 concepts can be read in full by following `nextOffset`.

## 2026-08-13 · You can switch view modes again on mobile

**Fixed**: On small screens where the expanded index takes over the display, the settings menu can be reopened to switch back between the general and expert view.

## 2026-08-13 · Import evidence for large codebases no longer overwhelms the response

**Changed**: `infer_imports` now returns a small paged summary with a cursor for large repositories instead of a multi-megabyte payload, plus a `focusPath` and `reviewMode:"focus"` option that reports one implementation path's import evidence; requesting the full result still requires an explicit `allowLargeResponse:true` confirmation.

## 2026-08-12 · Review results and skill steps are easier to read and safe to copy

**Added**: A project's "Open review result" now shows its purpose, current and next decision, first blocker, and approval status by default, with a "View evidence and diagnostics" section for the full quality-axis and citation detail; a malformed or mismatched result is shown as blocked rather than as if valid; `/skills` shows a skill's numbered steps as an ordered list in their original text and order, marking unsupported or truncated sources unavailable rather than guessing; below 1024px it becomes a list-to-detail view that restores your place. A "Copy packet" action copies the verified step data to your clipboard, blocked if the source looks tampered or unavailable.

## 2026-08-10 · Repository analysis picks up existing architecture docs and import evidence

**Changed**: Analyzing a repository now finds a root `ARCHITECTURE.md` and introduction or overview documents under `docs/`, `site/`, or `website/` as semantic evidence, and verifies TypeScript, JavaScript, and Python import endpoints in the same call instead of relying on a previous call's state.

## 2026-08-10 · Flagged project claims require real supporting documentation

**Fixed**: When a README contained language suggesting a claim needed review, the proposal check previously accepted an ordinary source directory cited alongside it as if it were independent supporting evidence. A flagged claim about a project, domain, capability, or relation now requires genuine corroborating documentation before it can proceed to review.

## 2026-08-09 · Ontology writes require reviewing the exact plan a person approved

**Fixed**: `analyze_repo_structure` no longer returns a write plan on the first proposal call; it now returns only a review plan, its digest, and the required gaps, with writing disabled until a person approves that exact plan and a separate evaluation completes. Approving a plan records the person's provenance, not a guarantee that Atlas verified truth or identity.

## 2026-08-09 · An ontology does not pass when structure is green but meaning is red

**Changed**: Strengthened the internal qualification process for building an ontology vault, requiring evidence-backed answers across seven separate quality checks before a build counts as trustworthy; this does not change the vault schema, kind list, public MCP tools, or UI.

## 2026-08-09 · The Workbench stops recommending unsupported parent concepts

**Fixed**: The Workbench's compass no longer suggests a parent-concept (`is_a`) relation just because a node shares a domain or a similar name; a suggestion now appears only when it comes with stated reasoning and a matching safe-to-add check, and empty compass sockets are now neutral with an accessible name stating no recommendation is available.

## 2026-08-09 · People and agents build ontologies within the same 5-kind and relation boundaries

**Changed**: Unified the description of Atlas's 5 authorable kinds and their relations across the public vault spec, starter vault, MCP server, and in-app agent guidance, clarifying that `broader` is the stored relation the UI shows as `is_a`, and stating clearly that Atlas performs no automatic inverse or transitive inference and makes no RDF, OWL, SKOS, or SHACL conformance claims.

## 2026-08-09 · The MCP's first-contact guidance always matches the real tool list

**Fixed**: The MCP server's initial guidance now always matches the tool count and names actually returned by `tools/list`, including in read-only mode, which previously kept listing write tools that could not be used there.

## 2026-08-09 · quick-start no longer calls a failure a success

**Fixed**: `init --quick-start` no longer shows a green "quick start done" message when bootstrap or MCP setup actually failed; a failed run now ends with a yellow "quick start incomplete" notice, marks the vault and agent config as unverified, and shows the commands to diagnose and retry. A packaging bug that could break even successful quick-starts was also fixed.

## 2026-08-09 · `ready` now means an agent configuration that actually runs

**Fixed**: Settings now correctly reports whether an agent's MCP connection is really runnable: an uninstallable `npx` configuration no longer shows as ready, and a working source-checkout configuration no longer shows as failed.

## 2026-08-09 · Approved competency evidence now carries through to finalize and the next agent

**Fixed**: Evidence a person already approved for a project's competency answers, such as citing `README.md`, no longer gets lost before finalization; `finalize_project_meaning` now recognizes that same evidence instead of rejecting previously accepted answers.

## 2026-08-07 · Second full design-system audit: gateway bottom clipped by 17px, hand-written shadows removed, five gate gaps closed

**Changed**: Removed the tinted drop shadow from primary buttons and static project-selection cards, and moved the edit screen's sticky toolbar to the topmost visual elevation since it is the only truly floating surface on screen.
**Fixed**: The gateway page's bottom tech-stack line was clipped by 17px behind the bottom tab bar on narrow screens; it now shows in full with a 40px margin.

## 2026-08-04 · Design audit: 28 colors the gates missed, the Workbench's parallel shadow ladder, an OS focus ring on the first-run modal

**Fixed**: The first-run modal showed a browser-default sky-blue focus ring instead of the app's indigo, and eight floating surfaces in the Workbench, such as popovers, edit cards, and search results, did not share the same elevation as the rest of the app; both are corrected, and 28 hardcoded colors were replaced with design tokens with no visible change.

## 2026-08-04 · Connecting a code folder goes from two steps to one: "Is this the folder?"

**Added**: When connecting a code folder, the app can now detect the git repository that already wraps your vault and offer a single "Connect this folder" action, showing how many declared paths it verified there; "Choose a different folder" stays available whenever the guess is wrong or confidence is low.

## 2026-08-04 · "Connect a code folder" now gives you a way to connect one

**Added**: The map's "No code folder connected to this project" message is now a persistent line in the INDEX and is followed immediately by a remedy explaining why a code folder helps and how to connect one; the web version explains why it can't connect directly, links to `/download`, and states what you can still do here.

## 2026-08-04 · Having said "connect a code folder," Atlas now gives you a way to do it

**Added**: New MCP tools `connect_project_source` and `disconnect_project_source`, and matching CLI commands `connect-source` and `disconnect-source`, let you connect, replace, or disconnect a project's code folder without typing a path; the tool proposes a candidate folder and its confidence, and writes nothing until you confirm.

## 2026-08-04 · Screens stop misreporting validation results

**Fixed**: The to-do list's agent-readiness score now reflects validation errors instead of showing 100% ready while errors exist, document diagnostics now show errors alongside warnings, documents missing a `kind` explain why they're off the map, the "on the map" chip and its "Open in map" link now only appear for nodes truly on the map, and the CLI `validate` summary now counts issues correctly.

## 2026-08-04 · Accessibility gates stop measuring blank screens

**Fixed**: Fixed a shared tab bar whose `aria-controls` pointed to a panel that did not exist for the selected tab, and fixed insufficient text contrast in the Workbench's empty-state helper text; both surfaced once the accessibility audit was extended to previously unaudited screens, including project detail and the edit screen.

## 2026-08-04 · Stops asking you to re-measure a source that's already current

**Changed**: When a project's code folder connection is already up to date but its competency answers were last evaluated against an older version, the agent handoff now guides you straight to reviewing those answers instead of asking you to re-measure the connection that's already current.

## 2026-08-04 · Distinguishes Rust conditional-build evidence from gaps in the dependency graph

**Added**: `analyze_repo_structure` and `index_project` now report a Rust project's `[features]` declarations and `#[cfg(feature = "...")]` conditions as typed evidence, with exact file and line locations.
**Changed**: `infer_imports` now states that Rust import graphs are not yet supported instead of implying a project has no Rust dependencies when none are found.

## 2026-08-04 · Test imports are no longer disguised as product-dependency approval questions

**Added**: `infer_imports` now labels each import's evidence as production, test, or unknown code, and as a value or type-only usage; when a module has no production-code value-usage evidence, Atlas no longer asks you to approve a `depends_on` relation from test or type-only imports alone.

## 2026-08-04 · Review import candidates for meaning one at a time

**Added**: `infer_imports` now supports a one-at-a-time review mode (`reviewMode: "next"`) that returns a single import relation to evaluate instead of the whole import graph.
**Changed**: New `depends_on` relations now require a non-empty reason, the CLI's import preview labels these as `imports` rather than `depends_on` until approved, and `relation_check` no longer proposes write arguments for a new `depends_on` relation.

## 2026-08-04 · Floating sheets and palettes converge on one corner radius

**Changed**: The keyboard-shortcut sheet, search palette, global search, agent-connect panel, vault guide, quick actions, gesture hints, and mobile bottom sheet now all share one rounded-corner radius instead of five different values.

## 2026-08-04 · Folder structure is no longer called dependency impact

**Changed**: `impact`, `blast_radius`, and the app's dependency-impact card now count only declared `depends_on` relations, not folder containment or domain/element structure; Insights now shows "impact scope unknown" with counts of declared relations and their reasons instead of a single confident number.

## 2026-08-04 · Import evidence no longer auto-promotes into a meaning relation

**Changed**: `infer_imports` now shows up to 5 exact file-level import examples as evidence instead of just counts, and reports a difference from the vault as needing rationale review rather than proposing an automatic write.
**Removed**: CLI `infer-imports --apply`, and `bootstrap`/`index --apply`, can no longer create `depends_on` relations or import-based connections automatically; a person must still review the evidence and approve one with a reason.

## 2026-08-03 · Agent handoff surfaces the first meaning-repair decision right away

**Changed**: When a project's code connection is current but its competency answers are incomplete, the agent handoff's first recommended action now points directly to reviewing those answers, distinguishing structural candidates that already have supporting evidence from ones that still lack any.

## 2026-08-03 · README leads with real screens and the Windows beta

**Added**: The README's first screen now lets you choose between macOS and a Windows x64 beta; the Windows option links to a download page with the latest installer, checksums, and signing status, and states upfront that the build is unsigned, may trigger a SmartScreen warning, and could be blocked on managed PCs.
**Changed**: Reorganized the README to lead with real app screenshots, moving the comparison table after them and condensing lengthy technical sections into short summaries linking to the MCP, CLI, relations, and developer guides.

## 2026-08-03 · The value layer read its own log of "why this couldn't move" and filled its own gaps

**Changed**: Unified the borderless-inset control style used by the map INDEX lens tabs, block-import conflict picker, agent scope, shortcut scope, and footprint presets into one shape, and gave filled indigo primary buttons a dedicated foreground color token and three fixed heights of 28px, 32px, and 40px.
**Fixed**: Ellipsis truncation works again in the breadcrumb, footprint trigger, and tab labels, which had been hard-clipping text instead of shortening it with "…".

## 2026-08-03 · The design system now stands on assets and gates, with instruments to measure it

**Added**: New shared control primitives (`Chip`, `IconButton`, `RowButton`) and a `Surface` component give floating panels proper enter and exit animation and focus handling, alongside new measurement checks for map readability, text contrast, and accessibility.
**Fixed**: Controls that looked active but couldn't actually be clicked, such as the "Recent changes" chip, now look and behave as disabled wherever the shared control primitives are used; the sample-vault chip now opens folder-connection guidance instead of leading nowhere.
**Removed**: Three unused components, `Card`, `Badge`, and `DetailCard`, that had drifted outside the design system's type scale.

## 2026-08-03 · README shows recent changes with context

**Changed**: README's map walkthrough now includes a captured demonstration of the Recent lens, showing recently modified nodes highlighted while the rest of the map recedes, with the project and domain hierarchy preserved around them.

## 2026-08-02 · Ontology quality contract and documentation now agree

**Changed**: README and the public spec now state clearly that vault and project node counts have no cap, that a high fan-out is only a review signal, and that broad hubs and bridges are judged by role exclusivity and behavior, not raw numbers. A new `docs/ONTOLOGY-QUALITY.md` links these rules to their schema, construction rule, analyzer, and field-trial checks.
**Fixed**: Corrected README's broken logo, outdated wording about desktop and web having identical screens, and stale phrasing elsewhere; the documentation link checker now also catches local images referenced through raw HTML `img src` and `source srcset`. Project list cards now show the same description as the project detail page instead of appearing blank.

## 2026-08-02 · Python import evidence becomes a checkable meaning boundary

**Changed**: `analyze_repo_structure` now proposes up to 12 ranked Python module and package boundaries that are actually used in static imports, instead of only the top-level package, skips unused files, and excludes ambiguous name collisions rather than guessing. Proposed `depends_on` relations are now checked against the real import direction before they can be written.

## 2026-08-02 · Python cold start reads meaning evidence and static imports

**Added**: `analyze_repo_structure` and `index_project` now read `README.rst`, static `setup.py` package metadata, and top-level `__init__.py` files as Python project evidence. `infer_imports` reads static Python `import` and `from ... import` statements, including relative and multi-line forms, as file and module dependency evidence.

## 2026-08-02 · Nodes keep a permanent UID alongside a readable slug

**Added**: Every ontology node now carries a permanent `uid` (UUIDv4) alongside its human-readable `slug`. Renaming, reclassifying, and merging nodes now preserve the UID, and exports use `urn:uuid:<uid>` as the stable identity across renames. Existing vaults can be upgraded with `pnpm vault:migrate 2026-08-02-add-node-uids --vault <dir>`.

## 2026-08-02 · Map panel says what you get instead of internal terms

**Changed**: Map panel labels now describe outcomes instead of internal terms: copy actions read "Copy project info for AI" and "Copy item info for AI", with a follow-up message telling you what to do next. Relation labels now read "child items", "parent items", and "needed items", and other buttons read "Open document", "Ask AI", "Focus this area", and "View details".

## 2026-08-02 · Project meaning answers are re-checked in every new agent session

**Added**: A new MCP tool, `finalize_project_meaning`, re-verifies a project's competency answers against current graph and source evidence after writes are approved and validated. `query_ontology({operation:"agent_brief"})` re-derives this assessment each time rather than trusting a stored result, and CLI `agent-brief --project <slug>` selects one project in a vault that holds several.

## 2026-08-02 · Project code-evidence panel says and does less clutter

**Changed**: The project code-evidence panel now separates status, source, measurement time, and currentness, and no longer shows an internal all-clear message when nothing needs flagging; a "Next check" prompt appears only when a real gap exists. The AI handoff copy action now appears once, and project quick actions are reduced to four: documents, edit relations, ask AI, and focus this area.

## 2026-08-02 · Project code evidence reads the same for people and agents

**Added**: Selecting a project on the map now shows its code-evidence status, measurement time, currentness, first gap, and next action in both the compact and full detail views. The installed app connects a Git worktree or local folder per project to measure where its capabilities and elements live, and "re-measure" reuses that saved connection.
**Changed**: Absolute folder paths stay out of the shared graph and out of anything copied to an AI; only the connection type ("Git repository" or "local folder") is shown, which is not the same as a GitHub or remote connection.

## 2026-08-02 · Bootstrap answers keep their evidence and gaps in the write plan

**Fixed**: Competency-question answers can no longer pass just because they contain text; each one now carries supporting evidence and is marked `answered`, `partial`, or `visible-gap`, and unresolved gaps are preserved in the project document's "Competency answers" section instead of being hidden. Malformed list input is now caught with a clear error instead of causing an internal failure.

## 2026-08-02 · Init keeps the MCP repo root correct behind macOS path aliases

**Fixed**: `ontology-atlas init` no longer produces a broken, doubled repository root path in the generated MCP and Codex configuration when the vault's location uses a macOS path alias such as `/tmp`; it now resolves to the real repository root.

## 2026-08-02 · Approved graphs are preserved as a verified write plan

**Fixed**: The bootstrap approval screen previously showed elements and relations that had never actually been validated, and the write step could silently drop a validated domain. Full proposals now validate projects, domains, capabilities, elements, and relations together and produce one consistent write plan that preserves each item's definition, evidence, and rationale.

## 2026-08-02 · Rust package manifests are read as bootstrap evidence

**Added**: `analyze_repo_structure` now reads a Rust project's root `Cargo.toml` package identity, description, and feature names as citable evidence, so a capability can reference the package manifest directly instead of falling back to the README.

## 2026-08-02 · Fixed a rename-overwrite ordering bug that undid the rename

**Fixed**: Renaming a concept onto an existing one with `overwrite: true` (or CLI `rename --confirm --overwrite`) no longer loses the new title, body, and evidence to a leftover update meant for the node it replaced.

## 2026-08-02 · Separated a capability's code path from its graph children

**Fixed**: A capability's code entry point (`path:`) is now kept separate from its `elements:` list of implementation nodes, removing contradictory guidance that pushed users to create one element node per file just to satisfy evidence checks. MCP and CLI `add --path` follow the same rule.

## 2026-08-02 · Faster first response and stronger evidence for local-model audits

**Changed**: Structural audits run through a connected local model (Ollama and similar) now follow a stricter read order, stop sending tool definitions a model ignores, and answer only from verified evidence after a capped number of reads instead of drawing conclusions from node counts alone.
**Fixed**: Local-runner requests now time out after 60 seconds with guidance to narrow the question or choose a faster model, instead of hanging or reporting a generic connection failure. The installed app's local development builds now run the actual latest code without losing saved vault connections or settings.

## 2026-08-02 · The overhead bar speaks, and Path Walked shows where you have been

**Added**: A new "Path Walked" lens highlights the nodes you have visited and the relations you followed between them, in your chosen trail color, fading out when you turn the lens off while your current selection keeps its ring.
**Changed**: The expand control above a selected node now reads "Expand all", "Expand {count}", or "Collapse" instead of a bare "+N", and shows a count only when it differs from the number already shown on the node. Controls that previously vanished when they did not fit now remain visible as small pills.

## 2026-08-01 · `v1.0.0-rc.5`: public unsigned Windows x64 beta with native verification

**Added**: An unsigned Windows x64 installer (`ontology-atlas_<version>_windows_x64-setup.exe`, with a matching `.sha256`) is now available on the public beta channel. It bundles the compiled MCP server as `ontology-atlas-mcp.exe` with native credential storage, matching the macOS build.
**Changed**: The download page now discloses the lack of code signing and the possibility of a Microsoft Defender SmartScreen warning before you download, and separates macOS and Windows into two sections of one download panel, with a footer row offering "Go to GitHub" and "View web version".

## 2026-08-01 · Connect an agent from the web too, one-call vault fingerprinting, and three screen corrections

**Added**: The web app can now build an MCP connection configuration in the same sheet as the installed app. It asks only for the one absolute path a browser cannot know and assembles the rest into a copyable file, with nothing transmitted or stored.
**Changed**: The document count now reflects the actually selected collection instead of always saying "All documents", the AI-connect sheet no longer claims a feature is unavailable when it already works, and models that cannot hold a conversation no longer appear first in the runner list.
**Fixed**: Reopening or refocusing the app now refreshes the vault by reading only file paths and modification times, instead of re-fetching every file's full contents.

## 2026-08-01 · What an agent handed only the vault could not read: full bodies, matching checks, and visible gaps

**Added**: `get_concept` (and `get_concepts`, `find_evidence`, `list_concepts`) can now return the full body text on request with `body: 'full'`, and every response now reports the original length, the returned length, and whether it was truncated. A new `capability_without_evidence` finding flags capabilities whose `elements:` list is empty, without blocking the write.
**Fixed**: `validate` and `health` no longer give contradictory verdicts on the same vault; when a code root cannot be resolved, both now say so instead of silently checking the wrong repository.

## 2026-08-01 · Rebuilt the example storefront vault to spec and fixed a `/project/storefront/` 404

**Added**: The example storefront vault now has both Korean and English display names throughout, and includes real semantic relations, such as return handling linked to exchange handling, alongside cross-domain dependencies across eight business areas: product, inventory, orders, payment, shipping, membership, marketing, and customer support.
**Fixed**: `/project/storefront/` and its Korean route no longer return 404. The storefront example no longer shows different node titles depending on language, since every node now has a matching English display name.

## 2026-08-01 · Chat agents can connect to local runners (Ollama, LM Studio, llama.cpp)

**Added**: Settings > AI Connection now has a local runner row: enter an address (default `http://localhost:11434`), check the connection, and pick from the runner's installed models to power the vault chat agent, with no API key needed.
**Changed**: Because the endpoint is OpenAI-compatible, Ollama, LM Studio, llama.cpp server, and vLLM all connect through the same address field, and local traffic is logged locally by host.
**Fixed**: Connection failures (runner not running, port already used by something else, or no models installed) now each show a specific reason and next step instead of a generic failure, for both the new local runner and the existing named vendors.

## 2026-08-01 · Documentation checks moved from prose pins to generate-then-diff

**Fixed**: Project documentation was missing six CLI commands (`absorb`, `agent-activity`, `agent-files`, `export`, `index`, `moment`) from `cli/README.md`, and contained several broken internal links; both are now corrected, and the check is regenerated from the live MCP tool list and CLI commands instead of matching fixed sentences.

## 2026-08-01 · Slugs are flat identifiers: the write gate rejects path-style slugs

**Added**: CLI `add` now records who created a node (`created_by: agent:...`, or `--created-by human`), and structure analysis can propose standalone packages, such as this project's own `mcp/` and `cli/`, as element candidates.
**Changed**: A new guide chapter, "How relations form" (`/guide/relations`), explains how semantic relations cross domain boundaries independent of the map's hub-and-spoke layout.
**Fixed**: Creating or renaming a node with a path-style slug (like `elements/src/views/home`) is now rejected with repair guidance, instead of silently colliding on the map with other nodes that share the same file basename and losing their relations.

## 2026-07-31 · Reading pages are centered, and the guide and changelog gained tables of contents

**Added**: The guide and changelog reading pages each gained a left-hand table of contents: the guide is split into six chapters (what this is, first five minutes, vault structure, connecting AI agents, CLI, and about trust), and the changelog's list jumps to entries within the same page.
**Changed**: Both reading pages are now centered in the viewport instead of left-aligned, and the landing page no longer shows a "Back to map" link in its header.

## 2026-07-30 · Gateway chrome reads as buttons, and the map grows again

**Changed**: The map on `/` grew larger again; `/download` keeps its smaller one-screen layout.
**Fixed**: The language switcher and disabled close button on `/` now show their state through shape and cursor, not just faint color, so they read clearly as controls.

## 2026-07-30 · Gateway map grows and moves closer to the card

**Changed**: On `/`, the topology map is bigger and sits closer to its card, closing the empty gap between them; `/download` is unchanged.

## 2026-07-30 · Two new gateway reading pages: `/guide` and `/changelog`

**Added**: `/guide` and `/changelog` let you read the project guide and changelog, straight from the vault's docs, before downloading.
**Changed**: `/changelog` shows only the latest 12 entries and says how many are hidden and where to find the rest.

## 2026-07-30 · `v1.0.0-rc.4`: `/` becomes the product's face, demo clips ship, and Connect writes only your tool

**Added**: `/` now shows the download gateway to web visitors without a vault, two short demo clips, and a "This folder / This computer" scope choice for agent setup.
**Changed**: "Connect agent" now writes settings only for the tool you pick, `/` no longer restores your last route, and settings open in a centered dialog.
**Fixed**: The app icon and other brand images now use the correct, current logo.

## 2026-07-29 · `/download`: captions match the map, the grid lines up, and the map can't wander off

**Fixed**: The caption count now matches what the map shows, the whole page grid lines up at every width, and the first screen fits with no scrolling; The map can no longer be dragged off screen with no way back, and the English button no longer overflows at 320px width.

## 2026-07-28 · Touch targets grow to 44px, plus a `?guides=off` testing switch

**Added**: A `?guides=off` URL switch (and `?guides=reset`) turns onboarding guide overlays off.
**Changed**: `/download` now uses the gateway's top navigation instead of a side rail, with its download button promoted to the hero.
**Fixed**: Buttons in the map's top chrome and first-run panel are now at least 44px on touch devices, easier to tap accurately.

## 2026-07-28 · Ends the pattern where each release attempt failed at a new step

**Changed**: Release builds now lock the bundled MCP server's dependencies, and a new rehearsal step catches release problems before a version is tagged.
**Fixed**: An app update installed through the built-in updater could show a "the app is damaged" error; updates are now signed correctly so this no longer happens.

## 2026-07-28 · README screenshots and claims now match the installed app

**Added**: A comparison table shows how Atlas differs from similar local-markdown-plus-MCP tools.
**Changed**: README screenshots are now real captures of the installed app (map, node focus, agent connection, workbench, insights, history, projects) instead of old web captures.
**Fixed**: Removed outdated claims about an unpublished npm package; the README now describes downloading the app once to install both the human and agent surfaces.

## 2026-07-28 · Clicking a node on the map responds faster

**Fixed**: Clicking a node no longer does extra work for a detail view you haven't opened, making clicks noticeably faster in large vaults; opening the full detail card still shows the same information.

## 2026-07-28 · Guides no longer interrupt you, and the workbench says when it can't open

**Fixed**: Onboarding guide cards for docs, workbench, insights, projects, and history no longer pop up once you've already started working, matching how the map's guide already behaved; Opening the workbench below 1024px width now shows a clear "needs a wider window" message instead of a broken layout; The workbench's new-node "kind" question now has a correct label, and its type chips have a visible "Kind" label.

## 2026-07-28 · Motion: real exit animations, and reduced motion respects your own dragging

**Changed**: With reduced motion on, panning, dragging, and zooming the map with your own input now moves normally instead of teleporting; motion the app starts on its own still jumps instantly.
**Fixed**: Collapsing the INDEX panel and the map resizing now happen together, instead of the panel vanishing instantly while the map slowly caught up; Closing a node popover, sheet, or scrim now plays a real closing animation instead of vanishing instantly; toasts and insight tab switches also animate more smoothly.

## 2026-07-28 · Removed stale `npx` install instructions from launch posts, templates, and the starter README

**Changed**: The launch pitch is now "one download installs both the human and agent surfaces" instead of an `npx` one-liner.
**Fixed**: Launch drafts, issue templates, and the starter README no longer reference an `npx` install command that doesn't work.

## 2026-07-28 · English screens no longer show Korean labels, and the INDEX footer text no longer clips

**Fixed**: On English screens, category and status dropdowns and card preview text now show in English instead of Korean; The INDEX panel's footer status labels no longer get cut off in either language.

## 2026-07-28 · Agent panel redesign: clearer layout, fewer repeated warnings

**Changed**: The agent panel's layout now anchors what you can ask at the top and what's needed at the bottom, with one consolidated bottom bar instead of four; Example prompts are more visible, and the note about confirming file changes appears where you actually make that decision.
**Fixed**: The unverified-answer warning no longer repeats three times per turn, and hitting a rate limit now gives you a way to resend your message once it clears.

## 2026-07-27 · Page titles render with consistent line spacing

**Fixed**: Page titles on `/projects`, `/ontology/insights`, the empty `/docs` state, and `/git` now use a deliberate, tighter line height instead of an unset browser default.

## 2026-07-27 · Fixed a false privacy claim on the download page, and clarified the Windows message

**Changed**: The website is now explicitly the install gateway and a secondary browser workbench; desktop-only features are labeled as such.
**Fixed**: The download page claimed the site "does not open or modify your folders," which was false; the copy now says what actually works in Chrome and Edge today; The Windows message no longer just says "not available yet" with no path forward.

## 2026-07-27 · The app now bundles its own MCP server so Connect agent works out of the box

**Added**: The app bundles a compiled MCP server, and "Connect agent" writes Claude Code, Cursor, VS Code, or Codex configuration to it automatically, no Node.js or `npx` required.
**Changed**: Connect now shows what it will write and where before writing, then verifies the connection by reading a concept from your folder.
**Fixed**: CLI `--help` and the starter README no longer point at a nonexistent `npx ontology-atlas-mcp` package.

## 2026-07-27 · Fixed a release pipeline bug that stalled every release build

**Fixed**: Uploaded install files ended up nested an extra folder level deeper than expected, which had stalled every release attempt; auto-update checks are now verified against the actual published files.

## 2026-07-27 · Download page rebuilt around one job: help you pick and get the right file

**Changed**: The page now centers on one primary action, guidance for picking Apple Silicon vs Intel, and four trust facts you can verify yourself.
**Fixed**: Removed outdated "not yet signed" warnings that contradicted the build's own signature note; the page now correctly reflects that builds are signed and notarized; The English download page no longer shows Korean release-notes preview text.

## 2026-07-27 · Fixed a too-small node name in the workbench, and missing bottom space on four screens

**Fixed**: The workbench's center card node name now renders at its intended larger size instead of a default browser size; The projects list, project detail, insights, and download screens now keep their bottom padding when you scroll to the end.

## 2026-07-27 · Fixed document last-changed dates that shifted on every merge

**Fixed**: Documents no longer show a new "last changed" date on every unrelated merge; dates are now based on the day, not the exact commit time; The deployed site previously showed every document as changed "today"; document dates on the live site now reflect their real history.

## 2026-07-27 · `v1.0.0`: the download page now gives you a real download

**Added**: A Windows card now says a signed installer is coming later and why, instead of omitting Windows entirely.
**Changed**: Versioning moved from `0.1.0` to `1.0.0`, and a release is published only after someone has installed and tested that exact build.
**Fixed**: The main download button no longer links to an empty release list; file sizes and checksums now come from the actual published release.

## 2026-07-27 · A consistent line-height scale replaces one-off spacing values

**Fixed**: Line spacing now follows a consistent scale tied to each text size instead of slightly different values per screen; the docs table-of-contents rows gained a bit more room.

## 2026-07-27 · History screen redesign: review changes and decide what to keep

**Added**: Tab switches, list items, and status changes are now animated instead of appearing instantly.
**Changed**: The history screen now centers on one job, reviewing changed concepts and deciding whether to keep them as a step, with that list and button as the clear focus; The two-column layout only appears when there's something to compare, and evidence is grouped with a plain-language summary instead of raw git diff text.
**Fixed**: Removed a settings-suggestion card shown above your content, and a tab name that duplicated the page title.

## 2026-07-27 · Default animation timing is now consistent across the app

**Fixed**: Transitions now use one of three consistent speeds (confirm, move, commit) instead of a mix of framework defaults and hand-copied numbers; A workbench confirmation animation that ran longer than its own stated limit is now within it, and a displayed timing label now matches its actual value; Clicking a concept now animates its popover smoothly instead of snapping instantly while the background eased separately.

## 2026-07-27 · New project creation screen rebuilt as a creation screen

**Changed**: The creation screen is now separate from the edit screen: the 4 required fields (name, category, status, short description) are visible without scrolling, the document address is a small caption under the name (auto-generated, or set manually), everything else collapses into "Fill in more," and the create actions appear only below the form.
**Fixed**: The new-project screen no longer loses its bottom padding and gets stuck against the bottom of the scroll area.

## 2026-07-27 · Docs and the ontology vault describe the current app, not retired screens

**Changed**: Documentation and the ontology vault now describe the app as it currently works, a single `topology-map-v2` canvas, neutral kind coloring, a relation-line legend, and Topology, INDEX, Workshop, and Insights, instead of retired features they previously referenced.

## 2026-07-27 · The app no longer offers to connect an unpublished agent package

**Fixed**: The AI agent settings no longer offer to connect an agent package that isn't actually published. Since the package isn't on the public npm registry, the app now hides the connect button, restart action, connection check, and `npx` copy option, and shows source-checkout instructions and commands instead.

## 2026-07-27 · Agent handoffs no longer route through the retired Builder

**Fixed**: The MCP `builder_context` tool now returns a direct `/ontology/studio/` link instead of pointing agents through the retired Builder screen and its compatibility redirect.

## 2026-07-27 · Architecture and navigation docs describe the app as it actually works

**Changed**: The architecture and navigation documentation now matches the app's real structure, Topology for reading, Workshop for writing, the 5-question Insights board, and a Git workbench, replacing descriptions of screens and navigation that no longer exist.

## 2026-07-27 · The design guard now protects the real 5-question Insights layout

**Changed**: The automated check that guards the Insights screen was rewritten to verify the actual 5-question tab layout, single active panel, and per-tab agent handoff, instead of an outdated 3-tab structure it used to accept.

## 2026-07-27 · Packaged app checks now verify current routes instead of retired screens

**Changed**: The packaged-app verification suite now checks the current Download, Docs, Topology, and Insights screens instead of retired ones, so a passing result reflects the real app instead of outdated expectations.

## 2026-07-27 · The installed app's verifier recognizes the current Insights screen

**Changed**: The automated verifier for the installed app's Insights screen now checks the current 5-tab maintenance board, single selection, and agent handoff, instead of failing on retired content that no longer exists.

## 2026-07-27 · Every item in the repair queue can now be opened, not just the first

**Added**: The Insights "To-do" repair queue now lets you open every flagged item, not only the first one. A "View N more repair targets" control expands the rest, each with its problem type, node name, and links to edit the relation or open the source document.

## 2026-07-27 · Fixes across Workshop saving, a labeling gate, and relation counts

**Changed**: The concept detail popover's fade-in now matches the app's standard motion timing instead of appearing to snap in almost instantly.
**Fixed**: Saving a document in the Workshop no longer shows a "can't find this concept" error after a successful save; new document titles now read as human names, not raw file paths; the Workshop's save button no longer gets flagged as a decorative arrow; on-screen relation counts match the CLI and MCP; and the "similar name" list can show matches beyond the first three.

## 2026-07-27 · Silently swallowed clicks, and English leaking into Korean screens

**Fixed**: Clicking elsewhere while the docs first-visit tip is showing now dismisses the tip instead of silently doing nothing; the Korean detail screen now shows concept and relation counts in Korean instead of English; and English count labels like "project" and "domain" now correctly switch between singular and plural.

## 2026-07-27 · Removed the blank screen right after entering Workshop, Insights, Docs, or the map

**Fixed**: The Workshop and Insights screens no longer show a blank black screen for up to several seconds on a slow connection or throttled device. A plain "Loading this screen…" message now appears immediately instead of nothing at all.

## 2026-07-27 · The agent's first words, and the loop that follows

**Added**: The agent chat panel now offers three ready-to-send starter messages based on what's on screen: a gap in the current concept, the top repair-queue item, or a general question, with no model call needed. After a change is applied, the agent suggests one next step as another starter message. New conversations show recently applied changes from git so work can continue across sessions.
**Changed**: When the agent panel is open, the node detail panel now shifts inward instead of being covered by it.

## 2026-07-27 · Domain composition bar: removed color that carried no information

**Changed**: The domain composition bar (capabilities vs. elements) on `/projects` cards and the Insights "Composition" tab now uses one indigo color plus neutral gray with a thin dividing seam, instead of two colors that were hard to tell apart, especially for colorblind users. Which segment is which is still shown by order, label, and the adjacent number.

## 2026-07-27 · Six charts that contradicted their own captions

**Added**: Sample project and domain documents now include a short description so the first-visit card doesn't say no description exists.
**Changed**: Recently-updated and recent-activity lists no longer show duplicate or undocumented entries as real content, domain bars now share one consistent axis length, and the Boundaries tab's charts were enlarged to use more of the available screen width.
**Fixed**: The boundary-pressure bar now plots and sorts by crossing ratio, matching its caption, instead of raw totals that ranked domains almost backwards; the heatmap's diagonal now darkens with its own value and meets contrast requirements; and the domain minimap caption now only promises relative size, not exact proportion.

## 2026-07-26 · First clicks no longer end in errors, and names no longer cut through shapes

**Changed**: The "freshness" note on a node's full detail now matches its data sheet, an auto-align notification no longer covers the map legend, and Korean first-screen text no longer shows doubled spaces from Latin-only styling.
**Fixed**: Opening a folder in Safari or Firefox no longer throws a raw error on the first click, unsupported browsers now show a clear message and a link to the macOS app, and canceling the folder picker is no longer treated as an error. Node names on the map no longer get cut off or overlap a selected node's own shape, flipping above it when there isn't room below.

## 2026-07-26 · "Vault Helper" became "Agent," and the keyless screen got a door

**Added**: When no AI key is set up, the Agent panel now shows a button that opens Settings directly to AI Connection, a preview of the chat input area, and a list of things you can ask it to do, instead of a mostly empty panel with just a text hint.
**Changed**: The map's side panel, previously called "Vault Helper," is now called "Agent," matching the term used elsewhere in the app.

## 2026-07-26 · "To-do" now shows your own work first, and finishes in place

**Added**: The Insights "To-do" tab now splits items into "You can fix this now" and "Hand off to a developer or AI," with your own items shown first when you have write access. Missing concept descriptions and missing domain assignments can now be fixed by expanding the row and saving right there, without leaving for the Workshop.
**Changed**: On a read-only folder, actions you can't complete are relabeled instead of shown as disabled, for example "Edit in Workshop" becomes "View in Workshop," and hand-off items are shown first.

## 2026-07-26 · Removed moments where the screen froze

**Changed**: Turning on "reduce motion" now only removes movement and zooming, not fade transitions, so cause and effect stay visible, and Settings now slides in the correct direction when opening AI Connection and back.
**Fixed**: Opening the Agent panel no longer makes the map flash blank, and opening full detail no longer flashes the window black; both now transition smoothly with the previous screen staying visible until the next is ready.

## 2026-07-26 · Removed the in-app terminal

**Changed**: The Agent panel now has a "Continue in your terminal" card that copies a ready-to-paste command, including `cd` into your vault folder, so agent work can continue in your own terminal; the map still picks up changes automatically. MCP tools, CLI commands, and the Agent chat panel are unaffected.
**Removed**: The embedded terminal dock at the bottom of the app, and its keyboard shortcut, have been removed. It offered a single plain shell with no tabs, split panes, or shell profiles, and closing it ended the session.

## 2026-07-26 · The risk list no longer sits full of test files

**Changed**: The "Concepts that ripple widely if changed" list on the Connections tab now counts only concepts that have their own document, instead of ranking undocumented code references, such as generic test or MCP files, at the same weight as real concepts. Undocumented references move into a collapsible "name-only references" section instead of disappearing.
**Fixed**: Abbreviations like MCP and CLI are now capitalized consistently, and two files both previously shown as "Integration Test" are now distinguished by their source path.

## 2026-07-26 · The CLI and MCP now know the names the screen uses

**Added**: `overview` and `list_kinds` now report both documented concepts and name-only references, and `get_concept` explains who referenced an undocumented name and offers to create its document.
**Fixed**: The map, CLI, and MCP now agree on concept counts and names; looking up the concept the map flags as riskiest to change by its slug no longer returns "not found," and copyable agent commands such as `merge_concepts` no longer fail from an extra path segment.

## 2026-07-26 · AI Connection: what you opened can now be closed again

**Changed**: Vendor rows in AI Connection now have more breathing room between them, and the dialog now highlights the vendor list as the one interactive box instead of stacking every section with equal weight.
**Fixed**: The AI key registration form now has a Cancel button, so opening it no longer traps you into either saving a key or leaving it open; pressing Esc now closes the open form first instead of jumping straight out of the settings sheet.

## 2026-07-26 · Places non-developers couldn't read, now in plain language

**Changed**: The project overview shown in the app is now a plain-language description for non-developers instead of a raw excerpt of `AGENTS.md`, with technical detail moved to a "notes for builders" section. The product is called "Ontology Atlas" instead of its code slug, and capability names now have human-readable labels in both English and Korean.
**Fixed**: A project's description no longer shows as missing on the `/projects` card when it's actually set, the same concept is now named consistently across the map, docs browser, and search, and relation and concept counts now state whether they cover the current project or the whole folder.

## 2026-07-26 · Map popover: the parent counts as a connection too

**Fixed**: The map's node popover now includes a concept's parent (the domain or concept it belongs to) in its "Connections" count and list. Previously, concepts with only a parent relation showed "Connections: 0" even with a clickable domain chip sitting right above, which affected about 75% of nodes in a typical vault.

## 2026-07-26 · Insights: every number now states what it counts

**Fixed**: Insight numbers now label exactly what they count: the impact ranking footnote, the "100% connected" health status, the hub degree count, "Total" figures, and the boundary tab cards all state their scope instead of contradicting each other, and the impact ranking card folds into two aligned columns showing twice as many rows in the same space.

## 2026-07-26 · Search finds the name you see, and new vaults match the screen's language

**Fixed**: Global search now matches the name shown on screen in any language, not only the internal title, so searching for what you see always works, and new vaults always use the screen's language regardless of which button started them.

## 2026-07-26 · Nothing you did not ask for interrupts, and every press registers

**Changed**: The destination for "back to the top" is now called Map everywhere, replacing the previous mix of "workspace" and "home."
**Fixed**: Going from a project's detail page to "View on map" no longer creates extra back-button steps, the AI connect sheet no longer appears uninvited right after creating a vault, global search now closes on the first Esc press, and the first-visit tour no longer interrupts you once you start clicking around before it appears.

## 2026-07-26 · Studio no longer writes changes into someone else's document

**Added**: When you save a relation on a concept that has no document of its own, Studio now asks first and creates that concept's own document (at the path other files already point to) before writing the relation, so the change lands where it belongs.
**Fixed**: Saving a relation on a concept without its own document no longer writes the change into a different concept's file; the same fix covers relations started from "create new" in the socket picker and edits to existing relations on such concepts.

## 2026-07-26 · Two things the map said about documents that were not true

**Fixed**: The popover's "Document" button no longer opens a different concept's file: it now appears only when a concept has its own document, with a "Mentioned in" label shown elsewhere instead, and the map's onboarding and tour text no longer claims every dot is its own real document.

## 2026-07-26 · Project screen polish, plus two checks that let the issues slip through

**Fixed**: The project detail page's "Related Projects" links no longer show a decorative arrow after in-app links, breadcrumb separators are no longer oversized, and a footnote now explains why the hero chip counts and the domain bar totals differ (a concept in multiple domains is counted once per domain).

## 2026-07-26 · Terminal dock: readable and resizable even without special fonts

**Added**: The terminal dock's height can now be resized by dragging its top edge or using arrow keys after focusing it (120px minimum, 60% of viewport maximum, double-click to reset), and the size is remembered per device.
**Fixed**: Prompt separator glyphs, like the triangles in agnoster or powerlevel10k style prompts, now render correctly even without a Nerd Font installed, and background-colored prompt segments now meet accessible contrast.

## 2026-07-26 · Duplicate-suspect pairs and a domain-coupling heatgrid

**Added**: The Insights "To-do" tab now has a "Similar names: are these the same?" card listing possible duplicate concepts with their name overlap and a one-click path to merge them, and the Boundary tab now shows domain coupling as a 6x6 grid so you can also see which domain pairs have no connections at all.

## 2026-07-26 · AI Connect adds Google Gemini, and the sent-log now records the destination

**Added**: AI Connect now supports Google Gemini alongside the existing vendors, with the same key storage, last-4 display, and connection check, and unregistered vendor rows are now collapsed by default so the settings sheet does not show several password fields at once.
**Changed**: The local sent-log now records which host each call went to, and the screen shows that hostname before you confirm.

## 2026-07-26 · Past trails can be reopened: yesterday's context becomes today's handoff

**Added**: Clicking a row in Past Trails now reopens that trail as your current trail, picking up right where it left off (your in-progress trail is archived first so nothing is lost), so you can hand it to an AI agent with the existing "Continue with AI" action.
**Fixed**: A past trail whose nodes no longer exist on the current map is shown as plain text instead of a dead button, and the trail lens now stays on when moving between layers with the popover open.

## 2026-07-26 · Past Trails: your walked path survives after the session ends

**Added**: A new Past Trails section keeps your last 10 walked paths across sessions and app restarts, stored in the vault folder so the web and the installed app share it, with per-row delete and "clear all" controls; it records only one end time per trail, never per-step timestamps, dwell time, or visit counts.

## 2026-07-26 · Trail lens: opening the trail popover lets the map focus on your path

**Added**: Opening the Trail popover now dims every node, label, and relationship edge on the map except the ones you visited, so it is easier to see your path without relationship lines cluttering the view, and hovering a trail row highlights that node on the map.

## 2026-07-26 · Trail order readability and unified naming

**Changed**: Past Trails now lists the most recent step at the top (matching every other time-ordered list in the app), each row shows a caption like "1 step ago" so distance is clear from any row, and the trail chip and popover are both now labeled "Walked Path, N."

## 2026-07-26 · Settings gets "AI Connect": your API keys, connection check, and sent-log

**Added**: Settings has a new "AI Connect" section where you can store your Anthropic or OpenAI API key in this Mac's Keychain (only the last 4 characters are shown after saving), check the connection with zero vault data sent, and see every call logged locally in the vault; the browser version explains this is desktop-only and points to `/download`.

## 2026-07-26 · Terminal dock: broken prompt glyphs, left-wall clipping, and a mismatched scrollbar

**Fixed**: Terminal prompt separator glyphs (used by agnoster or powerlevel10k style prompts) no longer show as broken boxes, the terminal no longer sits flush against the left wall or clips its right edge, a stray row of measurement characters above the terminal is gone, and the dock now uses the app's thin scrollbar instead of the OS default.

## 2026-07-26 · Insights: one tab per question, the Structure tab splits into three

**Changed**: The Insights "Structure" tab is now five tabs, To-do, Composition, Connections, Boundary, and Freshness, so each answers one question instead of stacking three; old `?tab=structure` and `?tab=relations` links still work and land on the matching tab.
**Removed**: The "Most depended-on" card and the hub thumbnail icons were removed because neither showed any useful signal.

## 2026-07-26 · Every destination now explains what it is for

**Added**: Docs, Studio, Insights, Projects, and History each now show a short first-visit guide explaining what the screen is for and what to look at first, reusing the same tour style as the map; each screen remembers separately whether you have seen its guide, and you can replay any of them from Settings, Screen, "Screen guide."

## 2026-07-26 · Docs list ordering: folders first, most recently modified

**Added**: The Docs list can now be grouped folders-first or documents-first, and sorted by name or by most recently modified (a folder shows the time of its most recently modified document), from a single menu in the sidebar's icon row.

## 2026-07-25 · Map cluster chips: no more label overlap, and expanded nodes are marked

**Added**: Clicking a cluster chip to reveal its child nodes now rings those newly revealed nodes with a desaturated indigo dashed outline so you can see what just appeared.
**Fixed**: Cluster "+N" chips on the map no longer overlap node labels, since label placement now reserves space for them, while a name you are currently viewing or hovering still stays visible.

## 2026-07-25 · Removed demo project data that described features no longer in the product

**Changed**: The footer's technology list no longer mentions Sigma.js, since the map is rendered by the app's own canvas engine.
**Removed**: Fifteen demo "project" entries that described features no longer in the product, such as Firebase Hosting, a Sigma/WebGL map renderer, or admin-only editing, were deleted; a project page for a project that does not exist in your vault now shows the normal not-found state.

## 2026-07-25 · Starter content in Korean (`init --locale=ko`)

**Added**: A new vault's starter README and project content now matches the screen's language automatically on the web, and the CLI's `ontology-atlas init <folder>` command accepts `--locale=ko` to do the same; English stays the default, and an unrecognized locale fails clearly instead of silently falling back.

## 2026-07-25 · Studio auto-saves drafts and adds an in-progress list

**Added**: Studio now auto-saves your in-progress changes locally as you edit, so leaving the page, refreshing, or closing the window no longer loses unsaved work; a new "In progress N" chip in the header lists every node with unsaved changes, letting you continue or discard each one.
**Removed**: The confirmation popups that asked whether to save or discard when leaving mid-edit are gone, since drafts are now saved automatically and discarding a draft is now an explicit action.

## 2026-07-25 · Design overhaul Phase 5: personalization

**Added**: You can now choose the map's canvas background (Dots, Constellation, or Contour) and the node icon style (filled Geometric or outline Line) from Settings; the choice applies everywhere at once (map, INDEX, Studio, popovers), and node shapes still mean the same kind as before.

## 2026-07-25 · Design overhaul Phase 4: onboarding, docs, and projects

**Added**: Connecting an AI agent is now one click per client (Claude Code, Cursor, VS Code, Codex) instead of copying a snippet, available from both the map sheet and settings; Cursor and VS Code use deep links, while the web version falls back to copying a config file since it cannot know your local path.
**Changed**: The Docs sidebar collapsed to a single icon row, the project info editor now shows canonical labels with real placeholders instead of English boilerplate, and the project detail page replaced oversized stat numbers with quiet chips and readable-width text.

## 2026-07-25 · Design overhaul Phase 3: Studio and motion

**Added**: Opening Studio without a specific link (`/ontology/studio`) now shows a choice between "enhance an existing node" and "create a new node" before continuing, and the app gained a small library of consistent, quick motion for Studio and Insights interactions.
**Fixed**: An oversized empty-socket prompt in Studio was resized to match normal body text, and the Settings panel no longer appears one frame late when opening.

## 2026-07-25 · Design overhaul Phase 2 (5 map consistency fixes)

**Added**: Selecting a node now draws a thin indigo ring around its direct neighbors, so connections are visible on nodes as well as edges.
**Changed**: Freshly onboarded, very small vaults no longer over-zoom to fill the screen; the add-concept popup now uses a domain dropdown with a one-line description instead of free text; settings access on Insights, Project, and Docs now matches the map's bottom-rail gear icon.
**Removed**: The "graph" (physics) toggle and its continuous force simulation on the map; free node dragging remains, limited to the dragged node for that session.

## 2026-07-25 · Codex review batch C-A (7 trust and data consistency fixes)

**Added**: The workshop's document view now always shows the `definition:` field as a summary at the top.
**Fixed**: Insights health now matches the `ontology-atlas health` command; domain references are handled consistently across map and workshop; Docs stays on your local vault instead of jumping to Sample; project rename updates display name while keeping custom names; agent status wording is honest when nothing is connected; the startup checklist checks for the real `.mcp.json` file.

## 2026-07-25 · Design overhaul Phase 1 (design system foundations)

**Changed**: Dropdown menus, such as domain and type pickers, now use a consistent dark list style instead of the system gray dropdown; empty sections in Insights show a placeholder illustration and plain guidance instead of blank space; toolbar buttons and popup dialogs are now sized and aligned consistently.

## 2026-07-25 · Insights to-do items now re-check against the live vault

**Changed**: Insights to-do items are no longer marked done just for opening the map or workshop; after you view or copy a signal, Atlas re-checks the current vault and only clears the item once the underlying issue is actually gone, otherwise it stays highlighted for review.

## 2026-07-25 · Insights priority flow now connects view, source, fix, and verify

**Changed**: The top Insights priority item now walks through a clear sequence: check it on the map, view its source, fix it in the workshop, then verify with an agent; the source action links to the node's actual evidence document; opening a row's menu is now instant with no extra animation.

## 2026-07-25 · Language switch now preserves the current screen's URL state

**Fixed**: Switching between Korean and English no longer resets screens that remember a selection in the URL, such as the Insights Freshness tab; your selected tab and its data stay the same after switching languages.

## 2026-07-25 · Reordered the /download page to lead with install info

**Changed**: The `/download` page now shows release status, version, DMG, architecture, minimum OS, and checksums right away, before the product introduction; when no public release exists yet, the button stays honest ("Check GitHub for release") and explains why; the previous introduction moved further down the page.

## 2026-07-25 · Restored keyboard and focus behavior for Insights tabs

**Fixed**: Insights tabs now follow standard keyboard behavior: only the selected tab is reachable by Tab, left and right arrows move between tabs, and Home/End jump to the first or last tab; the focus outline is no longer clipped when the tab list scrolls horizontally.

## 2026-07-25 · Workshop CREATE: accurate save preview and duplicate handling

**Fixed**: The workshop's save preview for a new node now correctly states that a file will be created even when it has no relations yet; creating a node with the exact same kind and name as an existing one is now blocked with a clear warning instead of silently failing; broken Korean phrasing for some names was corrected.

## 2026-07-25 · Workshop: node walking, delta preview, map edge deep links (Slices 4-6)

**Added**: Clicking a connected node in the workshop now recenters on it, letting you walk from node to node with a "back to previous node" control; a "Preview" button shows what will change in the graph before you save; selecting an edge on the map can now open the workshop directly on the relation that needs fixing.
**Fixed**: Navigating away from the workshop with unsaved changes now asks whether to save, discard, or keep editing, instead of silently losing your work.

## 2026-07-25 · Workshop socket picker: from search-first to discovery-first (Slice 3)

**Added**: The workshop's node picker now opens with recommended candidates (same domain, similar name, connected neighbors) and a browsable domain list, instead of only a search box, making it easier to find what to connect when you don't know a node's name.

## 2026-07-25 · Renamed Studio to Workshop ("discover on the map, complete in the workshop")

**Changed**: The `/ontology/studio` surface is now labeled "Workshop" instead of "Studio" throughout the app; the route address and existing links are unchanged, so bookmarks and shared links still work.

## 2026-07-24 · Removed Firebase Hosting; GitHub Pages is now the single web host

**Removed**: Firebase Hosting infrastructure is gone; the web app is now served only from GitHub Pages, with no change to what you can do there.

## 2026-07-24 · Smoothed the guided tour card's step transitions

**Fixed**: The guided tour card now fades smoothly between steps instead of jumping to its new position.

## 2026-07-24 · Retired the ERD builder (/ontology/edit); the workshop absorbs it

**Changed**: "Edit relation" actions throughout the app, including the map and Insights, now open the workshop instead of the old builder, and old `/ontology/edit?node=` links still land on the right node.
**Removed**: The `/ontology/edit` ERD builder is retired; visiting it now redirects to the workshop, and the "Builder" navigation item is gone (map, docs, workshop, insights, and project remain).

## 2026-07-24 · Fixed over-sensitive clicks on INDEX tree rows

**Fixed**: Clicking a row in the INDEX tree is no longer overly sensitive to exact position; clicking a row with children now selects and expands it in one click, and selecting a row from INDEX no longer collapses the list.

## 2026-07-24 · Starter vault gets localized labels; added empty-folder scaffold button

**Added**: Starter vault documents now display in your screen's language, Korean or English; if you opened an existing empty folder, the startup checklist now offers a one-click button to create the same starter documents you would get starting fresh.

## 2026-07-24 · Workshop becomes Compass Stage; node popover redesigned; game styling retired

**Added**: A new "broader" relation lets you record what a concept is a kind of. The node detail popover was redesigned with a clearer header, sectioned relation counts, and a single "full detail" action.
**Changed**: The workshop, formerly styled as a game "enhancement screen," now lays out relations in fixed directions around the node (broader above, contains below, depends-on to the right, related to the left) instead of an embedded mini-map, and dropped its glow and rarity effects for a plain, single-indigo look.

## 2026-07-24 · Restructured the INDEX panel: guide and list are now exclusive

**Fixed**: The first-run guide and the INDEX list no longer scroll independently inside the same panel; the guide now takes over the whole panel while open, and collapses to a single "reopen start guide" row once you continue, with the list beneath it.

## 2026-07-24 · Locale-specific node names; guided tour ring alignment fix

**Added**: Node names can now be set per language, Korean or English; the map, INDEX, and node popover show the name matching your current screen language, falling back to the node's main title when no translation exists.
**Fixed**: The guided tour's spotlight ring now stays precisely aligned with its node at any zoom level.

## 2026-07-24 · Consolidated settings into one sheet; third onboarding pass

**Changed**: Map and app settings are now combined into a single settings sheet with three groups (screen, workspace, AI agent) instead of two separate settings surfaces; a leftover workspace label pill in the top-left corner is gone; you can reopen the start guide at any time after dismissing it.

## 2026-07-24 · Onboarding pass 2: folder-first and agent-first flow

**Added**: New visitors without a connected folder now see a folder-connect prompt right away, followed by a one-time AI agent connection prompt after connecting a folder; the startup checklist now leads with connecting an AI agent, then handing it your first analysis.
**Fixed**: Pressing Escape on a setup sheet no longer accidentally dismisses the first-run guide card.

## 2026-07-24 · Strengthened first-run onboarding at 4 drop-off points

**Added**: The guided tour now starts automatically on your first visit in sample mode; opening a folder shows a short reassurance message first (any folder works, stays local, empty folders get starter content); an empty vault now shows a step-by-step checklist (project, domain, relation, agent) instead of a dead end.
**Changed**: Some labels were simplified into plainer language, and the plain-language toggle is now a one-click option on the first-run card.

## 2026-07-24 · Ontology Studio Slice 2: CREATE mode

**Added**: A new "create" mode lets you build a brand-new node: fill in its kind, name, domain, and definition, then attach relations one at a time; you can save it directly to your vault or copy the equivalent agent commands to your clipboard.

## 2026-07-24 · Ontology Studio (game-like "enhancement screen") Slice 1: read-only

**Added**: A new "Studio" screen, reachable from the left rail, shows one node as a game-like item with its real relations displayed as colored gems in slots, plus a completion gauge; this first version is read-only, with editing coming in a later update.

## 2026-07-24 · "Code locations" section added; fixed mislabeled "evidence" count

**Added**: A new "Code Locations" section on the topology detail panel, full detail view, and Docs frontmatter block now shows the actual code file paths tied to a node, each with a copy button.
**Fixed**: The "Evidence N" count, which was actually always 0 or 1 and mislabeled, is now a clear "Declared" or "Not declared" indicator.

## 2026-07-24 · Scale lock contract (the end of four size and typography fixes)

**Fixed**: Icons, buttons, and text no longer render larger than intended; the app's visual scale is now locked as the standard, correcting a browser rendering bug that had inflated element sizes.

## 2026-07-23 · Guided tour (onboarding for reading the map)

**Added**: A guided tour on the map screen, opened from a new tile above the "?" shortcut, walks through what the map means: nodes as documents, dot size and shape, the relation legend, an interactive try-it step, the datasheet, INDEX, and recent changes, with separate paths for casual and developer visitors.

## 2026-07-23 · Tablet and touch responsive foundation, plus map semantics fixes

**Changed**: The map's relation legend now explains what the line styles actually mean (solid for contains, dashed for depends) instead of showing an unused confidence gradient, and relation ranking now matches that same visual hierarchy.
**Fixed**: Tablet visitors no longer lose all navigation on first entry; touch controls, the expanded INDEX panel, the datasheet, and the Builder now adapt properly at tablet widths instead of being clipped or hidden behind the bottom tab bar.

## 2026-07-23 · MCP Builder handoff, vault Git history, and live toolset proof

**Added**: The MCP server now offers 32 tools (19 read, 13 write), including `git_history` for vault-scoped commit history and `query_ontology({operation:"builder_context"})` for opening a saved node directly in the Builder along with its neighborhood.
**Fixed**: `connection_info.server` now reports the actual advertised tool count, names, and a toolset hash, so an agent can tell whether an MCP restart is needed after an upgrade; error messages that recommended `find_evidence` now show its correct call shape.

## 2026-07-23 · MCP destructive safety contract and absorb repo boundary

**Added**: Every destructive MCP tool, including relation removal and replace, rename, reclassify, merge, delete, snapshot, and document absorption, now reports the same `previewReady`, `canConfirm`, `wouldChange`, and `blockedReasons` fields on dry-run, so it is always clear whether a confirm is safe.
**Changed**: `absorb_document` now refuses to write outside the repository unless you explicitly pass `allowOutsideRepo:true`, including when a symlink points outside the repo.

## 2026-07-23 · MCP adversarial dogfood round 2

**Fixed**: Fixed several MCP reliability issues found through extensive testing, including a packaged-install-only defect, a verifier failure right after first setup, and mishandled Unicode Git paths; `git_status` now correctly returns paths containing Korean characters and spaces, and a detached Git HEAD is flagged as high risk and blocks snapshot confirmation.

## 2026-07-23 · `ontology-atlas snapshot`: commit vault changes as a Git commit (Atlas Git slice 1)

**Added**: New CLI command `ontology-atlas snapshot [vault]` commits only the ontology vault's changes as their own Git commit, with an auto-generated summary message describing counts and representative slugs by kind, leaving any other staged changes untouched. Supports `--dry-run`, `--message`, `--json`, and an explicit opt-in `--push`.

## 2026-07-23 · Left rail context carryover (map to docs)

**Added**: Selecting a node on the map and then opening Docs from the left rail now takes you straight to that node's document instead of a generic default screen.

## 2026-07-23 · Living map drift (dusty nodes)

**Added**: Nodes that have gone untouched for a long time now appear visually faded, or "dusty," on the map, reusing the existing stale-node styling. A new INDEX row shows the dusty node count, when there are any, and links to the freshness view in Insights.

## 2026-07-23 · Wiki absorption demo: `/ontology-absorb-confluence`

**Added**: The new `/ontology-absorb-confluence` skill lets a page read through your own registered third-party wiki MCP, such as a Confluence MCP, be classified and added to the vault through the existing document absorption pipeline, with your approval required before landing and the original page URL cited in the resulting node.

## 2026-07-23 · Display name layer (short names for long titles)

**Added**: Nodes can now carry an optional `display:` field in frontmatter to show a short name on the map, INDEX rows, node popovers, and other surfaces, instead of a long title. Search still matches on the full title, and the full title stays visible as secondary text in the full detail view.

## 2026-07-23 · Ask to Grow: turning unanswered queries into growth signals

**Added**: When `find_path`, `get_concept`, `query_concepts`, or `find_evidence` come back empty or unresolved, they now include a `growthHint` field suggesting a concrete next step, such as which concept or relation to add, based on what already exists in the vault.

## 2026-07-23 · Footprint trail (where you've walked)

**Added**: The map now quietly tracks which nodes you focused on during your session, showing faint, recency-fading rings on visited nodes and a trail chip, once you have visited two or more, that opens a timeline you can revisit, copy as an agent handoff, or clear. Nothing is kept after a page reload.

## 2026-07-23 · Insights to-do tab: today's touch-ups and fewer buttons

**Added**: The Insights to-do tab now shows a "today's touch-ups" band with the top three recommended items and a one-line reason for each, along with quiet feedback as you address them.
**Changed**: Each row in the to-do queue now shows one primary action button plus a kebab menu for the remaining options, instead of three separate buttons per row.

## 2026-07-23 · Desktop first run "just start" (honest automatic vault)

**Added**: The installed app's first-run screen now offers "Just start," which creates a real folder under `~/Documents/Ontology Atlas/<name>` and connects it automatically, skipping the folder picker, and seeds it with the same starter files as creating a new vault manually.

## 2026-07-23 · Commit preflight and PR freshness bot

**Added**: New CLI command `ontology-atlas preflight [--staged]` shows, before you commit, which staged vault nodes are affected and their blast radius; `agent-setup --install-pre-commit-hook` installs a Git hook that runs it; a GitHub Actions workflow flags a PR whose changed file's vault node was not updated to match.

## 2026-07-23 · Brand signature expansion (H6)

**Added**: A small "Atlas" wordmark now appears under the hexagon logo in the left navigation rail across every workbench screen, and a matching hexagon mark now sits beside the page title in Insights and Projects and in the breadcrumb in Docs and Builder.

## 2026-07-23 · Unified node identity URL contract (H5)

**Changed**: Links to nodes from Insights, popovers, and the Builder now use the canonical `capability:slug`-style format instead of the older plural-slash format. Links shared previously in the old format still open correctly.

## 2026-07-22 · Persistent onboarding entry point and Builder selection wiring (H4)

**Added**: A "switch to my data ⌘O" chip now stays visible on the map's top row after you dismiss the first-run card, so opening your own folder is always one click or shortcut away; sample mode also shows a one-time "try clicking a node" hint on first visit.
**Fixed**: Clicking a draft node in the Builder no longer briefly selects it in the inspector before snapping back to empty, and the `npx ontology-atlas` command block on the first-run card is now tucked behind a "for developers" disclosure by default.

## 2026-07-22 · Accessibility audit P0/P1 fixes (H3)

**Fixed**: Keyboard users no longer gain an extra Tab stop for every expanded row in the INDEX tree; pressing Escape on a map edge popover now closes it and returns focus correctly instead of losing it; low-contrast quaternary text in map panels is now easier to read; and the map canvas now carries a screen-reader label.

## 2026-07-22 · Restoring trust in numbers and a plain-language layer (H1)

**Added**: Numbers in the INDEX panel and node popovers now have hover tooltips clarifying whether they count direct connections only or an entire subtree, and popover section labels now have plain-language explanations on hover.
**Changed**: The first screen's headline now leads with a plain description of what the map shows; Insights now uses one consistent term for "promotion candidate"; and popover summaries that used to collapse into an unhelpful "other" group now split into real categories when possible.

## 2026-07-22 · Three developer persona bugs (doc viewer, Builder, docs search)

**Fixed**: Links in the Docs viewer that point outside the vault no longer lead to a 404 and now open on GitHub or render as plain text. Typing a name right after adding a domain in the Builder no longer loses the node or force-navigates to `/download`. A docs search with no results now shows guidance and links to key documents instead of a blank screen.

## 2026-07-22 · Design system codification R5 (Geometry and Type Codex)

**Changed**: Text sizes and corner radii across most of the app were consolidated onto a small, fixed set of standard sizes, producing only sub-pixel visual differences from before.

## 2026-07-22 · Three owner-priority fixes (firefly restore, header census pill removed, pan inertia stop)

**Changed**: Depends-relation edges on the map now always show a subtle, flowing comet-tail instead of only when focused, and hovering a node sends a brief pulse along its connections. The header's overview state no longer shows a count pill for concepts and relations.
**Fixed**: Starting a new pan or zoom while the map is still gliding from a previous flick now stops that glide immediately instead of letting it drift further.

## 2026-07-22 · Four small, effective map fixes (hit-test inversion, hover residue, realm alias, first-screen pixels)

**Fixed**: Clicking directly on a node no longer sometimes opens a nearby edge's popover instead; hover cards for edges and clusters no longer linger while panning or zooming; a realm link without a kind prefix now resolves to the right node instead of a raw label; the header brand pill now aligns with the INDEX panel, and the last INDEX row no longer gets cut off at the bottom.

## 2026-07-22 · Map motion overhaul: unified physics, consistent panel entrances, and deep-link focus dive

**Changed**: Map panel and popover appearances (node popovers, edge panels, status chips) now use one consistent fade-and-scale motion.
**Fixed**: A deep link (`?p=slug`) to a node hidden inside a collapsed cluster now automatically expands the necessary parent nodes and focuses on the target, instead of leaving it inaccessible.

## 2026-07-22 · Map fixes: chrome sizing, expansion badge, realm click, and firefly edges

**Fixed**: Map header status chips no longer render oversized compared to nearby tiles, the expanded-cluster badge no longer overlaps nodes and labels, child nodes inside a realm view respond to hover and click immediately after entering it, and flowing particle effects on focused or selected edges are restored.

## 2026-07-22 · Map fixes: realm view camera and boundary sizing

**Fixed**: Deselecting a node inside a realm view no longer sends the camera to the wrong position, and the realm boundary circle no longer extends far past the visible content.

## 2026-07-22 · Map fixes: realm view cluster chips, camera return, dragging, and starfield background

**Added**: A subtle parallax dot background now appears inside an active realm view.
**Fixed**: Expanded cluster chips no longer overlap child nodes and labels, exiting a realm view returns the camera to where you were before entering instead of jumping to the full overview, clicking a node inside a realm view no longer sends the camera flying off-screen, and nodes inside a realm view can now be dragged.
**Removed**: Faint connector lines to nodes outside a realm's boundary.

## 2026-07-22 · Map realm exit now mirrors entrance, with a transition hitch fix

**Changed**: Leaving a realm view now plays a reverse of the entrance animation, closing the view symmetrically to how it opened.
**Fixed**: A rendering hitch that could occur when the zoom tier changed during a realm view transition.

## 2026-07-22 · Map realm ledger: a realm-only panel in place of the global sidebar

**Added**: While viewing a realm, the left panel switches to a realm-only view: a header with its element, capability, and depth counts, a tree limited to that realm's contents, a "release realm" button, and a summary of relations that reach outside the realm with a way to jump to those.

## 2026-07-22 · Builder cleanup: single source for counts, plain-language labels, and safer draft creation

**Changed**: Save-status labels in the builder now use plain language instead of internal tool names, and drop shadows across the builder are now visually consistent.
**Fixed**: The builder no longer shows the same draft concept and relation counts in four different places, and pressing a create shortcut while an unnamed draft node exists now reselects that draft and focuses its name field instead of creating a duplicate.

## 2026-07-22 · Map realm view: layered depth entrance and parallax

**Added**: Realm views now animate into place layer by layer with a subtle depth parallax and dimming on deeper rings, giving the transition a 2.5D depth effect.

## 2026-07-22 · Map realm view: focus the map on one node's world

**Added**: A new realm view lets you focus the map on just one node's contents. Open it from the "expand realm" button near a focused node or the "Expand realm" action in a node's popover; the view is shareable through the `?realm=slug` URL and can be closed with the "Realm: {title}" chip's ✕ button or Esc.

## 2026-07-22 · Map polish: label priority, smoother camera easing, and hit-test fixes

**Changed**: At overview and mid-zoom levels the map now shows labels only for the most connected nodes to reduce clutter (focused, expanded, and hovered nodes always keep their label), and camera transitions such as focusing a node, diving into a cluster, or fitting the whole map now ease smoothly instead of moving abruptly.
**Fixed**: Neighbor nodes hidden behind a "+N" chip could still be clicked even though invisible, and the relation legend and zoom readout in the bottom right no longer crowd together.

## 2026-07-22 · Map redesign: domain spine, edge direction, sized nodes, and selective focus

**Added**: Dependency edges on the map now taper from thick to thin to show direction, cluster chips show mini glyphs for the collapsed nodes' kinds with a hover tooltip, and node popovers group long "contains" lists by path with a "show all" toggle.
**Changed**: Top-level domains are never collapsed into a chip regardless of count, domain and capability node size now scales with how many direct children they have, and a node with more than 24 neighbors now lights up only its top 24 most relevant ones, collapsing the rest into a "neighbors +N" chip.

## 2026-07-22 · Builder fixes: consistent popovers, honest read-only state, and easier relation creation

**Added**: An "Add relation" action in the builder's Relations tab lets you create a relation by searching for a target concept, without drag-and-drop.
**Changed**: When viewing a read-only sample, the builder now says so honestly instead of implying you can write, and offers to connect your own vault; the minimap is now mostly monochrome, with only selected or new items shown in indigo.
**Fixed**: Builder popovers now close consistently via the header close button, clicking outside, or Esc, the relation-write confirmation dialog now dims the background and can be canceled by clicking outside, and toast notifications no longer cover the "write to vault" button.

## 2026-07-22 · Map density gate: collapsing large groups into cluster chips

**Added**: Nodes with more than 12 direct children now collapse into a single "+N" cluster chip instead of overwhelming the map; clicking it expands the children into a compact layout, and which clusters are expanded is saved in the `?open=` URL so it can be shared.

## 2026-07-22 · Official demo moved to GitHub Pages

**Changed**: The official live demo moved from Firebase Hosting to `https://wlsdks.github.io/ontology-atlas/`, giving it a much higher free traffic limit.

## 2026-07-22 · Map: return-to-Insights chip and removal of unused map controls

**Added**: Navigating to the map from an Insights row now shows a "Back to Insights" chip that returns you to the exact tab you came from.
**Removed**: The map's top-right controls panel (search, "hubs only", overlay toggles, depth and force sliders, reset layout) is gone, since it had no effect; only a "Fit" button remains.

## 2026-07-21 · Fixes: CLI activity logging, relation empty-state wording, and domain popovers

**Changed**: A node with no declared relations now shows "no relations recorded yet: relations are declared via frontmatter" instead of the more ambiguous "no direct connections".
**Fixed**: CLI commands (`add`, `relate`, `import`) are now recorded in the local activity log, matching MCP writes, and domain node popovers no longer show another domain as their parent.

## 2026-07-21 · Fixed: reopening a moved or deleted vault folder on desktop

**Fixed**: Reopening a recent vault folder in the desktop app used to fail silently with a generic error when the folder had moved or been deleted; it now tells you clearly and offers to open a different recent folder or pick again.

## 2026-07-21 · Docs vault tools moved into Settings

**Changed**: Docs vault tools (agent setup, verification checklist, vault management) moved from a header dropdown into the Settings menu, under Settings, MCP/Agents and Settings, Workspace; the docs header now only keeps a quick "change vault" action, with a temporary note pointing to where the tools moved.

## 2026-07-21 · UX round 2: canvas freeze, consistent numbers, and a new Insights To-do tab

**Added**: Insights now opens on a new "To-do" tab that surfaces neglected hubs, orphans, and promotion candidates with a per-row agent handoff, alongside Structure and Freshness tabs.
**Changed**: Element nodes changed color from sage to Eucalyptus, numbers shown across the app (freshness, palette counts, project census, document counts) are now consistent everywhere, and various small labels and icons were cleaned up for clarity.
**Fixed**: The map canvas no longer freezes wheel-zoom after being idle, saved edges can be clicked to select them, builder canvas counts are now accurate, and relations that reference frontmatter now correctly appear as backlinks.

## 2026-07-21 · Backlog cleanup: relation reasons, typo suggestions, and consistent domain counts

**Added**: `relate --why` records a reason alongside a new relation in one step, and typo suggestions ("Did you mean: ...") now appear when a slug doesn't match, across `relate`, relation-check, and MCP queries.
**Changed**: Bootstrapping a project now merges into existing domains instead of duplicating them, and promoted domains are saved as real files.
**Fixed**: Domain size counts shown across the canvas, index, insights, and project pages are now always the same number, and sample data freshness now reflects the actual commit date instead of when it was cloned.

## 2026-07-21 · Fixes: edge popover links, deterministic dust, localized labels, and recent-changes timing

**Fixed**: Edge popover links no longer produce broken pages, Esc now closes an open popover before anything else, connection-sheet labels are properly localized instead of being hardcoded in Korean, and a node created moments ago now correctly appears under "today" in the recent-changes view.

## 2026-07-21 · Docs vault cleanup, editable frontmatter, and builder input fixes

**Added**: The frontmatter block on a document now lets you edit its kind, domain, and title directly, and "New document" now asks for a kind (domain, capability, element, or document) before anything else.
**Fixed**: The builder's empty-canvas hint now mentions its `P`/`D`/`C`/`E` shortcuts, its global search shortcut is now the standard `⌘K`, and its header count now shows a separate "canvas shows N" note when the canvas displays fewer items than the total.
**Removed**: Daily notes, the docs folder-topology minimap, the "+ project" button, drag-to-position storage, and inline dependency editing have been removed as unused surfaces, along with vault-wide JSON import/export (single-document HTML export/print is unaffected).

## 2026-07-21 · Relations can now record a reason

**Added**: Relations can now record a reason via a `why` field when created through the MCP `add_relation` tool; the reason appears as the edge's label and in its popover.

## 2026-07-21 · Map finale: proportional node size, scaling labels, and background depth

**Added**: A second, slower-moving layer of background particles adds a subtle depth effect to the map.
**Changed**: Domain and capability nodes are now sized by how much they contain, instead of all rendering the same size, and map labels now scale with zoom instead of staying a fixed small size.

## 2026-07-21 · Edge popovers: relations now explain themselves

**Added**: Clicking near a relation line on the map now opens a popover showing it as a plain sentence, its type, links to both connected nodes, the document that declared it, and a link to edit it.

## 2026-07-21 · Recent changes lens, agent attribution badges, and a growth prompt

**Added**: The map index now has a "Recently changed" filter that narrows the tree to touched nodes, a plain-text badge showing when an agent just updated a node, and a footer link showing how many docs aren't on the map yet with one-click promotion.

## 2026-07-21 · "AI agent connection" sheet

**Added**: Tapping the agent status in the map footer opens a connection sheet: live connection status from the agent's heartbeat, setup steps for Claude Code, Codex, and other agents (with an automatic config file on desktop), and a preview showing how a connected agent reads your map in your own domain language, with a copyable handoff summary.

## 2026-07-21 · Unified relation vocabulary, kind term definitions, and a "map" copy pass

**Added**: The "?" help footer now defines domain, capability, and element in plain language.
**Changed**: The map legend's "trust" label (actually a confidence gradient) is now called "confidence", relation names are now consistent everywhere in the app, and most in-app guidance text now says "map" instead of "ontology".

## 2026-07-21 · Node corner rounding and dependency edge arc consistency

**Fixed**: Node corner rounding now scales with node size so shapes stay consistent at every zoom level instead of looking more or less rounded as you zoom, and dependency edges now curve consistently with the direction of travel instead of reversing, with mutual dependencies shown as two separate arcs instead of one overlapping line.

## 2026-07-21 · Minimum node separation after dragging

**Fixed**: Nodes that end up overlapping after a drag, such as a child pulled on top of its parent, are now automatically pushed apart to a minimum separation once things settle, without disturbing nodes that are pinned or still animating into their first arrangement.

## 2026-07-21 · Idle frame gate for the map canvas

**Changed**: The map canvas now stops redrawing every frame after 1.2 seconds without input, and resumes instantly the moment you click, drag, or otherwise interact, reducing background CPU use with no visible delay.

## 2026-07-21 · Sample vault relationship audit

**Changed**: The sample vault's relationships were re-audited: some vague "relates" links were upgraded to more specific "depends on" or "describes" relations, and duplicate relationship edges were removed, making the sample map's connections more accurate.

## 2026-07-21 · First map reveal animation

**Added**: Right after finishing "Build a map from my docs", the new nodes now spring into place from the project's position to their final spots, so the map visibly forms out of your own documents.

## 2026-07-21 · Edge hierarchy contrast and dimmed pass-through edges

**Changed**: Connection lines are now darker and thicker for higher-level relationships, such as project and domain links, and lighter for lower-level ones, and lines that cross the whole screen with both ends off-screen are now faded so deep zoom views look less tangled.

## 2026-07-21 · Five small persona-driven fixes

**Changed**: The node panel now shows a node's domain as a clickable fact that focuses that domain on the map, and search results demote file-path-style element titles to a quieter tone to reduce noise.
**Fixed**: The insights "recently updated" row now links straight to the map instead of a dead end, and the "+1 this week" chip now accurately reflects the number of projects updated this week instead of reading like a concept-count change.

## 2026-07-21 · Outward-facing docs pass

**Changed**: The README now explicitly connects Atlas to familiar terms like "codebase map," "agent memory," and "context layer," states plainly that the map is just markdown on your disk, and adds a case study document on AGENTS.md and CLAUDE.md drift and how this project's vault approach addresses it.

## 2026-07-21 · Docs surface opens local vaults in the browser

**Fixed**: The docs surface no longer blocks web sessions that can already open a local folder, previously it always suggested installing the macOS app instead. Any browser that supports opening local folders can now open, browse, and edit your vault directly there, matching the map builder.

## 2026-07-21 · One consistent concept count across surfaces

**Fixed**: Concept counts shown on the map, in insights, and on the project page no longer disagree with each other; the builder is now honestly labeled "N saved concepts" since it counts differently by design.

## 2026-07-20 · Node panel shows last-changed time

**Added**: The node detail panel header now shows when a node was last changed, such as "changed today," "yesterday," "N days ago," "N weeks ago," or "N months ago."

## 2026-07-20 · "Build a map from my docs" (onboarding)

**Added**: Opening a folder of plain Markdown files no longer dead-ends at "0 concepts, 0 relations". It now shows how many documents were found and offers a "Build a map from my docs" button that turns your README into the project, top-level folders into domains, and each document into an element, once you approve a checklist; only frontmatter is added, and your document text stays untouched.

## 2026-07-20 · Canvas motion polish

**Changed**: The "reduced motion" setting now also covers camera moves, auto-arrange, and node-reveal animations, in addition to what it already covered.
**Fixed**: The selection highlight now settles smoothly instead of appearing to cut off, node settle time after releasing a drag no longer varies with your monitor's refresh rate, auto-arrange no longer borrows the camera's animation timing, and revealed nodes now arrive in sync with the camera instead of popping in early.

## 2026-07-20 · Canvas quality pass: ink hierarchy, world-locked background, viewport culling

**Fixed**: The animated "comet tail" on dependency edges, previously the brightest thing on an idle canvas, now only shows on the focused subgraph; the background grid now pans with the canvas instead of staying fixed to the screen; and off-screen connections are skipped for smoother panning without losing lines that still cross the visible area.

## 2026-07-20 · Map drag physics: distance-based pull falloff

**Fixed**: Dragging a single node no longer pulls the entire map along with it. Nearby nodes still move a little for a natural feel, but distant nodes now stay put instead of shifting just because they were a couple of hops away in a densely connected map.

## 2026-07-20 · Remaining colors tokenized, phase 2

**Changed**: Success indicators, previously a plain dot color, now use a consistent teal-green tone as a proper third signal color alongside warning and error, and several inconsistent amber and gold accent colors across the app and docs were unified to the correct color.

## 2026-07-20 · Indigo and overlay colors tokenized

**Changed**: Internal color values for indigo, overlay, and remaining error accents were consolidated onto a shared set of design tokens to keep colors consistent and prevent future drift.

## 2026-07-20 · Danger color tokenization and a duplicate inspector render fix

**Changed**: The map builder's node inspector no longer renders two copies of itself in the background, removing a redundant hidden element from the page.
**Fixed**: Error and warning colors, such as toast borders, the map's "node not found" chip, vault picker error hints, and editor error banners, are now unified to the correct red instead of several inconsistent off-brand reds.

## 2026-07-20 · End-to-end test suite cleanup and CI (no product change)

**Changed**: The internal end-to-end test suite was cleaned up and connected to continuous integration so testing coverage stays reliable going forward.
**Fixed**: Screen readers no longer read out 21 unlabeled chevron buttons in the map's INDEX tree; since each row already announces its expanded state, the chevrons are now hidden from assistive technology as purely decorative.

## 2026-07-19 · Docs surface breadcrumb count removed

**Removed**: The docs surface breadcrumb no longer shows a "N concepts / N relations" count. The same numbers are still one click away in the docs audit dialog, and the map keeps its own count in its own chrome.

## 2026-07-19 · Docs header redesign, part A

**Changed**: The docs header is reorganized into clearer left and right zones, the document list can now fully collapse, vault info collapses into a single chip with a popover menu, and the docs audit check now opens as a centered, closable dialog (Esc, an outside click, or the close button) that always starts closed instead of remembering its previous state.
**Removed**: The macOS download prompt in the docs header is gone; only the read-only sample banner and the /download page offer that install call to action now.

## 2026-07-19 · Docs header redesign, part B: open document tabs

**Added**: The docs header now has a tab strip for open documents: each tab shows the document's title with a close button, the active tab is visually highlighted, and your open tabs are remembered even after restarting the app. Up to 8 tabs stay open; closing the active tab moves to a neighboring tab, and closing the last tab falls back to the README or the first document in the list.

## 2026-07-19 · Light mode removed (dark-only)

**Removed**: Light mode is gone; Ontology Atlas is now dark-only. The light/dark toggle has been removed from the map settings popover and the app settings menu, though other settings such as language are unaffected. Dark-mode appearance is unchanged.

## 2026-07-19 · Docs reading experience: outline rail, back to top, and more

**Added**: Long documents now show a persistent outline rail beside the text on wide enough screens, a "back to top" button appears after scrolling down, and the properties block is collapsed by default (it previously pushed the document's title off the first screen), with a summary showing what kind of document it is and how many properties it has.
**Changed**: The notice explaining why a sample document can't be edited is now a plain-language panel with clear next steps, such as opening your own folder or downloading the macOS app, replacing a small unlabeled dot; the browser tab title now also updates to match the open document.

## 2026-07-19 · Expert UX review pass: five small fixes

**Fixed**: Corrected the Korean first-run caption that showed English text, made a missing-project deep link show the same fallback notice as other broken links after a short delay instead of failing silently, and corrected the MCP Server tool count shown in the documentation.
**Removed**: Removed the decorative arrow from the "Just looking around" button since it only dismisses the message and does not navigate anywhere.

## 2026-07-19 · Builder UX polish: empty canvas guidance, palette badges, zoom display, button hierarchy, tab tooltips

**Added**: In the `/ontology/edit` builder, added a zoom percentage readout, a "+" badge on collapsed palette tiles to show they add new cards, and icons with hover tooltips on the Overview, Relations, and Docs inspector tabs.
**Changed**: Rewrote the empty canvas message to explain that the canvas is for creating concept cards and connecting them, and gave the Write and Preview buttons distinct primary and secondary styling.

## 2026-07-19 · UX wave 1: insight hub deep links, freshness timeline, plain-language copy

**Added**: Made rows in the insights hub's relations list clickable to jump straight to that node on the map, added a time axis label under the freshness strip ("N weeks ago" to "this week"), and added full-text tooltips for truncated project activity and domain summary text.
**Changed**: Replaced technical vault jargon in the insights hub with a plain-language description of where the data comes from.

## 2026-07-19 · Builder edges, part 2: smoother curves and arc routing for relation lines

**Changed**: Relation and evidence lines are dimmer by default and brighten to full visibility on hover, matching the map's focus behavior.
**Fixed**: In the builder canvas, connector lines now curve naturally instead of looking stiff, and relation lines between vertically stacked cards arc around the cards instead of cutting straight through them.

## 2026-07-19 · Builder canvas: redesigned edges and connection UX

**Added**: Dragging a connection from a card and dropping it on empty canvas now creates a new connected concept card with its name ready to type; ports are easier to grab, snap into place, and show clear green or red feedback for valid and invalid targets while dragging.
**Fixed**: In the `/ontology/edit` builder, connection lines between cards no longer tangle into loops or take long detours, and lines connecting the same two cards no longer overlap.

## 2026-07-19 · Agent activity visibility: amber focus ring on the map

**Added**: When an agent is actively working, the node it is focused on now shows an amber ring on the map, and a chip briefly appears announcing how many concepts were just updated. Hovering the agent status tile in the rail also now shows the last node it touched and when.

## 2026-07-19 · Retiring the "Analysis" view: moving its content to three places

**Changed**: Retired the "View analysis" panel. The relation line legend is now always visible in the bottom-right corner of the map, the handoff copy actions moved into the INDEX panel's Handoff menu, and the relation quality and agent-readiness gauge moved to the Relations tab in `/ontology/insights`.
**Removed**: Removed the "View analysis" chip and a color-based legend that duplicated what node shapes already show.

## 2026-07-19 · Unifying three navigation systems into one

**Changed**: The app now uses one consistent navigation rail across every page (map, `/docs`, builder, insights, projects, `/download`), replacing the old top tab bar. The mobile bottom tab bar now matches the same five destinations, and the settings menu remains available on the project list, builder, and insights pages.

## 2026-07-19 · Topology canvas: clearer visual hierarchy for emphasis

**Changed**: The project node now stands out more clearly with a distinct amber ring, tick marks, and a larger label. Selecting a node shows a steady double ring plus a brief one-time pulse on the click itself instead of a continuous animation, and hovering a node shows a subtle preview ring.

## 2026-07-18 · Page rebuild wave: every visible page rebuilt from an approved design

**Changed**: Rebuilt every page to match approved designs: the map has a redesigned datasheet and a right-rail settings popover; project pages show a metrics strip and a domain grid with a mini map; the builder uses a persistent three-pane layout; insights moved to three tabs (Overview, Relations, Freshness); and `/docs` gained a persistent sidebar and a visible frontmatter block.
**Fixed**: Fixed project pages always showing zero linked documents, and removed a leftover glow-style ring on the selected map node.
**Removed**: Removed the old four-tab insights layout and fabricated release checksum and size figures, now showing an honest placeholder until the real values are recorded.

## 2026-07-18 · Removed the project detail Connection map

**Fixed**: Fixed the Escape key so it now closes open panels and overlays one step at a time as the keyboard shortcuts sheet promises, instead of only resetting the local graph view.
**Removed**: Removed the "Connection map" mini map from the project detail page; the same connection count is already shown in the Linked projects card.

## 2026-07-18 · Installed app: first-run onboarding for choosing a vault

**Added**: The installed app now shows a first-run screen when no vault is selected yet, letting you open an existing vault folder, create a new vault with starter files, or browse a demo vault, instead of showing the marketing landing page or a redirect.

## 2026-07-18 · Documented the product identity (v10): agent-native, human-sovereign

**Changed**: Restated the product's identity as an agent-native, human-sovereign shared meaning layer, where agents are first-class users alongside people, rather than a system built only for agents. Updated in the README, AGENTS.md, and the product direction document.

## 2026-07-18 · Landing page redesign: Circuit x Constellation

**Added**: Published the vault frontmatter schema as a public specification (`docs/ONTOLOGY-ATLAS-SPEC.md`), open for feedback via GitHub Issues for 8 weeks; no schema changes, just documentation.
**Changed**: Redesigned the `/` landing page with a new visual style, replacing the decorative animated hero graph with an honest topology miniature built from this project's own real vault data, showing the real concept and relation counts instead of mock numbers.

## 2026-07-17 · Product plan v9: a two-layer identity (local core plus optional Atlas Network)

**Changed**: Documented a new two-layer product plan: Layer 1 (the local, free, offline core) stays permanent, while an optional future Layer 2 (Atlas Network, for team sharing) is now planned under strict trust conditions, revising the earlier stance of removing cloud features forever.

## 2026-07-03 · Map rebuild: a single smooth rendering engine

**Changed**: Rebuilt the topology map's rendering engine so panning and zooming are smooth, cards slide to new positions when expanding or collapsing instead of jumping, and newly appearing cards fade in. This applies to the map, focus, path, and health views; the graph view is unchanged. All existing click, expand, and link behavior is preserved.

## 2026-07-03 · Map interactions: click to select, badge to expand, close to collapse

**Changed**: Clicking a node on the map now only selects it, without rearranging the layout or the camera. Expanding to see a node's children is now a separate, explicit action: click its count badge or double-click the card. Closing a panel or clicking the background collapses back to the overview.

## 2026-07-03 · Planner audit top three: map ink contrast, graph view dimming, cleanup chip accuracy

**Changed**: In the graph view, nodes outside your current focus are now dimmed more clearly, neighbors of the focused node show their labels immediately, and the cleanup chip only counts real problems, staying hidden when there is nothing to fix.
**Fixed**: Increased the contrast of relation lines on the map so the four line styles (strong, evidence, weak, review) are now clearly visible instead of faint, and the cleanup chip no longer flags connected project roots as unassigned.

## 2026-07-03 · Topology mode rail: five tabs simplified into two views

**Changed**: Simplified the map's mode rail from five tabs down to two, Map and Graph. Selecting a node now focuses it directly instead of needing a separate Focus tab, comparing two nodes works via shift-click or a link instead of a Path tab, and outstanding fixes now show as a small count chip instead of a Status tab, hidden when there is nothing to fix.

## 2026-07-02 · Topology "Graph" mode: a live, Obsidian-style graph

**Added**: Brought back a live "Graph" view where every node is drawn with real-time physics: drag any node to reposition it freely (your layout is remembered), hover to highlight its connections, and click to select without jumping into a detail view.

## 2026-07-02 · macOS app: uncapped animation to 120fps, expandable topology skeleton

**Added**: The map now shows a connected skeleton linking the project to its domains, and clicking a domain, then a capability, progressively reveals its capabilities and elements in an expanding fan instead of showing everything at once.
**Changed**: Narrowed the analysis panel and moved mode tabs to icons so the map takes up more of the screen, and the map legend now shows each kind's place in the hierarchy.
**Fixed**: Fixed stuttery motion in the installed macOS app on ProMotion displays by no longer capping the map's frame rate at 60fps.

## 2026-06-09 · Topology nodes: plain-language explanations of why each node matters

**Added**: Clicking a node now shows a plain-language summary in the popover: what it is, why it matters, what it depends on, and what would be affected if it changed, instead of raw graph terminology. You can override the "why it matters" line for any node by adding a `significance:` field to its frontmatter.

## 2026-06-01 · Grounded the project in published references: new FOUNDATIONS document

**Changed**: Added a foundations document that ties the product's design and ontology approach to established, cited research and design references, replacing informal justification with verifiable sources.

## 2026-05-31 · Cleaner cold start, faster live updates, better agent tools

**Added**: `find_evidence` now ranks results by relevance, `validate_vault` reports when a concept's recorded path no longer matches the code, and `infer_imports` reconciles code imports with vault relations.
**Changed**: The app now refreshes faster after a vault changes on disk (as fast as about 1.5 seconds right after a change), easing back to normal when idle.
**Fixed**: A brand-new vault created with `ontology-atlas init` no longer starts with a false validation warning.

## 2026-05-31 · Fixed the docs editor losing unsaved edits on a save conflict

**Fixed**: Fixed a bug where the `/docs` editor could silently lose your unsaved edits if the file changed on disk (for example, an agent editing it at the same time) while you were saving. The editor now keeps your edits and shows a message explaining that the file changed and could not be saved.

## 2026-05-29 · Accessibility, performance, and design consistency pass

**Added**: Added a "clear search" button when an ontology search finds nothing, and a "showing top N of M" indicator in the insights hub so results are no longer silently cut off.
**Changed**: Sped up search filtering, pulse animation, and graph calculations, most noticeable on larger vaults.
**Fixed**: Improved keyboard and screen-reader support across the app (search, navigation rail, and relation confirmation dialogs), made warning colors in light mode readable, and removed a dark-mode flash on the root redirect page.

## 2026-05-28 · Topology layout off the main thread (web worker)

**Fixed**: Dragging and auto-layout in the topology view no longer stutter; the force layout now runs on a background thread instead of the main thread, with a safe fallback on unsupported browsers.

## 2026-05-23 · Starter agent loop verification

**Added**: New and existing vaults, the Docs command palette, and a new agent setup panel now offer a copyable AI-agent verification prompt (for Claude Code, Cursor, or Codex, plus a terminal fallback sequence), and the setup panel shows which agent config files exist and can create just the missing ones.

## 2026-05-23 · 10-minute memory loop smoke

**Changed**: Added an automated check that verifies the full init-to-sync agent workflow end to end within a 10-minute budget before release.

## 2026-05-23 · Repo-local Codex onboarding

**Added**: `ontology-atlas init` and the `/docs` web starter now also generate `.codex/config.toml`, giving Codex the same repo-local MCP setup that Claude Code and Cursor already get.

## 2026-05-23 · Copyable agent run order

**Added**: The `/ontology/insights` agent recipe panel now has a button to copy the full first-contact MCP query sequence (`agent_brief`, `workspace_brief`, `query_plan`, `health`, `node_profile`) as one runbook.

## 2026-05-23 · MCP graph query compile cache

**Changed**: Repeated graph queries within the same MCP session now reuse a cached compiled snapshot instead of recompiling it, making them faster.

## 2026-05-19 · CLI growth plan dogfood

**Added**: A new `ontology-atlas growth` command shows ontology write candidates (relation recommendations, external references, dangling references, unassigned nodes, empty domains) directly in the terminal.

## 2026-05-18 · MCP first-contact and packed-smoke hardening

**Changed**: Batch write errors from `add_concepts` and `add_relations` now list every invalid field, the closest valid field name, and what was actually received, so an agent can fix a bad batch call without guessing.

## 2026-05-17 · CLI maintenance queue + focused verification

**Added**: A new `ontology-atlas maintenance` command shows the MCP maintenance work queue (counts, filters, severity, and suggested next tool calls) directly in the terminal without writing to the vault.

## 2026-05-11 · Ontology surface UX pass and topology constellation tone

**Fixed**: The ontology tree now shows a clear warning instead of silently dropping a node with multiple parents, capability nodes start collapsed, topology edges and node glow look better at every zoom level, dragging no longer reopens a node's drawer by mistake, project cards show correct domain/capability/element counts again, and Docs opens reliably on first load.

## 2026-05-10 · Mobile docs responsive polish

**Fixed**: The mobile Docs header is now a compact single row (Back, title, doc count, Topology), the local vault tools panel closes automatically after a folder loads, it opens as a bottom sheet on mobile, and narrow Ontology page layouts no longer overflow.

## 2026-05-09 · Cleaner single-file repo bootstrap graph

**Fixed**: Bootstrapping a codebase ontology no longer creates fake capability nodes for support folders such as `domain` or `storage` in single-file-per-feature repos; only real feature files become capabilities.

## 2026-05-09 · Docs-to-topology navigation visibility

**Added**: A direct Topology link now appears in the `/docs` header, and Topology is a first-class tab in mobile bottom navigation instead of being hidden under Ontology.

## 2026-05-09 · Large clean-room bootstrap hardening

**Fixed**: Bootstrapping a codebase ontology no longer breaks when generated dependency edges point at nodes that do not exist yet, and the web ontology view now resolves folder-prefixed references the same way the CLI and MCP do.

## 2026-05-09 · Clean onboarding bootstrap polish

**Added**: `ontology-atlas init` now prints ready-to-copy bootstrap commands for your actual repo path instead of placeholder paths.
**Changed**: Running `init` and `bootstrap` now removes untouched starter example files once real repo-derived nodes land, while keeping any starter file you already edited.
**Fixed**: The ontology page now has a proper main landmark and rendered document headings no longer conflict with the page heading, improving accessibility.

## 2026-05-07 · Round 18: AI agent UX improvements (read shape consistency, batch tools, vault health, accessible tree, CLI --apply)

**Added**: MCP gained batch tools (`get_concepts`, `validate_vault`, `add_concepts`, `add_relations`), the CLI gained an `orphans` command plus `--apply` bootstrap flags on `analyze`/`infer-imports`, and the ontology tree supports full keyboard navigation (arrows, Home/End, type-to-search).
**Changed**: MCP read tools return more consistent results (list filters, `mtime`, prose-aware previews, "did you mean" suggestions, and `find_path` showing which field linked two nodes), and CLI `validate` groups results by issue code.
**Fixed**: Topology always shows labels for domain and high-connectivity nodes, clicking an ontology node routes to its view instead of an empty drawer, and duplicate edges and mobile label truncation were cleaned up.

## 2026-05-06 · Round 17: `infer_imports` turns your TS/JS import graph into depends_on edge candidates

**Added**: A new MCP tool `infer_imports` (and CLI command `infer-imports`) scans your TypeScript/JavaScript import graph and proposes `depends_on` relationship candidates for review; nothing is written to the vault automatically.

## 2026-05-06 · Round 16: autonomous ingest foundation, the first analyze_repo_structure tool

**Added**: A new MCP tool `analyze_repo_structure` (and CLI command `analyze`) reads your `package.json`, README, and source folders to propose project, domain, capability, and element candidates for review, with nothing written automatically. The new `/ontology-bootstrap` flow guides you from these candidates to a real vault.

## 2026-05-06 · Round 15 follow-up #2: honest project data (Concern 1 fix)

**Fixed**: The web app no longer invents project details (category, status, hub flag, position, timeline) that are not in your vault frontmatter, and projects without a saved position are now spread out automatically instead of all stacking at the same point.

## 2026-05-06 · Round 15 follow-up: five new CLI graph-level commands (Concern 4 fix)

**Added**: The CLI gained `backlinks`, `query`, `rename`, `merge`, and `delete` commands, giving you the same graph-editing power from the terminal that previously required an AI agent.

## 2026-05-06 · Round 15: VSCode plugin removed, simplifying entry points for the AI-agent terminal era

**Changed**: `ontology-atlas init` now writes a ready-to-use `.mcp.json` directly instead of only an example file, so an AI agent connects immediately without a manual copy step.
**Removed**: The VSCode plugin (tree view, code-to-ontology jump, add concept command, backlinks panel) has been removed; use the CLI, an MCP-connected AI agent, or the web app instead.

## 2026-05-05 · Round 14: automatic AI agent to vault sync, instant web updates, and a shared frontmatter schema

**Added**: The web app now detects vault changes within about 5 seconds and shows "Added" / "Edited" toast notifications with a graph pulse on any page, and the CLI gained a new `import` command that brings external markdown files into the vault with your schema applied automatically.
**Fixed**: `/topology` no longer shows an empty graph when a vault has domain, capability, or element ontology nodes; they now render together with the project graph. Also fixed missing localized 404 pages and tightened homepage spacing.

## 2026-05-04 · Round 13: first AI agent quality measurement and VSCode plugin MVP

**Added**: A new VSCode plugin adds an Activity Bar view of your vault, click-to-open nodes, a status bar link between the open file and its ontology node, an "Add concept" command, and a backlinks panel.
**Changed**: MCP-connected agents now receive built-in guidance (kind hierarchy, call order, dry-run/confirm pattern) automatically on connect, instead of learning it through trial and error.

## 2026-05-04 · Round 12: developer-primary direction, five new CLI commands, and a stronger dogfood graph

**Added**: The CLI gained `list`, `validate`, `add`, and `find` commands, giving you everyday terminal entry points beyond `init`.

## 2026-05-04 · Round 11: strengthening AI partnership (vault tooling, parser contract, MCP graph-level writes)

**Added**: MCP gained `rename_concept` and `merge_concepts` tools with automatic backlink redirection, plus conflict detection on all write tools so simultaneous edits from a human, another tool, or another agent no longer silently overwrite each other.
**Changed**: The web editor and local vault picker now warn when the vault changed externally since you started editing, instead of silently overwriting your changes.
**Fixed**: The topology graph now recovers gracefully, with a "switch to tree view" option, instead of crashing if the WebGL renderer fails.

## 2026-05-03 · Round 9: robustness audit (3 ship, 2 defer, lint floor)

**Fixed**: Losing write permission to a local vault (folder renamed or access revoked) now shows a clear banner and reopens the folder picker instead of silently falling back to sample data; the local vault toggle now explains via tooltip why it is disabled in unsupported browsers.

## 2026-05-03 · Round 8: refactor useLocalVault into a shared provider (deferred from Round 7)

**Changed**: Consolidated local vault state behind a single shared provider so it loads once per page instead of being re-initialized separately by every component that uses it, which can speed up loading for large vaults.

## 2026-05-03 · Surface diet Round 7: first-principles review (1 shipped, 3 deferred)

**Fixed**: The MCP `add_relation` tool now checks that both the source and target slugs actually exist in the vault, returning a clear error instead of silently adding a dangling reference for a mistyped or invented slug.

## 2026-05-03 · Surface diet Round 6: MCP parity and vault drift (2 fixed, 2 skipped)

**Fixed**: MCP `add_concept` and `patch_concept` now reject a blank or whitespace-only title, matching the rule already enforced in the UI; the bundled example vault's Views page label and search-shortcut description were corrected to match the current "Browse" navigation.

## 2026-05-03 · Surface diet Round 5: skeptic round (1 fixed, 3 skipped)

**Fixed**: Adding a graph edge no longer silently saves an unnamed placeholder node (previously leaving a new node untitled and clicking its edge "Save" chip could create a stray file such as `enter-a-name.md` in your vault); edges now use the same "untitled" check the node inspector already enforced.

## 2026-05-03 · Surface diet Round 4: search discoverability and builder edge persistence

**Added**: An "All" button next to node search opens global search (⇧⌘K), covering both ontology nodes and projects; a builder edge with an unsaved endpoint now shows an amber "Save" chip that creates the node and saves the connection into your vault.
**Changed**: Clicking "Local" in the `/docs` header now opens the folder picker immediately instead of leaving it hidden in a dropdown; builder onboarding copy now correctly explains that vault-to-vault edges save automatically, while an edge with an unsaved endpoint needs its "Save" chip clicked.

## 2026-05-03 · Surface diet Round 3: first impressions and navigation cleanup

**Changed**: The landing page now leads with "Open your markdown folder" as the primary action, with plainer, jargon-free copy; `/ontology/insights` panels are reordered (kind, relation types, projects, hubs, recent, unlinked nodes), unlinked nodes are now clickable, and the sub-navigation is always visible with "Tree" renamed to "Browse".

## 2026-05-03 · Surface diet Round 2: route consolidation and a more direct /docs header

**Changed**: The `/docs` page now shows the "sample vault vs your vault" choice directly in the header instead of hiding it behind a gear-icon dropdown, and that dropdown (now labeled "Vault tools") only appears in local vault mode.
**Removed**: The separate `/ontology/relations` page is gone; its relation-type distribution is now shown in full, not just the top 8, inside `/ontology/insights`.

## 2026-05-03 · Surface diet: 5 dead UI cuts

**Removed**: The full-screen "presentation mode" toggle and its F-key shortcut on the home page; the "Everyone / Planner / Engineer" audience toggle and per-document viewpoint chip on `/docs`; the `/docs` advanced menu's graph and stats views (now covered by `/topology` and `/ontology/insights`); and the Relationship Radar panel, whose suggestions never actually created vault connections.

## 2026-05-03 · Round 10: permanent removal of auth and cloud surface

**Changed**: The "Add node" button on `/ontology` now opens the builder canvas directly, where new nodes save straight into your vault instead of through a cloud modal.
**Removed**: Login and account pages (`/login`, `/signup`, `/account`, `/reset-password`), the `/settings/*` pages, the cloud-sync mode badge, and the screenshot uploader are gone; ontology-atlas is now local-first only, with categories and statuses as built-in defaults and no `.env` setup required.

## 2026-05-02 · OSS launch readiness: English-first docs and npm publish guard

**Added**: A new `docs/TROUBLESHOOTING.md` covers scaffold, MCP, build, and publish issues.
**Changed**: `npx ontology-atlas init` and the `/docs` "Create starter seed" button now write English-language starter vault files, and all project documentation is now English-first.

## 2026-05-02 · Local-first, faster first paint: Firebase code loads only on demand

**Changed**: Pages such as `/`, `/topology`, and `/docs` load faster, especially on mobile or slow connections, because Firebase code no longer downloads until you actually use a cloud/sign-in feature; behavior for cloud-mode users is unchanged.

## 2026-05-01 · UX batch: non-developer friendliness and relation cardinality (V1.5)

**Added**: The tree and builder palette now show a distinct icon per kind (project, domain, capability, element); relations can now optionally record source and target cardinality; an empty vault in local mode offers a ready-to-paste frontmatter snippet.
**Changed**: The navigation bar always shows your current mode (vault, cloud sync, or demo); builder onboarding copy and search category labels are rewritten in plainer, less developer-jargon language; saving a node in the builder now writes directly into your vault in local mode.

## 2026-05-01 · Phase 3: the AI agent partner and mission v2 cleanup

**Added**: A new MCP server (`mcp/`) lets AI agents such as Claude Code read and write your vault ontology directly, with 7 tools including `list_concepts`, `add_concept`, `add_relation`, and `patch_concept`; when a vault is active, its frontmatter automatically appears as nodes and relations in the ontology hub, and an empty vault now shows setup guidance instead of a blank page.
**Removed**: The cloud "Start analysis" AI-extraction flow and the document review queue (`/review/knowledge`) are gone; related buttons and links across document, ontology, and workspace views now point to the vault or builder instead.

## 2026-05-01 · Mode-aware CRUD and Builder rebrand

**Added**: The landing page now shows a live mini topology preview and a 3-step guide (markdown, extract, view); `/projects` lets you create a project file straight in your vault without signing in.
**Changed**: `/ontology/edit` is rebranded "Ontology Builder" with a simplified header and a wider canvas; `/ontology` gets a prominent "Open Builder" action and a footer showing node and relation counts; the "Documents" nav tab opens `/docs` when a vault is active.
**Fixed**: Saving a node on the builder canvas no longer fails with an "account not confirmed" error, and the frontmatter parser now supports multi-line YAML lists.

## 2026-07-26 · A gate nobody wires up is not a gate

**Fixed**: Two internal test suites (`pnpm test:i18n:messages`, `pnpm package:check`) had been broken on the main branch without anyone noticing because they were not wired into CI; both are fixed and now run automatically, and the MCP README's example output was corrected to match current behavior.

## 2026-07-26 · First impressions start with a shop

**Changed**: The sample vault shown to first-time visitors without their own vault is now an example online store instead of this project's own developer-facing vault; the two sample options are relabeled "This app's code" and "Example: online store," with the online store shown first. A choice you already made is kept as is.
