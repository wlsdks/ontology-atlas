---
slug: domains/vault-local-first
kind: domain
title: Vault — Local-First
display_ko: 내 문서 폴더
display_en: Local Folder
capabilities: [desktop-app-distribution, vault-live-updates, vault-migrator, vault-validator]
elements: [elements/macos-webview-content-verifier, file-system-access-api, src/entities/docs-vault, src/entities/local-fs-handle, src/features/docs-vault-local, src/features/docs-vault-local/model/agent-activity-status.ts, src/shared/lib/idb-kv.ts, src/views/docs-vault/ui/DocsVaultPage.tsx, src/widgets/docs-vault/ui/DocsVaultEditor.tsx]
relates: [domains/mode-aware-adapters, domains/ontology-core]
canvasPosition: { x: 352, y: 2304 }
---

# Vault — Local-First

사용자 디스크 폴더를 진실원으로. File System Access API + IndexedDB 기반 핸들 영속.
focus / visibility 시 fingerprint 비교로 재스캔 short-circuit. R14 부터는 visible
인 동안 5s polling 으로 *focus 안 해도* 자동 반영 (`vault-live-updates`).

자세한 원칙: `.claude/rules/local-first.md`. 사용자 surface: `docs/FEATURES.md`.

## 2026-07-26 entry contract

Browser capability is based on a callable `showDirectoryPicker`, not merely a
property name present on `window`. Unsupported runtimes are explained before an
open attempt and route to the installed macOS app. Picker cancellation is a
normal no-write exit across DOMException realms, ordinary `Error` values, and
Tauri string rejections; it does not become a red error state.
