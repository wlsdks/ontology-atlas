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

- **local**: `vault.manifest` 가 있는 live vault 에서
  `vault.createDoc(${kind}s/${slug}, md)` — vault 디스크 직접 작성. AI agent
  (MCP) 가 같은 vault 에서 즉시 본다. 새 노드 저장, inspector write,
  relation write 는 모두 같은 live manifest 계약으로 writable 여부를
  판단해 desktop WebView route transition 중 mode label 과 write handle 이
  잠깐 어긋나도 builder write path 가 데모 토스트로 잘못 빠지지 않는다.
- **inspector write contract**: persisted vault node 의 이름은 명시적인
  `이름 저장` 버튼/Enter 로 저장한다. `domain` / `description` 리터럴 필드는
  local draft 로 입력 중 파일 쓰기를 막고 blur 또는 Enter(single-line) 에서
  frontmatter patch 로 commit 한다. 관계 배열(`domains`, `capabilities`,
  `elements`, `dependencies`, `contains`, `describes`, `relates`)은 add/remove
  action 이 곧 같은 `.md` frontmatter write 이므로 UI copy 가 이름만 저장된다고
  말하면 안 된다. 이 구분이 사람에게는 저장 타이밍을, AI agent 에게는 MCP 가
  읽는 변경 경계를 설명한다.
- **unavailable**: 저장된 desktop vault handle 이 permission-needed/error 상태면
  샘플 그래프를 보여주되 Source cell 을 `vault 접근 필요` 로 분리해, route
  restore 실패를 일반 sample read-only 와 혼동하지 않게 한다.
- **static**: 저장 차단 + 안내 toast ("내 markdown 폴더 열기" 유도).
- **write status disclosure**: `Source` / `Draft` / `Guard` / `Proof` proof rail 은
  기본 첫 화면에서 접혀 있다. 캔버스가 주 작업면이므로 큰 제목과 01–04 rail 이
  항상 세로 공간을 차지하지 않는다. 사용자가 `Write status` / `쓰기 상태` 를 열면
  sample read-only vs local write, persisted node/ref count, unsaved draft count,
  relation write preflight/sync handoff, MCP/CLI proof packet availability 를 같은
  ordered cells 로 확인한다. `Draft` cell 은 새 노드/edge 가 각자의 Save action
  전까지 메모리에만 있고 디스크에 쓰이지 않는다는 상태를 명시한다. 초안이 없을
  때는 `no memory draft`, 초안이 있을 때는 `not on disk until save` 로 보이므로
  숨은 autosave 파일이나 전역 저장 큐가 있다고 오해하지 않는다. `Proof` cell 은
  `/ontology/insights` query cockpit 으로 이어지고, builder graph proof packet 도
  복사한다. proof packet 은 먼저 `agent-brief --verify-fallbacks --json` setup gate 와
  `agent-brief --graph-db-pack` 을 실행해 local graph query surface 를 증명한다.
  선택 노드가 없으면 `workspace_brief` → `query_plan(match_nodes)` → `match_nodes` →
  `query_plan(match_edges)` → `match_edges` → `facets` / `schema` / `health`
  순서로 graph DB-style scan 을 시작한다. 선택 노드가 있으면 `node_profile`,
  incoming `blast_radius`, planned incoming/outgoing `match_edges`, `query_plan(all_paths)`,
  bounded `all_paths`, `relation_check` target/type placeholders, shell-safe CLI
  fallback, scan-to-proof checklist, sync gate 를 함께 복사해 builder write 이후
  `relation_check`, `path`, `all_paths`, health 를 같은 검증 흐름에서 다시 확인하게
  한다. 각 cell 은 `local markdown` / `canvas draft` / `relation guard` /
  `graph db + health` chip 을 유지하지만, 기본 화면에서는 캔버스가 먼저다.

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
