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

The verifier supports `--require-webview-content` for direct executable
launches. In that mode it sets `ONTOLOGY_ATLAS_VERIFY_WEBVIEW=1`, waits for the
Tauri app to evaluate a small DOM probe, parses the
`[ontology-atlas-webview-verify]` payload, and fails closed unless the WebView
reports a `tauri://` URL, complete ready state, non-empty body text, and a
non-zero viewport.

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

`--print-window-diagnostics` prints a single JSON line with the launched process
ids, matching CoreGraphics windows, and System Events accessibility rows. This
is the handoff evidence when Computer Use returns `cgWindowNotFound`: the log can
show whether Ontology Atlas really rendered a window, whether System Events can
see an AX tree, and whether the remaining failure belongs to the external
desktop-control connector.

This is a dogfood-specific quality gate: desktop UI work can prove that the
installed app rendered the local ontology workbench before Computer Use inspects
the visible screen, and can now separately prove whether the installed app is
observable through the same macOS automation layer. It catches the failure class
where `desktop:verify-app` found a CoreGraphics window but Computer Use returned
`cgWindowNotFound`, System Events could not find the process, or the process had
no Accessibility UI tree.
