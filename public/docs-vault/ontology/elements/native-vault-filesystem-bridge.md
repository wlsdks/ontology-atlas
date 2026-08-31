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