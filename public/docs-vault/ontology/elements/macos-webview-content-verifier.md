---
slug: elements/macos-webview-content-verifier
kind: element
title: macOS WebView Content Verifier
domain: vault-local-first
relates: [capabilities/desktop-app-distribution, domains/ai-agent-partner, domains/views]
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

The structured marker set also includes the business decision questions rendered
by the `/ontology` meaning gate. The direct app launch verifier requires that
marker only when the loaded `tauri://` path is an ontology route; the default
root launch still proves the local workbench shell, navigation, agent brief copy
affordance, and reader decision lens without pretending it rendered a
route-specific meaning gate.

The same payload now requires the `readerDecisionLens` marker from the meaning
gate's planning -> marketing -> leadership -> developer -> agent reader contract.
This makes the direct macOS app verifier fail if the packaged WebView drops the
human/agent decision handoff framing that turns code evidence into ontology
service value.

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
proof before the desktop-control pass.

`--print-window-diagnostics` prints a single JSON line with the launched process
ids, matching CoreGraphics windows including capture ids, and System Events
accessibility rows. This is the handoff evidence when Computer Use returns
`cgWindowNotFound`: the log can show whether Ontology Atlas rendered a window,
whether local capture proof exists, whether System Events can see an AX tree,
and whether the remaining failure belongs to the external desktop-control
connector.

This is a dogfood-specific quality gate: desktop UI work can prove that the
installed app rendered the local ontology workbench before Computer Use inspects
the visible screen, and can now separately prove whether the installed app is
observable through the same macOS automation layer. It catches the failure class
where `desktop:verify-app` found a CoreGraphics window but local screenshot
capture failed, Computer Use returned `cgWindowNotFound`, System Events could
not find the process, or the process had no Accessibility UI tree.

`scripts/desktop-smoke.mjs` also protects the packaged static payload before the
native shell is launched. The `/ontology` route chunk contract now requires the
business ontology lens markers `business-first` and `data-business-read-order`,
so a packaged app can no longer pass smoke while dropping the domain ->
capability -> element read-order contract that the macOS browse surface and
agent handoff share. The same route chunk contract also requires
`copyBriefDescription`, so the packaged app cannot silently drop the accessible
copy affordance that tells agents the copied brief includes domain/capability
evidence plus `agent_brief`, `workspace_brief`, and `health` execution checks.

The `/ontology/insights` route chunk contract now also requires the collaborator
business extraction markers: `collaboratorBusinessExtractionChecks` plus the
three boundary / capability claim / implementation evidence questions from the
shared business ontology lens. That makes `pnpm desktop:smoke` fail before app
packaging if the insights screen drops the visible reviewer questions that keep
human meeting briefs and AI-agent `agent_brief` payloads on the same ontology
contract.
