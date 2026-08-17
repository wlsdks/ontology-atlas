---
uid: ea43fdf2-9b52-49a8-90d3-68bb9904e860
slug: elements/native-vault-filesystem-bridge
kind: element
title: Native Vault Filesystem Bridge
domain: domains/local-vault-management
path: src-tauri/src/lib.rs
created_by: "agent:unknown"
---

Tauri WebView가 선택한 볼트 안의 파일·디렉터리를 읽고 쓰게 하는 네이티브 브리지. Unix mutation은 canonical root와 상대 부모를 no-follow 디렉터리 FD로 붙들고, 일반 파일은 umask 기반 임시 inode를 완성해 같은 부모 안에서 원자 교체하며 디렉터리는 안정된 부모에서 생성한다. 검사 뒤 부모 이름이 외부 symlink로 교체돼도 볼트 밖 side effect를 만들지 않는다. Windows reparse-point 경쟁은 아직 별도 잔여 경계다.