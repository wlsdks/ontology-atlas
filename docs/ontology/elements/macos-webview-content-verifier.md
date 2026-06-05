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
requires the app to be visible through the Accessibility tree. Tauri can expose
an AX application/menu tree while System Events reports zero AX windows, so the
LaunchServices dogfood gate combines this check with `--require-window`: the
CoreGraphics probe proves the on-screen workbench window, while the System Events
probe proves the same launched process is automation-observable. The probe has a
bounded timeout, so a broken AX bridge becomes a clear verification failure
instead of a hanging app check.

This is a dogfood-specific quality gate: desktop UI work can prove that the
installed app rendered the local ontology workbench before Computer Use inspects
the visible screen, and can now separately prove whether the installed app is
observable through the same macOS automation layer. It catches the failure class
where `desktop:verify-app` found a CoreGraphics window but Computer Use returned
`cgWindowNotFound`, System Events could not find the process, or the process had
no Accessibility UI tree.
