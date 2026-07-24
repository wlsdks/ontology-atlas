---
slug: capabilities/studio-vault-write
kind: capability
title: 나침 무대 ↔ Vault md write (mode-aware)
domain: views
elements: [src/features/docs-vault-local/model/use-local-vault.ts, src/views/ontology-studio/lib/build-create-node.ts, src/views/ontology-studio/ui/OntologyStudioPage.tsx]
---

# 나침 무대 ↔ Vault md write (mode-aware)

mission v2 의 *사람 + AI agent 양립* 약속의 코드 구현. 은퇴한 xyflow ERD 빌더
(`/ontology/edit`) 가 하던 vault 쓰기 경로는 이제 **나침 무대 (Compass Stage,
`/ontology/studio`)** 가 이어받았다. 한 노드를 게임 아이템처럼 놓고 관계
소켓을 채우면 그 채움이 곧 실제 frontmatter write 다. `OntologyStudioPage`
는 두 fill-state 를 한 라우트에서 처리한다 (mode 탭 없음): 기본 = 기존 노드를
`?node=<id>` 로 열어 부분 채움 (ENHANCE), `?mode=create` = 빈 새 노드 (CREATE).

쓰기는 data-source mode 로 분기한다:

- **local** (`mode === "local"` + `localVault.status === "loaded"` → `writable`):
  - ENHANCE 소켓 채움 → `localVault.updateFrontmatter(sourceSlug, { [key]: next })`
    로 focal 노드의 frontmatter 배열 키를 디스크에 직접 갱신. relation → 키
    매핑은 `build-studio-item` 의 `BEARING_FRONTMATTER_KEY` (is_a → `broader`
    SKOS, depends_on → `dependencies`, contains → `contains`, related_to →
    `relates`). 채운 뒤 `success` 토스트.
  - CREATE 저장 → `buildCreateNodeDoc(draft)` 가 `${kind}s/${slug}.md` 경로와
    markdown 본문을 만들고 `localVault.createDoc(slug, markdown)` 로 vault
    디스크에 새 노드를 쓴다. AI agent (MCP) 가 같은 vault 에서 즉시 본다.
    저장 후 새 노드를 `?node=` 로 다시 열어 ENHANCE 로 이어가게 한다.
- **non-writable** (sample/static/read-only): 디스크 쓰기 대신 복사 가능한
  MCP command packet 을 만든다. ENHANCE 는 `buildFillPacket(...)`, CREATE 는
  `buildMcpPacket(draft)` — Claude Code / Codex 가 붙여넣어 같은 변경을 vault
  에 land 할 수 있는 명령. 사람에게는 저장 타이밍을, AI agent 에게는 MCP 가
  읽는 변경 경계를 같은 흐름에서 설명한다.

folder mapping: capability→capabilities, element→elements, domain→domains,
project→projects, 그 외 kind+s.
