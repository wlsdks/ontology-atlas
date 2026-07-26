---
slug: elements/macos-webview-content-verifier
kind: element
title: macOS WebView Content Verifier
domain: vault-local-first
relates: [domains/ai-agent-partner, domains/views]
---

`scripts/verify-macos-app-launch.mjs` and `src-tauri/src/lib.rs` provide the
macOS app launch proof that the packaged WebView loaded real Ontology Atlas
content, not only a live process or an empty native window.

Direct executable launches now require WebView content by default. That path
sets `ONTOLOGY_ATLAS_VERIFY_WEBVIEW=1`, waits for the Tauri app to evaluate a
small DOM probe, parses the
`[ontology-atlas-webview-verify]` payload, and fails closed unless the WebView
reports a `tauri://` URL, complete ready state, the `Ontology Atlas` title,
workbench body markers such as Source Vault / Ontology or 문서함 / 온톨로지, and a
non-zero viewport. The probe also emits structured marker booleans for the
ontology navigation entry, the source-vault navigation entry, and the agent
brief copy affordance, so a generic non-empty Tauri shell cannot satisfy the
default app verifier.

Direct executable launches can also pass `--require-webview-route=/en/topology/`.
That sets `ONTOLOGY_ATLAS_VERIFY_ROUTE`, asks the packaged Tauri WebView to
navigate to the route before the DOM probe runs, and then fails unless the
reported `tauri://` pathname matches. The topology route additionally requires a
Relief marker, so desktop UI work can prove the installed app rendered the
Relief card skeleton without relying on fragile Computer Use clicks.

For `/topology?mode=path`, the verifier now also requires the Path support
panel to expose an agent handoff marker. The WebView payload must report the
`focus-path-state` layer, MCP action `find_path`, and a CLI fallback containing
`path`, so a path-mode screen cannot pass desktop proof while hiding the next
AI-agent action behind visual graph chrome.
The same payload now records `topologyAttentionWinner`, and Path mode must name
`focus-path-state` as the current winner. That makes the 14-inch Relief proof
explicit about whether the map, support panel, path state, focus state, or
blocking composer owns attention, instead of inferring the hierarchy from
separate overlap counters.
The verifier now applies the same attention-winner contract to Add Concept and
selected-node focus: an open composer must report `blocking-composer`, and a
selected node inspector must report `focus-state`. A WebView proof can therefore
fail when the screen visually looks populated but the active interaction layer
is ambiguous.
During Add Concept verification, the probe also dispatches the topology shortcut
entry points (`⌘K`, `⇧⌘K`, `?`, and `D`) after the composer opens and requires
`topologyBlockingComposerOverlayContract: exclusive-blocking-composer`. That
fails the installed app proof if search, global search, shortcuts, or the docs
drawer can stack above the blocking edit surface.
The same Add Concept proof requires the Relief support panel to be suppressed
while the blocking composer is open. The composer state should not push the
overview panel below the 14-inch viewport or leave a clipped support rail behind
the modal task.
When `--webview-evidence` is provided, the saved JSON now includes a compact
`composerBlockingProof` object beside the raw payload. It names the current
route, attention winner, backdrop dim alpha, map demotion state, transient
surface count, panel bounds, and the agent next action so a human or MCP/CLI
agent can read the installed-app Add Concept proof without reverse-engineering
DOM marker names.

For selected relation inspection on wider topology viewports, the same WebView
payload now requires `topologyAttentionWinner: active-relation-inspector` and
the selected relation card must expose the `solid-active-inspector-over-map`
elevation contract. It also checks the compact inspector width and proof-band
density so the card stays in the tokenized right rail instead of covering the
map, left support panel, minimap, or relation label. That keeps the active
relation fact inspector visually separated from the map layer without relying
on blurred glass styling, and gives the installed app verifier a deterministic
marker for the relation fact -> evidence -> gate -> action handoff surface.
When the selected relation label exposes the root
`label-level-mcp-cli-fallback` contract, saved WebView evidence also includes
`relationLabelHandoffProof`. That proof summarizes the label gate, primary MCP
action, CLI fallback, fact route, quality, and evidence from both the visible
label and the skeleton-card aggregate, so the installed-app artifact can prove
the relation label is actionable without requiring the next agent to inspect
raw DOM marker names.

Topology verification is isolated from the user's persisted vault. The
`--webview-fixture-vault=PATH` option is available only for direct executable
launches; Tauri creates the verifier window with an incognito data store and
bootstraps that store's current-vault IndexedDB entry with the resolved fixture
path. The product's normal persistence and database are neither read nor
deleted. Repository scripts pin this input to `docs/ontology`, so a stored
personal or test vault cannot silently change relation-inspection evidence.

The isolated fixture also marks the guided tour skipped: Computer Use found
that a first-run tour could compete with the selected-relation inspector even
after the graph input was deterministic. The payload records the exact fixture
path and fails when the tour is visible. For the current canvas-v2 map, the
probe dispatches a verification-only selection event that enters the existing
`onSelectEdge` path and then requires the resulting relation dialog semantics,
endpoints, type, sentence, bounds, and evidence. Quitting the verifier and
opening the app normally must still restore the user's previous vault.

Drag verification also proves the performance contract for topology relation
chrome: card connectors reuse the card DOM index, relation labels build their
query index once per frame, and connector geometry reports
`frame-local-card-rect-cache` read/hit accounting. This keeps drag and relation
inspection evidence tied to cache reuse instead of repeated layout reads.

Selected node inspector verification has its own path:
`--verify-topology-node-popover`. It expands the selected node popover without
switching into selected-relation inspection, then requires the body/footer
scroll contract, readable first relation row, anchored footer, and visible
MCP/CLI action rail. It also checks that selected-focus camera safe targets
carry the `selected-inspector-safe-reserve` right-reserve contract, so the
selected node stays in the readable map area instead of drifting under the
right inspector. When `--webview-evidence` is also present, the saved JSON can
include `nodePopoverExpandedProof`, a compact proof that the installed WebView
preserved the same selected-node handoff layout that the phone browser viewport
tests measure. The node relation row must also expose the
`fact-evidence-gate-action-payload` grammar contract: visible chips separate
fact, evidence, localized gate, MCP action shorthand, and JSON payload, while
the marker payload keeps the full `relation_check` / `explain_relation`
operation for agent handoff.

The DMG install smoke now reuses the same app launch verifier after copying the
mounted app bundle to a temporary install directory, but it opens the copied app
through LaunchServices and requires a visible Ontology Atlas window plus
Accessibility text. That makes the direct website-download path fail if the
copied app merely starts a background process, exposes the wrong owner window,
or relies on a stale running app instead of the newly installed copy.

The launch verifier now takes a per-app lock before any `--kill-existing`
cleanup. That prevents two local `desktop:verify-app` commands from racing each
other, where one verifier terminates the other's app process and reports a false
early-exit failure. The lock is keyed by the resolved `.app` path and released
after the launch check completes.

`--kill-existing` also clears stale macOS `.app` copies that use the same
`Contents/MacOS/ontology-atlas` executable name, not only the exact bundle path
under test. That keeps an installed `/Applications/Ontology Atlas.app` process
from sharing the same bundle id during local dogfood, where LaunchServices or
Computer Use may otherwise attach to the stale installed copy instead of the
freshly built bundle.

For `/ontology/insights`, the structured payload follows the current
maintenance-board contract instead of the retired reader-persona meaning gate.
The route must expose `data-insights-surface="maintenance-board"` and
`data-insights-question-model="one-tab-one-question"`, exactly five tabs,
exactly one selected tab, its visible `tabpanel`, and the tab-query agent
handoff row. This proves that the installed app rendered the same one-question
maintenance workflow a human sees and that an agent can continue from its
active query.

The June `businessDecisionQuestions` and `readerDecisionLens` probes were
removed when the reader-persona system and its old insights cockpit were
retired. Requiring those markers again would make the verifier prefer obsolete
DOM over the shipped five-tab board and false-fail a healthy current app.

The verifier also supports `--require-accessibility-window` for LaunchServices
runs. That check starts System Events, queries the launched process ids, and
requires at least one Accessibility window. Tauri can expose an AX
application/menu tree while System Events reports zero AX windows; that state now
fails the LaunchServices dogfood gate instead of being counted as a visible
automation target. The CoreGraphics `--require-window` probe still proves the
on-screen workbench window, while the System Events probe separately proves the
same launched process is reachable as a window through macOS automation. The
probe has a bounded timeout, so a broken AX bridge becomes a clear verification
failure instead of a hanging app check.
That fast probe reads only PID, frontmost state, and window count. It does not
ask System Events to count every UI element in the WebView: that traversal was
observed to exceed the three-second bound even while Computer Use could read the
same window. Content proof remains the responsibility of the separate bounded
Swift AX text probe. This separation keeps a real permission or missing-window
failure fail-closed without turning a large but healthy WebView tree into a
false automation blocker.
Optional screenshot evidence also tolerates one transient macOS automation
miss without weakening that boundary. Foreground activation and the fast
window probe run together for at most two attempts; a second success records
`attempts=2` and `recovered=true`. If both attempts fail, the result remains
unconfirmed and keeps every `attemptErrors` row for the agent handoff. The
per-attempt timeouts are unchanged, so a persistent Accessibility permission,
missing process, or missing-window failure still closes the proof.
Within each attempt, the post-activation AX row is the final-state truth.
`frontmost=true` passes even if the activation AppleScript itself times out;
that mismatch remains visible as `commandConfirmed=false` plus a warning.
Conversely, an activation command return cannot pass when AX does not confirm
frontmost. This keeps the proof state-based without hiding a real automation
or missing-window failure.

LaunchServices runs can now add repeated `--require-accessibility-text=...`
checks. The verifier walks the launched process Accessibility tree with a
bounded Swift AX probe and fails unless every requested phrase is present. That gives local
macOS dogfood a command-line proof for screen content such as `개념 지도` and
`AI 에이전트 그래프 검증`, closing the gap where `--open-app` could prove a window
and screenshot but not the ontology/agent handoff copy rendered in that
installed app session.

For installed-app dogfooding, `--require-capturable-window` now sits between the
CoreGraphics check and the final Computer Use observation. It takes the matching
CoreGraphics window ids and asks `screencapture -l` to capture at least one of
them; if the window-id capture fails, it falls back to the window bounds region
on the current desktop. This keeps window-id capture quirks from failing an app
that Computer Use can actually observe, while still recording local screenshot
proof before the desktop-control pass. When a run needs durable visual evidence
for review, `--window-screenshot=/tmp/ontology-atlas-window.png` preserves the
first successful matching capture instead of deleting the temporary proof image,
so the agent can inspect the same artifact after the command returns.

`--print-window-diagnostics` prints a single JSON line with the launched process
ids, matching CoreGraphics windows including capture ids plus alpha, sharing
state, store type, and memory usage, and System Events accessibility rows. This
is the handoff evidence when Computer Use returns `cgWindowNotFound`: the log
can show whether Ontology Atlas rendered a window, whether macOS marks that
window as shareable and opaque, whether local capture proof exists, whether
System Events can see an AX tree, and whether the remaining failure belongs to
the external desktop-control connector.

When `--require-capturable-window` fails, `--print-window-diagnostics` now emits
that same JSON line before exiting and includes `captureRows` with the window
sharing state, alpha, window-id/bounds-region capture method, stderr, byte
count, and preserved artifact path when available. That preserves the important
mismatch case where CoreGraphics can see an opaque, shareable Ontology Atlas
window but `screencapture` or the desktop control connector cannot capture it.

When optional visual evidence is attempted but not required, the saved
diagnostics now classify the combined blocker instead of only reporting a vague
foreground failure. If the app launched, WebView proof passed, System Events
could not confirm frontmost Accessibility state, and every screenshot path
failed or returned a blank capture, the blocker is recorded as
`macos-automation-and-screen-capture-blocked`. That tells the next agent the
installed app proof is still valid, while the missing PNG belongs to macOS
automation / Screen Recording / Accessibility permissions rather than the
ontology workbench route.
The same diagnostics payload now includes a blocker summary and ordered
`nextActions`, so an MCP-backed agent or a CLI-only follow-up can grant
Accessibility / Screen Recording permissions or rely on the saved WebView JSON
as deterministic route proof until PNG capture is available.
Those same blocker summary and `nextActions` are also printed in the verifier
log before the low-level window diagnostics JSON, so the handoff survives CI or
terminal-only review without requiring the next agent to open the diagnostics
file first.
When `--webview-evidence` is present on the same direct launch, the visual
evidence handoff also records and prints the resolved WebView route proof path.
That keeps the fallback proof artifact adjacent to the missing-PNG blocker,
instead of making the next agent correlate separate log lines by hand.

The verifier also supports `--require-frontmost` as a narrow foreground-app
check. It uses the same System Events process rows and fails when LaunchServices
opens a visible Ontology Atlas window but macOS does not mark that process as
frontmost, which is the state most likely to confuse Computer Use handoff.

This is a dogfood-specific quality gate: desktop UI work can prove that the
installed app rendered the local ontology workbench before Computer Use inspects
the visible screen, and can now separately prove whether the installed app is
observable through the same macOS automation layer. It catches the failure class
where `desktop:verify-app` found a CoreGraphics window but local screenshot
capture failed, Computer Use returned `cgWindowNotFound`, System Events could
not find the process, or the process had no Accessibility UI tree.

`scripts/desktop-smoke.mjs` protects the packaged static payload before the
native shell is launched. Its 2026-07-27 contract follows the current routes:
Download install/vault/agent handoff; Docs source markers; `/ontology` ->
Topology and `/ontology/edit` -> Workshop redirects; Topology canvas-v2/focus/
path markers; and the Insights maintenance-board markers above. The retired
tree browser, ERD builder, reader-persona questions, and query cockpit are not
valid package proof.

The evaluator distinguishes a missing build artifact from current-source
contract drift. Missing root/route/assets/offline docs still advise
`pnpm build`; a title, copy, or chunk mismatch tells the maintainer to compare
the failing contract with current route source instead of repeating a build
that already succeeded. A fresh build plus `pnpm desktop:smoke` passes this
contract, while `desktop:verify-app` and Computer Use remain the separate
runtime and visual proof layers. The closing UX-041 run exercised that
separation: the direct verifier proved the foreground 1512x917 current Insights
WebView, and Codex Computer Use independently read five tabs, one selected tab,
the active maintenance panel, repair queue, and agent handoff from the
installed app accessibility tree.
