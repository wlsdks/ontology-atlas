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

The verifier now supports `--require-webview-content` for direct executable
launches. In that mode it sets `ONTOLOGY_ATLAS_VERIFY_WEBVIEW=1`, waits for the
Tauri app to evaluate a small DOM probe, parses the
`[ontology-atlas-webview-verify]` payload, and fails closed unless the WebView
reports a `tauri://` URL, complete ready state, non-empty body text, and a
non-zero viewport.

This is a dogfood-specific quality gate: desktop UI work can prove that the
installed app rendered the local ontology workbench before Computer Use inspects
the visible screen. It catches the failure class where `desktop:verify-app`
found a CoreGraphics window but the automation screenshot was blank.
