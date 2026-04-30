# 연속 개선 루프 지침서

> 이 문서는 20분마다 발화되는 자동 개선 루프가 참조하는 단일 진실원이다.
> 루프 에이전트는 매 사이클 시작에 이 문서를 읽고, 여기 적힌 체크리스트·
> 우선순위·검증 프로토콜에 따라 작업한다.

---

## 1. 이번 루프의 절대 원칙

1. **기능이 먼저다.** 시각 폴리싱보다 "기능이 정확히 동작하는가"가 우선.
2. **기획·데이터 모델이 탄탄해야 한다.** 새 기능 추가 전에 아래 순서를 지킨다.
   (a) 사용자 유스케이스 정의 → (b) 필요한 도메인·Firestore 컬렉션·필드
   계약 정의 → (c) 공개/비공개 경계·읽기 권한 설계 → (d) UI 구현. 반대로
   돌리면 안 된다. 런타임에 "스키마가 비어있는데 UI는 렌더하는" 어색한
   조합은 허용하지 않는다.
3. **사용자 여정 전체가 끊김 없어야 한다.** 시작 → 로그인 → 공간 선택 →
   문서 등록 → 문서 분해 → 토폴로지 보기 → 노드 드래그 → 상세 → 뒤로가기까지
   한 번이라도 "이게 뭐지?" "어디로 갔지?" 하면 안 된다.
4. **데스크탑 웹이 1순위.** 모바일은 *깨지지만 않으면* 충분. 모바일 전용
   최적화·미세 레이아웃은 대기 (T-05 등 모바일 전담 티켓 낮은 우선순위).
5. **토폴로지는 수백~수천 노드에서도 부드러워야 한다.** 드래그·pan·zoom 어느
   순간도 체감 프레임 드롭 금지. 이미 Phase 1~A2에서 3000 노드 far 모드
   120fps / close 모드 8fps까지 왔지만 close도 30fps 이상을 목표로 계속 개선.
6. **뒤로가기(Browser back)는 반드시 제대로 동작한다.** 선택된 프로젝트 상태,
   공간 스코프, 추천 경로 활성 등 URL state 변화 후 뒤로가기로 이전 상태 복귀가
   당연해야 한다.
7. **용어는 사용자 언어로.** `docs/rules/naming.md`의 용어 딕셔너리를 기준으로.
   "큐레이션"처럼 영어 번역어 잔재 보이면 즉시 수정.
8. **기능 설명은 맥락에 맞게.** 설명 문구가 뜬금없거나, 빈 상태 카피가 "설명이
   여기에 표시됩니다" 같은 placeholder만 있으면 개선.
9. **안전하게 완료되지 못할 범위의 작업은 시작하지 않는다.** 루프 1회는 20분.
   한 사이클에 커밋·push까지 완결되지 못할 작업은 "다음 사이클 계획"으로
   쪼갠다.

---

## 2. 사용자 여정 (UseCase)

공개 제품 + admin 기능을 포괄하는 여정. 매 루프 이 중 **한 구간**을 선택해서
집중적으로 점검·개선한다.

### A. 공개 방문자 여정
A1. 공유 링크(예: `/project/aslan-maps/`)로 진입 — 상세가 즉시 읽힘
A2. 루트(`/`) 진입 — landing이 제품 성격을 10초 안에 설명
A3. 데모 로그인 버튼 → 데모 공간 프로젝트 목록 → 프로젝트 클릭 → 상세
A4. 토폴로지 보기 → 노드 드래그 → 연결된 프로젝트 드로어 → 뒤로가기
A5. 상세에서 Cmd+K 검색 팔레트 → 다른 프로젝트로 점프 → 뒤로가기

### B. 사용자(로그인 후 자기 공간) 여정
B1. `/signup` → 계정 생성 → 공간 자동 생성 → 빈 토폴로지 안내
B2. **문서(md) 등록 → 문서가 노드로 쪼개짐 → 연계 → 토폴로지 완성 → 표시**
    (이것이 제품의 핵심 약속. 지금 실제 어디까지 구현돼있는지 매 루프 확인)
B3. 공간 이름 변경, 비밀번호 재설정, 로그아웃

### C. 관리자 여정
C1. `/admin/` 로그인 → 대시보드 → "공개 화면 미리보기" 새 탭 → 비교
C2. 프로젝트 편집 → 저장 → 공개 화면에 반영 확인
C3. 카테고리/상태 편집 → 사용 중인 프로젝트 영향 고지

---

## 3. 우선순위 작업 영역

루프가 매 사이클 **하나만** 선택해 처리한다. 각 영역은 "안전한 단일 커밋"
단위로 나뉘어 있다.

**각 사이클은 아래 티켓 큐에서 1건을 꺼내 끝까지 완료한다.** 위에서부터 순서대로
시도하되, 현재 브랜치 상태·시간 예산에 맞으면 골라 진행. "사소한 카피 교체"
같은 10줄짜리 변경은 그 자체로 사이클이 되지 못한다 — 반드시 아래 티켓 중
하나로 격상해 스코프를 묶어 처리한다.

### 🔴 Critical — 발견 즉시 (상태가 바뀌면 최상단)
*현재 없음. 루프가 audit 과정에서 발견하면 이곳에 추가.*

### 🎫 Backlog (우선순위 순)

**T-05 RegionNavigator 모바일 재점검** *(보류 — 원칙 §1.4 모바일 후순위)*

### 🟢 Long-term (여러 사이클에 걸쳐)
- 문서 파이프라인 **실제 구현** (T-04 진단 이후에 단계적 착수)
- 토폴로지 close 모드 30fps — **T-03 실패 확인**(2026-04-20). 단순 CSS
  `contain: layout paint style` + `will-change: transform` 을 드래그 중에만
  거는 접근은 1000 노드에서 drag FPS를 ~30%p 떨어뜨렸다(A/B 측정). 이유:
  attribute flip 시 수백 노드에 동시에 style recalc + 컴포지터 레이어 승격
  비용이 발생. 대안은 Web Worker tick 배치(이미 구현) · react-force-graph
  교체 · React Flow 자체 canvas/GPU 렌더 모드 전환 등 **구조 수준 변경**.
- knowledge subsystem v2 public projection
- **데이터 모델·스키마 정합성 감사** (원칙 §1.2 기반). 2차 슬라이스까지 완료
  (2026-04-20 T-12, T-12b): `scripts/audit-data-model.mjs` + vitest 가
  DATA-MODEL.md ↔ firestore.rules 최상위 컬렉션과 DATA-MODEL.md §5 ↔
  storage.rules 최상위 경로를 모두 잠근다. 후속: 필드 수준 비교(entities
  types ↔ DATA-MODEL 필드 표), nested subcollection 권한 검증.
- **유스케이스 → 스키마 → UI** 역방향 점검. 각 핵심 여정(B2 문서 → 노드 파이프라인
  등)에 필요한 컬렉션·read 권한·인덱스가 지금 있는지 매핑.

### 티켓 처리 원칙
1. **한 사이클 = 한 티켓 완료**. 완료 못 하면 "진행 중"으로 큐 맨 위에 남기고 커밋 생략.
2. **완료 조건**: 변경 반영 + tsc·test·lint·build 전부 통과 + 관련 e2e 또는 MCP 체크 1건 이상.
3. 카피/placeholder 교체처럼 10줄짜리 변경은 티켓에 묶여 있어야 한다. 단독 진행 금지.
4. 티켓 처리 후 여기서 해당 블록을 삭제하고 §9 로그에 커밋 해시와 함께 기록.
5. 티켓 없는 "발견"은 Critical로 승격하거나 이곳 맨 아래에 새 티켓으로 추가.

---

## 4. 매 사이클 표준 체크리스트

```
□ git status clean, 현재 main 또는 작업 브랜치 tip
□ origin과 sync (main fetch)
□ 이 문서의 §3 우선순위 리스트에서 작업 1개 선택 (Critical 없으면 High)
□ 새 브랜치 파서 작업 (feature/loop-yyyyMMdd-HHmm-<slug>)
□ 변경
□ pnpm exec tsc --noEmit → clean
□ pnpm test:run → pass
□ pnpm lint → clean (pre-existing 경고도 0이어야)
□ pnpm build → 성공 (static export 54+ 라우트)
□ 관련 Playwright e2e 실행
□ Playwright MCP로 직접 브라우저 열어 핵심 여정 검증
□ 커밋 (한국어 메시지)
□ main에 fast-forward merge
□ origin main push
□ 로컬 feature 브랜치 삭제
□ 이 문서에 "최근 작업 로그" 항목 추가
```

---

## 5. Playwright MCP 검증 프로토콜

**모든 개선 사이클은 실제 브라우저에서 확인한다.** 빌드·테스트만으로는
사용자 체감을 잡을 수 없다.

### 5-1. 기본 세트 (매 사이클 필수)
- `http://127.0.0.1:3100/` — landing 10초 안에 "제품이 무엇"인지 파악 가능?
- `http://127.0.0.1:3100/project/aslan-maps/` — 상세 공개 접근·heading·설명·
  연결 섹션·토폴로지 미리보기 모두 렌더?
- `http://127.0.0.1:3100/login` 폼 렌더 + 데모 로그인 CTA 보임?
- `http://127.0.0.1:3100/admin/dashboard/` 가드 카드에 "관리자 로그인" CTA

### 5-2. 이번 사이클이 손댄 영역
- 손댄 라우트·컴포넌트를 직접 네비게이션
- 의도한 상호작용 수행 (클릭·드래그·입력·키보드)
- 콘솔 에러 0, 네트워크 에러 0 (Firestore Listen abort는 정상)

### 5-3. 토폴로지 한정 추가
- 노드 드래그 시 즉시 반응, 뷰포트 팬·줌 부드러움
- zoom < 0.35로 휠 내리면 aggregate 노드 2개만 보이고 120fps 근처
- 500 이상 노드에서도 close 모드 드래그 체감 부드러움 (현재 한계 인지)

### 5-4. MCP가 끊긴 경우
- `playwright-mcp` 프로세스 재기동 시도
- 안 되면 이번 사이클은 `tests/e2e/*.spec.ts` 자동 spec으로 대체 검증
- 브라우저 직접 확인은 다음 사이클로 이월하되 "이월" 사실을 로그에 남긴다

---

## 6. 커밋·푸시 규칙

- 한국어 커밋 메시지: `타입: 한국어 제목` (`feat`·`fix`·`perf`·`chore`·
  `docs`·`test`·`refactor`)
- 본문에 "**측정**" 섹션이 가능하면 넣는다(FPS·mount 시간·before/after)
- main에 fast-forward merge만 허용. 롤백 필요하면 새 커밋으로 되돌린다.
- 로컬 브랜치는 merge·push 후 즉시 삭제
- 매 커밋 후 이 문서 하단 "최근 작업 로그" 섹션에 한 줄 추가

---

## 7. 비상 정지 조건

다음 중 하나면 loop는 즉시 멈추고 사용자에게 보고한다.

- `pnpm build` 실패가 한 사이클에 해결 안 됨
- `tests/e2e/*.spec.ts`에서 이전까지 통과하던 spec 3개 이상 신규 fail
- Firestore / Firebase 관련 문자열 변경이 필요한데 실 데이터 권한 불분명
- 루프가 같은 이슈를 3사이클 연속 손대고 있음 (진척 무한 루프)

---

## 8. 현재 알려진 큰 이슈 · 다음 사이클 후보

`docs/superpowers/plans/2026-04-19-phase-3-topology-scale-3000.md`도 참조.

- [ ] **문서(md) → 노드 분해 파이프라인** 실제 구현 상태 진단 (크리티컬
      제품 약속). 현재 admin/knowledge UI는 있으나 분해·공개 반영 루프의
      런타임 완성도 확인 필요.
- [x] URL 계약 3종 통합 (canonical `/project/[slug]/`) — 2026-04-20 T-15.
      내부 링크는 canonical 로 직결, legacy `/project/view/?slug=` 는 외부
      북마크용 redirect 만 유지.
- [ ] 토폴로지 close 모드 drag 30fps — viewport 내부 노드도 간소화(dense
      모드·compact 모드 자동 전환)
- [ ] Admin 프로젝트 편집 "공개 화면에 어떻게 보이나" **인라인** 프리뷰
      (iframe). 현재는 링크(2026-04-20 T-19 로 4곳 전부 새 탭 통일).
- [x] 공개 상세에서 Cmd+K 외에 `?` 치트시트 인라인 — 2026-04-20 T-16.
      F 프레젠테이션 모드는 홈 토폴로지 전용 기능이라 상세엔 부적합(보류).
- [~] 빈 상태 카피 일괄 점검 (placeholder 제거) — TopologyCanvas
      (2026-04-20 T-17) · SearchPalette + AdminDashboard ProjectTable
      (2026-04-20 T-18) 정리. 추가 목록: admin knowledge 리스트들, 프로필
      설정 등 순차 순회 필요.
- [ ] 새 프로젝트 생성 → 공간 토폴로지 자동 반영 흐름 E2E 확인
- [ ] 회원가입 폼 validation 친절도 (에러 카피, 8자 이상 비번 설명 시점)
- [ ] 로그인 상태에서 세션 만료 처리 UX
- [ ] RegionNavigator 모바일 대응 재점검

---

## 9. 최근 작업 로그

루프가 한 사이클 완료할 때마다 `- YYYY-MM-DD HH:MM · <커밋 해시> <한 줄 요약>`을
추가한다. 최신 항목이 위.

- 2026-04-20 08:08 · (commit) · **T-20 공개 여정 audit 정확도 향상** —
  user-journey-a spec 의 A1 title 검증이 aslan-maps 슬러그를 보고 "aslan"
  문자열을 찾다 실패해 매 사이클 "A1 title 에 프로젝트 이름 누락: 'Narnia ·
  Narnia'" finding 을 노이즈로 남기고 있었다. 실제 프로젝트 이름 `Narnia` 기준
  으로 포함 여부를 확인하도록 수정. 추가로 hydration 이후 body 에
  프로젝트 이름 텍스트가 실제로 나타나는지 assertion 을 붙여 "메타데이터만
  있고 본문 비어있는" 회귀(server-only HTML 변질)까지 잡도록 보강.
  findings=0 clean 로 복구.
- 2026-04-20 07:48 · (commit) · **T-19 어드민 "공개 화면" 링크 새 탭 통일** —
  어드민 프로젝트 편집 · 지식 문서 상세 · 리뷰 워크스페이스의 공개 미리보기
  Link 4종에 `target="_blank" rel="noopener noreferrer"` + aria-label
  "공개 화면을 새 탭에서 보기" + "↗" 시각 힌트를 일관 적용. 편집·리뷰
  중 맥락 손실 없이 공개 결과 확인.
- 2026-04-20 07:28 · (commit) · **T-18 빈 상태 카피 2차 — 팔레트 · 대시보드** —
  `SearchPalette` 가 `projects.length === 0` 일 때 "검색 결과가 없습니다"
  라는 오해 카피 대신 "이 공간에는 아직 프로젝트가 없어요 + 추가되면 여기서
  바로 검색·점프 가능" 로 분기. `AdminDashboard ProjectTable` 이 필터
  없는 0건 상태에서 CTA 없이 한 줄만 보여주던 막다른 경로를 "아직 등록된
  프로젝트가 없어요 + 첫 프로젝트를 만들면 지도가 여기서부터 자랍니다 +
  `/admin/project/new/` primary 버튼" 으로 보강.
- 2026-04-20 07:08 · (commit) · **T-17 토폴로지 빈 공간 카피 역할별 분리** —
  이전엔 `projects.length === 0` 일 때 "/admin에서 시드 데이터를
  주입해주세요"라는 개발자 전용 카피가 노출됐다. `scopedAccess.canManage`
  분기로 관리 권한자에겐 "첫 프로젝트를 만들면 지도가 여기서부터 자랍니다"
  + `/admin/project/new/` 로 가는 CTA 버튼, 방문자에겐 "이 공간에는 아직
  공개된 프로젝트가 없습니다" 관찰자 카피로 교체. §2 B1 신규 가입자 여정의
  막다른 느낌 제거.
- 2026-04-20 06:48 · (commit) · **T-16 공개 상세 `?` 치트시트 인라인** —
  ProjectDetailPage 의 `?` 가 이전엔 sessionStorage 플래그 + `/` push 로
  HomePage ShortcutSheet 를 열었으나, 비로그인 방문자는 `/` 가
  ServiceEntryLanding 이라 sheet 가 등장하지 않는 T-11 과 동일한 단절이
  있었다. `ShortcutSheet` 를 상세 페이지에 dynamic mount 해 URL 유지한
  채 토글. journey-a spec 의 A5' 단계로 회귀 가드 추가(KeyboardEvent('?')
  dispatch → `role=dialog name=키보드 단축키` 확인).
- 2026-04-20 06:28 · (commit) · **T-15 내부 상세 링크 canonical 직결** —
  `getProjectDetailHref` 가 legacy `/project/view/?slug=` 대신 canonical
  `/project/{slug}/` 를 바로 반환하도록 전환. 홈·공개 상세·어드민
  대시보드·어드민 편집·리뷰 워크스페이스·CSV 리포트 등 모든 내부 링크에서
  redirect hop 1단계 제거. legacy 경로는 외부 북마크용 replace 만 계속 유지
  (legacy-project-view-redirect spec 통과 확인). detail-href·admin-project-report
  단위 테스트, back-navigation·journey-a e2e 전부 green.
- 2026-04-20 06:08 · (commit) · **T-14 공개 상세 SEO metadata 회귀 가드** —
  `src/entities/project/model/seo-metadata.test.ts` 신설. 빌드된 각
  `out/project/{slug}/index.html` 을 읽어 `<title>`이 프로젝트 name 포함,
  `og:title == project.name`, `og:description == project.description`,
  canonical·`og:url` 이 `/project/{slug}/` 로 끝나는지 엄격 검증. seed
  15종 모두 통과 baseline. 이후 metadata 회귀가 들어오면 즉시 실패.
  FSD boundary(shared→entities 금지)에 맞춰 entities/project/model 배치.
- 2026-04-20 05:52 · (commit) · **T-13 sitemap / 정적 페이지 집합 괴리 Fix** —
  `.next/cache/fetch-cache`가 오래된(2026-04-12) Firestore 응답 20건을 들고
  있어, 빌드 중 호출자(sitemap 생성 vs generateStaticParams)에 따라 15건
  /20건 다른 집합이 돌아와, sitemap이 존재하지 않는 7개 슬러그(aslan-art,
  aslan-studio, asset-management 등)를 광고하고 실제 reactor-admin /
  reactor-web 는 검색엔진에 숨김 상태였다. `fetchAllProjectsAtBuild`에
  `cache: 'no-store'`를 걸어 빌드당 1회 실제 fetch 강제. `out/sitemap.xml`
  의 `/project/{slug}/` ↔ `out/project/*/` 정합성을 vitest
  `public-routes-coherence.test.ts`로 회귀 가드(out/ 없으면 skip).
- 2026-04-20 05:30 · (no-code) · **T-04-e 오전제 확인 — 큐에서 제거** —
  티켓 설명은 "seed 운영 스크립트 없는 듯"이었으나 실제로는
  `scripts/seed-sandbox-knowledge.mjs`(5 fixture 문서) +
  `scripts/seed-stress-knowledge.mjs`(240 문서, 전체 파이프라인) 이 이미
  존재·운영 중. 추가 작업 불필요로 §3 큐에서 제거.
- 2026-04-20 05:28 · (commit) · **T-12b Storage 경로 감사 + DATA-MODEL
  §5 보강** — `audit-data-model.mjs` 에 `parseDocumentedStoragePaths` /
  `parseRuledStoragePaths` 추가해 DATA-MODEL.md §5 트리와 `storage.rules`
  최상위 경로가 어긋나면 exit 1. DATA-MODEL.md §5 에 누락돼 있던
  `accounts/{accountId}/{screenshots,knowledge-documents}` 하위 구조 명시.
  vitest에도 테스트 추가(161 tests).
- 2026-04-20 05:12 · (commit) · **T-12 데이터 모델 정합성 감사 1차** —
  `scripts/audit-data-model.mjs` 로 DATA-MODEL.md의 `### ` 컬렉션 헤더와
  `firestore.rules`의 `match /name/{...}` 최상위 이름을 파싱·비교. 양쪽
  어느 한쪽에만 있는 컬렉션이 있으면 exit 1. 같은 파서를 vitest
  `data-model-audit.test.ts` 에서 재사용해 PR 단계에서도 회귀 차단. 현재
  baseline: documented=21, ruledTop=22(accountMemberships allowlist), 0 findings.
  §1.2 "DB 설계 탄탄" 원칙을 CI 수준에서 강제.
- 2026-04-20 05:02 · (no-code) · **T-03 contain 실험 실패 — 롤백** —
  `[data-topology-dragging="true"]`로 드래그 중에만 모든 노드에
  `contain: layout paint style`(±`will-change: transform`) 적용을 시도.
  1000 노드 A/B 측정에서 적용 시 drag FPS 32→26(-19%p, will-change 포함 시
  21→15, -29%p). 수백 노드에 동시 style recalc + compositor promotion 비용이
  contain의 paint 절감을 초과. 코드 전량 revert, §3 큐에서 제거, §8
  Long-term에 "구조 수준 변경 필요"로 기록.
- 2026-04-20 04:50 · (commit) · **T-11 공개 상세 Cmd+K 인라인 팔레트** —
  비로그인 방문자가 `/project/[slug]`에서 Cmd+K를 누르면 `/`로 튕기지 않고
  상세 페이지 안에서 SearchPalette가 바로 열리도록 교체. dynamic import로
  번들은 동일 보존. user-journey-a spec을 "URL 변하지 않고 팔레트가 열림"
  assertion으로 강화. §2.A5 공개 방문자 깨짐 복구.
- 2026-04-20 04:32 · (commit) · **T-10 공개 여정 A1·A2·A5 audit spec** —
  `tests/e2e/user-journey-a.spec.ts` 신설. 공유 링크→상세, 루트→랜딩
  Narnia·h1·subtitle, 상세 Cmd+K 3단계를 한 플로우로 재현하며
  pageerror만 실패시키고 나머지는 findings 리포트. 발견: **공개 방문자
  Cmd+K가 비로그인 랜딩으로 튕겨 팔레트가 등장하지 않는다** → §3 T-11 신설.
- 2026-04-20 04:08 · 79ea6fb · **T-09 aria 라벨 회귀 방지 e2e** —
  공개·관리 7개 라우트에서 aria-label·aria-labelledby·textContent가 모두
  비어 있는 button/link 탐지. 현재 baseline 0건을 toHaveLength(0)로 잠가
  이후 라벨 누락이 들어오면 즉시 실패.
- 2026-04-20 03:48 · 5b55dd1 · **T-08 뒤로가기 회귀 방지 e2e 4건** —
  공개 상세 goBack · legacy→canonical replace 루프 방지 · 404 홈 CTA ·
  404 이전 화면 goBack. §1.6 절대 원칙 자동 검증.
- 2026-04-20 03:28 · 7712fe9 · **T-06 회원가입 인라인 validation** —
  비밀번호 길이·일치 실시간 helper(idle/ok/warn tone) + canSubmit으로 버튼
  disable. aria-describedby·role=alert 접근성 병행.
- 2026-04-20 03:08 · 213094f · **T-07 404 페이지** — "길을 잃은 것 같아요"
  카피 + CTA 3단(primary: 프로젝트 검색, outline: 홈, ghost: 이전 화면).
  router.back()·sessionStorage 검색 트리거로 막다름 해소.
- 2026-04-20 02:48 · a5cae08 · **T-04-d 공개 빈 지식 그래프 역할별 카피** —
  관리자는 "md 문서 등록하러 가기 ↗ · 등록 → 추출 → 승인 → 공개 반영 4단계"
  직접 CTA, 방문자는 "관리자가 문서 등록해 공개 반영하면 여기 나타남" 관찰자
  시점으로 분리.
- 2026-04-20 02:28 · 86c9a67 · **T-04-c 리뷰 → 공개 반영 2단계 CTA** —
  hasApprovedPending 상태 머신으로 primary 버튼이 승인 후 "공개 화면에 반영"
  으로 자동 전환. <details> 숨김 제거. flowStep도 3(승인) → 4(공개) 분리.
- 2026-04-20 02:10 · b32b5a7 · **T-04-b 작업 상태 배지 dot** — primitive
  success/warning/paused/neutral dot을 Badge 앞에 붙여 색 추가 없이 큐·진행·
  성공·실패·대체 상태를 한눈에 구분. CLAUDE.md 단일 인디고 원칙 준수.
- 2026-04-20 01:48 · c1bf975 · **T-04-a 업로드 직후 자동 enqueue** —
  document-new의 jobStatus=autostart 조건을 항상 붙여 어떤 경로로 업로드해도
  추출 작업이 자동 큐에 올라간다. "문서 등록 → 노드로 쪼개짐" 약속의 단절 제거.
- 2026-04-20 01:28 · (no-code) · **T-04 파이프라인 진단 리포트** 발행 —
  `docs/superpowers/plans/2026-04-20-knowledge-pipeline-diagnosis.md`. 결론:
  8 컬렉션 + 4 Cloud Functions 트리거 + 5 admin views 모두 구현됨. 갭은 UX
  완성도(업로드→enqueue 체인 확인 · 작업 상태 배지 · 승인/공개 2단계 CTA ·
  공개 빈 상태 관리자 진입)에 집중. T-04-a~e로 티켓 분할해 후속 처리.
- 2026-04-20 01:10 · 259cff4 · **T-02 전역 단축키 훅** — useTypingShortcuts
  shared/lib 추출 + ProjectDetailPage에 Cmd+K · ? 지원. 상세에서도 정기 사용자
  단축키 기대 충족. 사용자 요청(웹 우선·기획/DB 탄탄함) 원칙 §1.2/§1.4 추가.
- 2026-04-20 01:05 · 413b55f · **T-01 URL 계약 Phase 1** — /project/view/
  레거시가 canonical /project/[slug]/로 즉시 replace + metadata canonical/og
  보강. 지침서 §3 티켓 큐 첫 처리.
- 2026-04-20 01:00 · 00f5264 · 루프 지침서 §3을 티켓 큐(T-01~T-10)로 재작성
  — 매 사이클 실제 슬라이스 1건 처리하도록 원칙 강화
- 2026-04-20 00:46 · ce732a4 · AccountSettings ProfileRow 빈 상태 "미설정"
  mono 톤으로 분리 — 이름·이메일이 실제 값과 시각적으로 구분
- 2026-04-20 00:25 · 8be7678 · ProjectCard 빈 상태 카피(이름/설명 placeholder)
  개선 — slug fallback + "설명 미등록" mono 라벨
- 2026-04-20 00:20 · e93fd3e · boundaries v6 마이그레이션 + lint clean (baseline
  정리). 루프 공식 시작 전 상태.
