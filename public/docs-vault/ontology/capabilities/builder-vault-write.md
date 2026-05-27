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
