---
slug: elements/file-system-access-api
kind: element
title: File System Access API
domain: vault-local-first
path: src/features/docs-vault-local
relates:
  - domains/vault-local-first
---

# File System Access API

브라우저 native API — `showDirectoryPicker()` 로 사용자 폴더 선택, FileSystemDirectoryHandle
로 read/write. 우리는 IndexedDB 에 핸들 영속, focus / visibility 시 fingerprint 비교
재스캔. SSR-safe (window 가드). 미지원 브라우저는 LocalVaultPicker 가 명시적 안내.

The Source Vault first viewport treats that runtime as an ontology execution
contract instead of a plain document picker: the `Files` / `Graph` / `Agent`
strip shows local markdown as the source of truth, compiled graph counts, and
the shared graph DB proof gate. The `Agent` cell can copy the runtime graph gate
directly, so a user can prove Claude Code / Codex / terminal readiness from the
source surface before moving into Browse, Builder, or Insights. Palette groups,
search sections, empty states, and navigation labels call those markdown entries
`Source records` in a `Source tree`, reserving document language for individual
file actions and evidence rows.

The markdown editor now keeps the same local-first write contract visible while
the human edits a source record. Its save badge distinguishes clean content
(`same as disk`), unsaved draft content (`not on disk until Save`), active
writing, and the post-save confirmation (`written to disk`). That wording makes
the editor explicit about the chosen workflow: typing is a protected in-memory
buffer, while `Save` / `Cmd+S` is the intentional disk write that AI agents and
git diffs can then observe.
