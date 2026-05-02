# Loop principles — 20분 1회 자동 개선

이 파일은 20분마다 1회 자동 실행되는 loop 의 단일 진실원이다. 매 iteration
이 파일 전체를 읽고, "Iteration protocol" 섹션에 따라 **최대 9 개 atomic
개선을 라운드로빈으로 빠르게 수행한 뒤** 멈춘다 (다음 wakeup 까지 대기).

## 불변 규칙 (매 iteration 절대 위반 금지)

- `pnpm test:run` 깨지면 즉시 revert. green 일 때만 commit.
- `pnpm exec tsc --noEmit` clean 이어야 한다.
- `pnpm lint` errors 0 이어야 한다 (warnings 는 사전 존재 — 새로 추가 금지).
- `pnpm build` + `pnpm bundle:check` 성공해야 한다.
- 디자인 헌장 (`@.claude/rules/design.md`) 위반 0 — 보라/핑크 그라디언트, glassmorphism,
  glow pulse, neon, scale hover, 둘 이상 채색 시스템 등 절대 금지.
- mission v2 정합 — vault frontmatter 가 그래프. 백엔드 / 인증 surface 부활 금지.
- 한 iteration 이 한 atomic. chain 금지 — 다음 atomic 까지 가지 않음.

## 9 원칙 (매 iteration 에 모두 적용)

1. **1 원칙 사고로 기능 분해** — *정말 필요한가?* 다른 방식으로 같은 결과를 더
   단순하게 낼 수 있나? 분해 후 "이건 없어도 됨" 결론이면 그 자체가 한 atomic.

2. **불필요하면 제거** — 정말 필요하지 않은 기능은 sub-agent 들과 간단한 회의를
   진행하고 제거. (Agent 도 안 호출할 정도로 명백하면 그냥 잘라낸다.)

3. **사용성 = vault** — 사용자는 본인 markdown 폴더 (local-first) 만으로 모든
   기능이 잘 동작해야 한다. 페이지만 제공한다는 mission. 매 iteration 직접
   ontology 설계 시나리오를 머릿속에 walk-through 하고 발견된 마찰을 우선순위.

4. **어려움 → 쉽게** — 설계 / 사용 중 발견된 어려움은 그 자리에서 더 쉬운 방법
   고민하고 적용. "사용자가 이 단계에서 헤맬까?" 가 yes 이면 그게 다음 atomic.

5. **창의 OK** — 다방면 접근 환영. 표준 패턴 외에도 한 surface 만의 unique
   해법이라도 사용자 가치가 크면 채택.

6. **UI 핵심** — 매 iteration 한 surface 의 디자인 1 개 더 예쁘게. (디자인 헌장
   안 — 단일 인디고 + 무채색 + 모션 절제 + scale hover 0.) 토스 / 애플 같은
   감성 — 깔끔, 절제, 적절한 여백, 마이크로 인터랙션.

7. **모든 페이지 순회** — 한 페이지 끝나면 다음. 라운드 로빈으로 17 user-facing
   route 전부 돈다. surface 목록 (Iteration protocol 섹션 참조).

8. **오류 0** — 사용자 vault 흐름이 절대 깨지면 안 된다. 특히 폴더 선택, 저장,
   읽기, 검색 — local 모드에서 reproducible 하게 동작. 페이지만 제공한다는
   mission 준수.

9. **성능 = 안티패턴 0** — 렉 없는 최적화. 큰 vault (200+ 노드) 도 견뎌야 한다.
   `useEffect` deps 누락, `useMemo` deps 과잉, 매 render 새 객체 생성, O(n²)
   같은 안티패턴 0. Sigma forceAtlas2 / xyflow / cmdk 같은 무거운 라이브러리는
   특히 신중.

## Iteration protocol

매 iteration 최대 9 개 atomic. 라운드로빈으로 surface 를 한 번씩 훑되, 한
surface 에서 즉시 개선할 후보가 없으면 다음으로 skip. 끝나면 다음 cron fire
까지 대기 (자동 chain 금지).

### 1) 다음 surface 결정

"Progress log" 마지막 entry 의 surface 를 보고 round-robin 다음 surface 선택.
순서:

1. `/` (landing / ontology hub)
2. `/topology`
3. `/docs`
4. `/ontology`
5. `/ontology/edit`
6. `/ontology/insights`
7. `/ontology/relations`
8. `/projects`
9. `/project/[slug]` (대표 fixture: `oh-my-ontology`)
10. `/project/[slug]/edit`
11. mcp/ (MCP 서버 자체)
12. global chrome (OperationsNav / BottomTabBar / GlobalSearch / SearchPalette)
13. shared/ui primitives (Button, Tooltip, Card, …)
14. features/docs-vault-local (vault picker / scaffold)
15. design tokens (`app/globals.css` `@theme`)
16. messages/{en,ko}.json (i18n 정합)
17. docs/ontology/ (dogfood vault — 자기 ontology 갱신)

Progress log 비어있으면 1) 부터 시작. 마지막 entry 가 17 이면 1) 로 wrap.

### 2) 9 원칙 적용 — 한 surface 정밀 분석

- **1 원칙 분해** — 이 surface 의 핵심 사용자 가치는? 그것을 가장 단순한 형태로
  표현하면? 현 구현이 더 복잡하면 단순화 후보.
- **사용성 마찰** — 사용자가 이 페이지에서 헤맬 1순위 지점.
- **UI 예쁨** — 디자인 헌장 안에서 더 예쁘게 만들 1 개. 여백 / 타이포 위계 /
  보더 / 모션.
- **성능** — 안티패턴 1 개. 렌더링 / deps / 라이브러리 호출.

### 3) 가장 임팩트 있는 1 개 만 atomic 으로 수정

후보 4 개 중 *가장 임팩트 큰 1 개* 만 그 iteration 에서 고친다. 나머지는 메모만
하고 다음 iteration / round-robin 으로 미룬다.

### 4) 검증

- `pnpm exec tsc --noEmit`
- `pnpm test:run`
- `pnpm lint`
- 변경이 페이지 시각이나 라우팅에 영향 → `pnpm build`
- 변경이 import 그래프에 영향 → `pnpm bundle:check`
- 변경이 시각 / 인터랙션 → 가능하면 Playwright 1 surface 확인 (시간 허용 시)

### 5) Commit

- conventional prefix (`feat:` / `fix:` / `refactor:` / `chore:` / `style:` / `perf:`)
- 본문은 *왜* 를 적는다 (한국어 또는 영어 OK).
- 작은 atomic 은 main 직접 push 또는 quick PR 후 immediate `--admin` merge.

### 6) Progress log 갱신

이 파일의 "Progress log" 맨 위에 1 줄 append:

```
[YYYY-MM-DD HH:MM] <surface> — <한 줄 변경 요약> (PR #N or commit hash)
```

### 7) 다음 surface 로 진행

이번 iteration 에서 9 개 atomic 을 채우거나, round-robin 한 바퀴를 돌았는데
더 고칠 후보가 없으면 멈춘다. 한 surface 에서 후보가 없으면 다음 surface 로
즉시 skip. 매 atomic 사이엔 검증 (1~5단계) 와 progress log append 를 반복.

iteration 종료 후 다음 cron fire (20m 후) 까지 대기. 자동 chain 금지.

## Progress log (newest on top)

<!-- 매 atomic 1 줄씩 append. 비어있으면 1) `/` surface 부터 시작. -->

[2026-05-03 02:43] shared/lib — account-scope.ts 영구 삭제 (caller 0, commit b61d338)
[2026-05-03 02:42] app/project/new — ProjectNewClientPage dead account query 정리 (commit 6128162)
[2026-05-03 02:41] views/project-selector — 사용 안 하는 ACCOUNT_QUERY_KEY import 제거 (commit e08188d)
[2026-05-03 02:40] widgets/workspace-strip + ontology-overview — useOntologyInsight() arg 정리 (commit b1d7092)
[2026-05-03 02:39] 4 surface ACCOUNT_QUERY_KEY ternary 일괄 정리 (OntologyEdit/View/ProjectOntologyOverview/DashboardOntologySummary, commit 67a445c)
[2026-05-03 02:38] `/project/[slug]` — Breadcrumb + docs link 의 ?account= 분기 제거 (commit 6c7e9bc)
[2026-05-03 02:37] entities/project — getTopologyProjectHref dead accountId/projectId 인자 제거 (commit 97361e9)
[2026-05-03 02:36] entities/project — getProjectDetailHref/Url dead accountId/projectId 인자 제거 (commit f9adccb)
[2026-05-03 02:35] global chrome — MountedGlobalSearch dead 'accountId' + legacy 'returnTo' prop 제거 (commit 1de7df4)
[2026-05-03 02:21] messages — modeBadge.cloud{Label,AriaLabel,Tooltip} orphan keys 제거 (commit ab808bf)
[2026-05-03 02:20] AGENTS/README — dogfood 노드 카운트 21→18 갱신 (commit 8bdd60b)
[2026-05-03 02:19] docs/ontology — vault README capability 카운트 9→6 (commit 47ee2be)
[2026-05-03 02:18] docs/ontology — R10 후 사라진 capability 3개 (tbox-versioning, v1-1-qualifiers-rank, v1-5-cardinality) 정리 (commit 862fff6 + project.md update)
[2026-05-03 02:17] entities/knowledge-graph — KnowledgeEdgeType 주석 stale Firestore 컬렉션 ref 정리 (commit 862fff6)
[2026-05-03 02:16] `/projects` — ontologyCountBySlug → module-scope EMPTY const (perf, commit bfc9a8f)
[2026-05-03 02:15] messages — nav.search + nav.shortcuts orphan keys 제거 (commit d86ff3e)
[2026-05-03 02:14] `/project/[slug]/edit` — ProjectEditClientPage dead account query plumbing 제거 (commit b9eafd3)
[2026-05-03 02:02] app/[locale]/page.tsx — stale '?account=' 주석 정리 (commit fafb343)
[2026-05-03 02:01] docs/ontology — vault README 도메인 카운트 8→6 갱신 (commit 510eb03)
[2026-05-03 02:00] global chrome — OperationsNav dead 'rightSlot' prop 제거 (commit 87e99e8)
[2026-05-03 01:59] mcp/ — query DSL equality 대소문자 무시 (Panel E T1-2) (commit b659344)
[2026-05-03 01:58] `/project/[slug]` — dead 'accountId ?? project.accountId' fallback 사슬 제거 (commit beb1bb0)
[2026-05-03 01:57] `/ontology/edit` — forceAtlas2 iterations vault 크기에 따라 graceful degrade (commit f3db24a)
[2026-05-03 01:56] `/docs` — tagCounts useMemo, palette 가 매 render 새 array 받지 않도록 (commit fcf0da3)
[2026-05-03 01:43] global chrome — MountedGlobalSearch dead account query 분기 + ACCOUNT_QUERY_KEY import 제거 (commit 60d5dfc)
[2026-05-03 01:43] mcp/ — get_concept missing slug 시 절대 경로 leak 차단 (commit b020123)
[2026-05-03 01:42] `/project/[slug]` — ProjectDetail empty-state accountId 분기 + dead 'projects list' fallback 제거 (commit caf3ca3)
[2026-05-03 01:41] `/ontology/edit` — export accountId 직접 'unscoped' 인라인 (commit 05da736)
[2026-05-03 01:40] `/ontology/insights` + `/ontology/relations` — useOntologyInsight() arg + dead ternary 정리 (commit 7331b55)
[2026-05-03 01:39] `/ontology` — useOntologyInsight() arg 제거 (commit 543e45f)
[2026-05-03 01:38] `/topology` — SigmaTopology dead useMemo 제거, module-scope EMPTY_ONTOLOGY_COUNTS 로 (commit b327d64)
[2026-05-03 01:33] `/` (landing) — StaggeredFadeIn HTML 무효 wrapper 제거, list semantics 회복 (commit 820927d)
