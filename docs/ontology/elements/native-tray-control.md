---
uid: 63a6692a-a9b0-4a93-973e-0b5c9abef6bd
slug: elements/native-tray-control
kind: element
title: Native Tray Control
display_ko: 네이티브 메뉴 막대 컨트롤
domain: domains/onboarding-and-shell
path: src-tauri/src/lib.rs
created_by: "agent:unknown"
---

A macOS menu-bar control that uses the mascot micro template to reopen the existing Atlas workbench or quit the app. It is static and state-free: no activity badge, background-service promise, close-to-tray behavior, new window, or webview tray permission.

## Evidence

- Primary implementation: `src-tauri/src/lib.rs#install_native_tray`
- Supporting implementation: `src-tauri/src/lib.rs#native_tray_labels`
