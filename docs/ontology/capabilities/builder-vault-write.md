---
slug: capabilities/builder-vault-write
kind: capability
title: Builder ↔ Vault md write (mode-aware)
domain: views
elements: [src/features/docs-vault-local/model/use-local-vault.ts, src/views/ontology-edit/ui/OntologyEditPage.tsx]
---

# Builder ↔ Vault md write (mode-aware)

mission v2 의 *사람 + AI agent 양립* 약속의 코드 구현. 빌더 ephemeral
노드 → mode 별 분기 저장:

- **local**: `vault.createDoc(${kind}s/${slug}, md)` — vault 디스크 직접 작성. AI agent (MCP) 가 같은 vault 에서 즉시 본다.
- **static**: 저장 차단 + 안내 toast ("내 markdown 폴더 열기" 유도).
- **write status strip**: 캔버스 진입 전에 `Source` / `Draft` / `Guard` / `Proof`
  상태를 보여준다. sample read-only vs local write, persisted node/ref count,
  unsaved draft count, relation write preflight/sync handoff, MCP/CLI proof
  packet availability 를 한눈에 확인하게
  해 builder 가 단순한 그림판이 아니라 vault write surface 임을 드러낸다. `Proof`
  cell 은 `/ontology/insights` query cockpit 으로 이어져 builder write 이후
  `relation_check`, `path`, `all_paths`, sync gate 를 graph DB-style 검증 흐름에서
  다시 확인하게 한다. 각 cell 은 `local markdown` / `canvas draft` /
  `relation guard` / `graph db proof` chip 을 함께 보여줘, 첫 화면에서
  쓰기 → 검증 → query handoff 의 폐루프가 바로 드러나게 한다. 각 cell 은
  `01`–`04` 순서와 짧은 loop action 도 함께 보여줘 source 확인 → draft 작성
  → guard 검토 → proof 실행의 순서가 help popover 없이 보인다.

frontmatter 형식:

```yaml
---
slug: capabilities/foo
kind: capability
title: Foo
---

# Foo
```

folder mapping: capability→capabilities, element→elements, domain→domains, project→projects, 그 외 kind+s.
