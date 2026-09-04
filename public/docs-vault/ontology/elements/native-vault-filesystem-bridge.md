---
uid: ea43fdf2-9b52-49a8-90d3-68bb9904e860
slug: elements/native-vault-filesystem-bridge
kind: element
title: Native Vault Filesystem Bridge
display_ko: 네이티브 볼트 파일시스템 브리지
domain: domains/local-vault-management
path: src-tauri/src/lib.rs
created_by: "agent:unknown"
---

Native bridge that allows the Tauri WebView to read and write files and directories within the selected vault. Unix mutations hold canonical roots and relative parent directories as no-follow directory file descriptors, complete regular files with umask-based temporary inodes for atomic replacement within the same parent, and create directories from stable parents. After inspection, even if the parent name is replaced by an external symlink, it does not create side effects outside the vault. Windows reparse-point race conditions remain a separate residual boundary.

The same bridge owns the vault watcher (`start_vault_watch`): a recursive FSEvents stream that emits `vault-changed` to the WebView when a Markdown file changes, debounced so an editor's burst of writes arrives once. The command is idempotent for an unchanged canonical root, runs on the async runtime rather than the main thread, and drops a replaced watcher on a background thread, because the app abort reports of 2026-08-28 to 2026-08-31 each followed a watcher rebuild on the main thread. A panic hook installed before the Tauri builder records thread, file, line and message to the app log and stderr, and the release profile keeps a packed dSYM beside the stripped binary so those reports can be read against symbols.

## Evidence

- Primary implementation: `src-tauri/src/lib.rs#write_vault_text_file`
- Supporting implementation: `src-tauri/src/lib.rs#read_vault_text_file`
- Focused test: `src-tauri/src/lib.rs#vault_commands_reject_symlink_escapes`
- Focused test: `src-tauri/src/lib.rs#vault_write_is_not_redirected_when_parent_is_replaced_after_validation`

## Includes

- Reading and writing vault files/directories from the Tauri WebView with symlink-safe, no-follow-directory-descriptor mutations and atomic file replacement.
- Running the recursive FSEvents vault watcher (`start_vault_watch`) that debounces and emits `vault-changed` to the WebView on the async runtime, not the main thread.
- Installing a panic hook that records thread/file/line/message to the app log so a packed dSYM can symbolicate a crash report.

## Excludes

- Windows reparse-point race conditions, an explicitly named residual boundary this bridge does not close.
- The browser File System Access API path used on the web, owned by elements/local-fs-handle.
- The macOS menu-bar tray control, a separate Tauri surface: elements/native-tray-control.
