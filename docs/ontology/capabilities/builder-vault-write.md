---
slug: capabilities/builder-vault-write
kind: capability
title: Builder ↔ Vault md write (mode-aware)
domain: views
elements: [src/views/ontology-edit/ui/OntologyEditPage.tsx, src/features/docs-vault-local/model/use-local-vault.ts]
---

# Builder ↔ Vault md write (mode-aware)

P1-1 (UX-4) — mission v2 의 *사람 + AI agent 양립* 약속의 코드 구현. 빌더 ephemeral 노드 → mode 별 분기 저장:

- **local**: `vault.createDoc(${kind}s/${slug}, md)` — vault 디스크 직접 작성. AI agent (MCP) 가 같은 vault 에서 즉시 본다.
- **cloud**: 기존 `addManualKnowledgeNode` Firestore httpsCallable.
- **static**: 저장 차단 + 안내 toast (vault 또는 로그인 유도).

frontmatter 형식 (mission v2):

```yaml
---
slug: capabilities/foo
kind: capability
title: Foo
---

# Foo
```

folder mapping: capability→capabilities, element→elements, domain→domains, project→projects, 그 외 kind+s.

자세히: docs/UX-FIRST-PRINCIPLES.md §2 P1-1.
