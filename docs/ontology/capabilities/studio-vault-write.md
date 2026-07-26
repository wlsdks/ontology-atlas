---
slug: capabilities/studio-vault-write
kind: capability
title: 나침 무대 ↔ Vault md write (mode-aware)
domain: views
elements: [src/features/docs-vault-local/model/use-local-vault.ts, src/views/ontology-studio/lib/build-create-node.ts, src/views/ontology-studio/lib/plan-studio-commit.ts, src/views/ontology-studio/lib/resolve-write-target.ts, src/views/ontology-studio/ui/OntologyStudioPage.tsx]
---

# 나침 무대 ↔ Vault md write (mode-aware)

mission v2 의 *사람 + AI agent 양립* 약속의 코드 구현. 은퇴한 xyflow ERD 빌더
(`/ontology/edit`) 가 하던 vault 쓰기 경로는 이제 **나침 무대 (Compass Stage,
`/ontology/studio`)** 가 이어받았다. 한 노드를 게임 아이템처럼 놓고 관계
소켓을 채우면 그 채움이 곧 실제 frontmatter write 다. `OntologyStudioPage`
는 두 fill-state 를 한 라우트에서 처리한다 (mode 탭 없음): 기본 = 기존 노드를
`?node=<id>` 로 열어 부분 채움 (ENHANCE), `?mode=create` = 빈 새 노드 (CREATE).

**쓰기 대상 판정이 먼저다.** vault derive 는 노드를 두 경로로 만든다 — 자기
frontmatter `kind:` 를 가진 문서 노드와, 다른 문서의 관계 키에서 이름만 불린
파생 개념(도그푸드 실측 294 중 198). 둘 다 `evidenceIds[0]` 한 칸을 쓰는데
파생 개념의 그 값은 *자기를 인용한 남의 문서* 다. `resolveStudioWriteTarget`
가 읽기 표면과 같은 `resolveNodeDocument` 판정으로 둘을 가른다:

- `existing` — 자기 `.md` 가 있다. 그 문서의 관계 배열을 고친다.
- `missing` — 아직 자기 `.md` 가 없다. **남의 문서로 대체하지 않는다.**

`planStudioCommit` 이 그 판정을 실제 파일 조작으로 옮긴다 (`nothing` /
`consent-required` / `create-document` / `update-frontmatter`). 순수 함수라
"문서 없는 개념의 저장은 절대 frontmatter 를 고치지 않는다" 가 UI 없이 테스트로
고정된다.

`missing` 이면 저장 순간 **동의 다이얼로그**(`StudioMaterializeDialog`)가 만들
파일 경로와 종류를 밝히고 한 번 묻는다. 취소하면 어떤 파일도 만들지 않고 변경은
초안으로 남는다. 확인하면 그 개념 자신의 문서가 — 기존 인용이 이미 가리키는
경로에 — 관계를 실은 채 한 번의 쓰기로 생긴다. 사용자 디스크의 파일 생성은
요청받은 적 없는 일이라 동의 없이는 하지 않는다(신뢰 헌장).

쓰기는 data-source mode 로 분기한다:

- **local** (`mode === "local"` + `localVault.status === "loaded"` → `writable`):
  - ENHANCE 소켓 채움 → 쓰기 대상이 `existing` 이면
    `localVault.updateFrontmatter(slug, updates)` 로 focal 노드의 frontmatter
    배열 키를 디스크에 직접 갱신. `missing` 이면 동의 뒤
    `localVault.createDoc(slug, markdown)` 한 번으로 문서와 관계가 함께 앉는다. relation → 키
    매핑은 `build-studio-item` 의 `BEARING_FRONTMATTER_KEY` (is_a → `broader`
    SKOS, depends_on → `dependencies`, contains → `contains`, related_to →
    `relates`). 채운 뒤 `success` 토스트.
  - CREATE 저장 → `buildCreateNodeDoc(draft)` 가 `${kind}s/${slug}.md` 경로와
    markdown 본문을 만들고 `localVault.createDoc(slug, markdown)` 로 vault
    디스크에 새 노드를 쓴다. AI agent (MCP) 가 같은 vault 에서 즉시 본다.
    저장 전 `buildCreateNodeSlug`와 현재 graph 후보의 folder-prefixed ref를
    대조한다. 같은 결정적 경로가 이미 있으면 저장은 성공할 수 없으므로
    `기존 노드 열기`만 남기고 save를 비활성화한다. 경로가 다른 near-dup은
    soft nudge로 계속 만들기 선택권을 유지한다. hard conflict가 생기면 이미
    stage한 relation이 있어도 생성 summary와 delta preview를 숨기고 preview
    commit도 같은 save gate로 닫는다. 이름 input은 invalid/describedby로
    live conflict 경고에 연결된다. 정상 저장 예고는 relation 수만 `0가지`로
    세지 않고 `새 노드 1개 · 관계 N개`로 파일 생성과 edge를 분리해 말한다.
    저장 후 새 노드를 `?node=` 로 다시 열어 ENHANCE 로 이어가게 한다.
- **non-writable** (sample/static/read-only): 디스크 쓰기 대신 복사 가능한
  MCP command packet 을 만든다. ENHANCE 는 `buildFillPacket(...)` (자기 문서가
  없으면 그 개념을 만드는 `add_concept` 까지 담은 `buildMcpPacket`), CREATE 는
  `buildMcpPacket(draft)` — Claude Code / Codex 가 붙여넣어 같은 변경을 vault
  에 land 할 수 있는 명령. 사람에게는 저장 타이밍을, AI agent 에게는 MCP 가
  읽는 변경 경계를 같은 흐름에서 설명한다.

folder mapping: capability→capabilities, element→elements, domain→domains,
project→projects, 그 외 kind+s.

Anchored relation-edit, missing-socket picker, and overflow-list cards remain
nonmodal parts of the compass stage. Their icon close controls expose the
shared localized `close` name to assistive technology. While a relation-edit
card is open, `Escape` dismisses only that card and leaves the ENHANCE context
intact; this is an interaction contract and does not change frontmatter data.
