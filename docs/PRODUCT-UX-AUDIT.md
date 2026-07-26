# Ontology Atlas 제품 UX 감사 장부

> 상태: 진행 중. 이 문서는 전면 재디자인 제안서가 아니라, 실제 사용자
> 시나리오를 설치 앱에서 반복 검증하며 발견·수정·재검증한 계약을 기록한다.
> 최신 반복 측정: 2026-07-27, 설치 앱 + Codex Computer Use.
>
> 원칙: 취향보다 과업 성공, 스크린샷보다 상호작용 증거, 새 기능보다 현재
> 흐름의 신뢰 회복을 우선한다.

## 감사 방법

각 항목은 아래 순서로 닫는다.

1. 사용자·과업·시작 상태·이벤트 순서를 고정한다.
2. 설치 앱에서 포인터와 키보드로 재현한다.
3. 스크린샷의 광점·호버·강조를 판정하기 전 포인터를 비정보 영역으로 옮겨
   한 장 더 캡처한다. Codex Computer Use 포인터 피드백이 제품 highlight처럼
   보일 수 있으므로, 포인터와 함께 움직이는 표시는 앱의 주의 계층 근거로
   세지 않는다.
4. 주의 계층, 모션, 반응형, 접근성, 로컬 파일 신뢰를 함께 판정한다.
5. 실패 테스트를 먼저 추가한다.
6. 가장 작은 일관된 슬라이스로 수정한다.
7. 집중 테스트와 `/Applications/Ontology Atlas.app`에서 다시 증명한다.

심각도:

- `S4` 과업 중단, 데이터/볼트 신뢰 훼손, 키보드 진행 불가
- `S3` 잘못된 사실, 주의 계층 충돌, 주요 상태 이해 실패
- `S2` 반복 마찰, 스캔·탐색 비용
- `S1` 토큰·간격·문구의 국소 품질
- `S0` 취향 차이 — 구현하지 않음

## 현재 시나리오 행렬

| ID | 실제 사용자 흐름 | 상태 |
|---|---|---|
| A1 | 첫 실행 → 샘플 선택 → 2분 투어 → 종료 | 1차 설치 앱 감사·수정·재배포 검증 완료 |
| A2 | 재실행 → 저장 상태 복원 → 폴더 선택 취소/권한·경로 실패 복구 | 1차 설치 앱 감사·수정·재배포 검증 완료 |
| A3 | 지도 전체 보기·자동 정렬·검색·축척 | 1차 설치 앱 모션·키보드 검증 완료 |
| A4 | 노드 클릭 → 초점 → 카드 읽기 → 닫기 | 1차 설치 앱 감사·수정·재배포 검증 완료 |
| A5 | 관계 읽기 → 경로 → AI 요약/MCP·CLI 인계 | 샘플/실 vault 인계 경계·MCP 경로 패킷 설치 앱 검증, CLI 인계 계속 감사 |
| A6 | 지도 경로 탐색 | 프로젝트 → AI Agent Partner 1홉 경로·복사 패킷 설치 앱 검증 |
| A7 | 지도 노드 → 공방 딥링크 | AI Agent Partner → 공방 ENHANCE 딥링크 설치 앱 검증 |
| A8–A11 | 프로젝트 목록 → 생성 → 상세 → 인라인/전체 편집 | 임의 로컬 slug 생성·상세·인라인/전체 편집·원본 파일·schema 설치 앱 검증 완료 |
| A12 | 문서함 선택 → 편집 → 저장/오류 → 재실행 | 정상 저장·동시 편집 충돌 차단·디스크 검증·재실행 복원 완료 |
| A13–A14 | `/ontology`, 구 `/ontology/edit` 리다이렉트 | 로컬 딥링크 선택·오류 판정·공방 포커스 설치 앱 검증 완료 |
| A15–A16 | 공방 ENHANCE/CREATE → 쓰기 → 파일 재열기 | 임시 vault의 ENHANCE 관계 쓰기와 CREATE 노드 생성·중복 차단·디스크/validator/문서함 재열기 검증 완료 |
| A17 | 인사이트 읽기·필터·지도 복귀 | 읽기·탭 키보드·지도 왕복 1차 설치 앱 검증 완료 |
| A18 | 다운로드 안내 | 설치 가능 여부·CTA·대기 상태 첫 화면/키보드 검증 완료 |
| A19 | 한국어/영어 동일 과업·동일 사실 | 인사이트 신선도 KO↔EN 동일 URL·탭·사실 왕복 검증 완료 |
| A20 | 1100×800, 1512×917, 1920×1080, 2560×1440 + reduced motion | 4개 폭 충돌·잘림 0, 일반/축소 모션 설치 앱 정량 검증 완료 |
| A21 | 설정 언어 전환 → 시트 닫힘 → 키보드 흐름 계속 | KO↔EN 동일 responsive 설정 호출점 포커스 복귀 검증 완료 |
| A22 | 설정 시트 열기 → Tab/Shift+Tab 전체 순회 → Escape | 양방향 focus trap·원호출점 복귀 설치 앱 검증 완료 |
| A23 | 설정 AI 에이전트 드릴인 → 뒤로가기/Escape → 루트 복귀 | 드릴인·루트 양방향 포커스 연속성 설치 앱 검증 완료 |
| A24 | 설정 문서함 링크 → client/native route 전환 → 새 화면 읽기 시작 | 늦은 vault 렌더까지 기다린 h1 포커스 설치 앱 검증 완료 |
| A25 | 문서함 문서 선택 → 활성 탭 닫기 → 이웃 문서 계속 읽기 | 키보드 닫기 뒤 이웃 활성 탭 포커스 복귀 설치 앱 검증 완료 |
| A26 | 전역 레일 목적지 이동 → 새 surface 읽기 시작 | native-safe 의도 + 공방 main/h1 계약 설치 앱 왕복 검증 완료 |
| A27 | 768–1024px 하단 탭바 이동·safe-area·레일 전환 | route 포커스·가림·overflow·단일 내비 검증, 수정 없음 |
| A28 | 프로젝트 → 미연결 AI 타일 → 지도 연결 시트 → 닫기 | 교차 route 열기·모달 Tab 순환·타일 포커스 복귀 설치 앱 검증 완료 |
| A29 | 재배포 → 저장 vault 복원 → 4개 viewport → 주요 6개 surface 왕복 | 일반 화면·AX 이동 통과, 선택 관계 검증은 격리 fixture·1920/2560·Computer Use 재검증 완료 |
| A30 | 설정 → AI 에이전트 연결 → 고급 검증·handoff 문구 읽기 | 24→32 tool inventory 수정, 완료형 설정 CTA 모순은 UX-034로 추적 |
| A31 | CLI/MCP 현재 inventory → 활성 문서·프로토타입·fixture 교차 확인 | 52 CLI·32 MCP로 동기화, 역사/legacy 입력은 보존 |
| A32 | AI 연결 → `기능 문서 열기` → Agent Graph Workflow 읽기 | packaged dogfood runbook URL·본문·현재 inventory 설치 앱 검증 완료 |
| A33 | 설치 앱 foreground/AX window 자동 proof ↔ Computer Use 대조 | AX 최종 상태 우선 + 2회 bounded retry, 지속 실패 fail-closed, 최신 설치 앱 4 proof 통과 |
| A34 | 공방 진입 선택 → ENHANCE/CREATE 키보드 작업 계속 | 1920 ENHANCE h1·2560 CREATE 이름 입력 포커스 설치 앱 검증 완료 |
| A35 | 인사이트 수리 큐 요약 → 전체 분리 섬·누락 연결 대상 → 관계 편집/문서 | 설치 앱 1920/2560에서 전체 대상·행별 인계·제한 높이 펼침 검증 완료 |
| A36 | 인사이트 설치 앱 자동 proof → 5탭·단일 선택·활성 패널·agent handoff | 현행 maintenance-board WebView 계약과 Computer Use 1920/2560 검증 완료 |
| A37 | fresh build → packaged static route smoke → 실패 원인·다음 행동 | 현행 route/title/copy/chunk 계약으로 이관, fresh build smoke 통과 |
| A38 | design:ontology 초록 → 실제 보호 구조 확인 → 구 3탭 fixture 거부 | 현행 5개 질문 탭·단일 panel·tab handoff 계약으로 이관 |
| A39 | agent `builder_context` → persisted focus handoff → 현재 쓰기 표면 열기 | Workshop 직접 URL·호환 응답·설치 앱 ENHANCE proof 완료 |
| A40 | 설치 앱 AI 연결 → 공개 패키지 해석 → 설정 생성·원클릭 등록 | npm E404를 단일 fail-closed gate로 표시, 실행 불가능한 설정·후속 단계 0개 설치 앱 검증 완료 |

## 이슈 장부

### UX-044 — 공개되지 않은 CLI/MCP 패키지를 설치 앱이 즉시 연결 가능하다고 안내

- 심각도: `S4`
- 상태: 수정·fresh build·설치 앱 Computer Use 재검증 완료
- 흐름: 설치 앱 → 설정 → AI 에이전트 연결 → Claude Code/Cursor/VS Code/Codex
  설정 생성·복사·원클릭 등록 → 에이전트 재시작
- 관측 현상: `npm view ontology-atlas version`과
  `npm view ontology-atlas-mcp version`은 2026-07-27 현재 모두
  `E404 Not Found`다. 그런데 설치 앱은 `npx -y ontology-atlas-mcp`를 담은
  Cursor/VS Code 딥링크, `.mcp.json`, Codex 설정을 실행 가능한 연결 수단으로
  제시하고, 파일 존재/문법만 맞으면 `ready`로 판정한다. 에이전트 process가
  실제로 뜨는지는 이 준비 상태의 입력이 아니다.
- 사용자·순간: 소스 체크아웃이 없는 macOS 사용자가 자기 vault를 Codex,
  Claude Code, Cursor 또는 VS Code에 처음 연결하려는 순간이다.
- 현재 대안: 사용자가 실패 뒤 npm 404를 직접 해석하고 repo를 clone한 다음
  `node /absolute/path/to/mcp/src/index.js` 설정을 손으로 만들어야 한다.
  publish는 명시적 사용자 승인 없이는 실행할 수 없다.
- 문제: 제품이 만들고 `준비됨`이라고 부르는 설정이 실제 MCP server를 시작할
  수 없다. 사람은 restart 이후 연결 실패를 자기 설정 문제로 오해하고,
  agent는 Atlas의 meaning graph를 읽지 못한다.
- ontology 가치: 설정 파일 존재와 실행 가능한 meaning-layer 연결을 분리해,
  agent gate가 실제 source of truth 접근 가능성을 증명할 때만 준비 상태가 된다.
- agent 가치: 실행 불가능한 `npx` handoff를 복사하지 않고, 공개 배포 전에는
  source-checkout entrypoint와 `mcp-verify`를 명시적인 유일 fallback으로 남긴다.
- 결과: 공개 패키지가 확인되기 전에는 앱이 자동 설정 파일을 쓰거나 npx
  snippet/deeplink를 제공하지 않는다. 연결 표면의 첫 주의 대상은 한 개의
  `package unavailable` gate이며, restart/connection 단계는 숨긴다.
- 가장 위험한 가정: 정적 배포 상태가 실제 npm 상태와 다시 drift할 수 있다.
  따라서 상태에는 확인일·패키지명을 넣고, publish 절차와 package contract가
  공개 확인 뒤에만 상태를 전환하도록 고정한다.
- appetite/slice: publish·sidecar 번들·업데이터는 범위 밖이다. 공통 package
  availability 계약, 연결 UI fail-closed, starter 자동 설정 생성 중단,
  source-checkout 안내, current docs와 regression test까지만 구현한다.
- 단순화: 새 네트워크 poll, 새 설정 화면, 네 개 클라이언트별 오류 상태를
  추가하지 않는다. 기존 네 버튼과 뒤 단계 대신 한 차단 상태를 공용
  `AgentClientButtons`에서 소유한다.
- 검증 계획: 딥링크 builder가 절대경로가 있어도 `null`을 반환하고, 연결
  sheet/설정 패널이 package gate 한 개만 보이며 connect/restart controls를
  숨기는 실패 테스트를 먼저 추가한다. starter는 Markdown만 만들고 agent
  config를 쓰지 않는지 검증한다. README/MCP/CLI/Workflow 문서와 dogfood
  ontology를 동기화한 뒤 fresh build·설치 앱 재배포·Computer Use AX tree에서
  차단 문구와 원클릭 링크 0개를 확인한다.
- PO verdict: `Build and verify`.
- 디자인 가디언:
  - primary moment: agent handoff / first connection
  - attention winner: 배포 가능성 gate; demote: connect 버튼·restart·ready
    파일 카운트
  - typed fact: `package availability`와 `MCP runtime verified`는 config file
    presence와 다른 proof다.
  - tokens: 기존 warning/danger border·surface·text token만 재사용; 새
    색·그림자·radius·motion 없음
  - responsive: 기존 한 열 StepCard 안에서 reflow하며 1100×800,
    1512×917, 1920×1080, 2560×1440 모두 별도 floating surface 0
  - handoff: MCP=`node <source-checkout>/mcp/src/index.js`; CLI=
    `node cli/src/index.mjs mcp-verify <vault>`; 공개 npx는 제공하지 않음
  - proof: component/unit contract + 설치 앱 `/ko/topology` 설정의 AX tree +
    수정 전
    `.screenshots/ux-044-current-guidance/05-agent-connect-unpublished-package.png`
    + 수정 후
    `.screenshots/ux-044-current-guidance/06-agent-package-fail-closed.jpeg`
  - verdict: `Build and verify`
- 회귀 증거: deeplink·starter README·첫 실행 developer disclosure·공용
  연결 sheet·설정 패널·AppSettings·local vault를 포함한 집중 Vitest
  `7 files · 152 tests`, i18n catalog `16 tests`, desktop runtime
  `3 files · 67 tests`, `desktop:check`, TypeScript가 통과했다. fresh static
  build와 Tauri app build/deploy도 통과했다.
- 설치 앱 증거: Codex Computer Use로 `/Applications/Ontology Atlas.app`의
  설정 → AI 에이전트 연결을 다시 열었다. AX tree는 `사용 불가`,
  `2026-07-27 공개 패키지 확인 실패`, `실행 가능한 공개 패키지 없음`,
  `npm E404`, `소스 체크아웃 설정 보기`를 읽었고, Claude/Cursor/VS
  Code/Codex 연결 버튼·재시작·연결 확인·고급 복사 제어는 0개였다. 시각
  증거에서도 한 warning gate만 주의 승자로 남고 뒤 단계가 사라졌으며,
  잘림·겹침은 없었다.

### UX-043 — agent persisted-context handoff가 퇴역 Builder URL을 반환

- 심각도: `S2`
- 상태: 수정·MCP 통합·설치 앱 재검증 완료
- 흐름: agent가 `query_ontology({operation:"builder_context"})` 호출 → 반환
  `builder.href` 열기 → 현재 쓰기 표면에서 저장된 focus 검토
- 관측 현상: operation 자체는 살아 있지만 `builder.href`와 모든 안내 문구가
  퇴역한 `/ontology/edit`·Builder를 현행 표면처럼 반환한다. compatibility
  redirect 덕분에 404는 아니지만 agent는 불필요한 hop과 잘못된 제품 어휘를
  handoff packet에 보존한다.
- 사용자 문제·순간: 사람이 agent에게 저장된 관계 맥락을 넘겨 실제 수정
  화면을 열게 할 때, packet이 현재 Workshop 계약을 직접 설명하지 않는다.
- 현재 대안: `/ontology/edit` redirect가 `?node=`를 정규화해 Workshop으로
  넘길 때까지 기다리고, 사람이 Builder라는 퇴역 용어를 해석한다.
- ontology 가치: persisted node·bounded neighborhood·mtime proof가 실제
  frontmatter write surface와 한 주소로 이어진다.
- agent 가치: operation/response field 호환성은 유지하면서, 실행 가능한 URL과
  제약 문구가 현재 `/ontology/studio` ENHANCE workflow를 바로 가리킨다.
- 단순화: `builder_context` operation과 `builder` response key는 breaking
  change를 피하려고 보존한다. URL·사람용 설명·active docs만 Workshop으로
  바꾸며 별도 alias operation은 추가하지 않는다.
- 검증 계획: integration/unit fixture에서 `/ontology/studio/?node=` 직접
  handoff와 persisted-only 제약 문구를 먼저 실패시킨 뒤 구현한다. FEATURES,
  MCP README, package docs contract, dogfood verify를 함께 통과시킨다.
- PO verdict: `Build and verify`.
- 증거: red test는 실제 `/ontology/edit/?node=` 반환을 잡았고, 수정 후
  ontology-engine·MCP integration·package docs contract가 통과했다. Codex
  Computer Use로 `/Applications/Ontology Atlas.app`의 공방 목적지를 열어
  `tauri://localhost/ko/ontology/studio/` ENHANCE 상태, 4방향 관계 bearing,
  현재 노드·완성도·저장 경계를 AX tree와
  `docs/assets/readme/workshop-context.jpeg`로 다시 확인했다.

### UX-001 — 설치 앱 검증기가 현재 canvas-v2 지도를 구형 앱으로 오판

- 심각도: `S4`
- 상태: 수정·설치 앱 재검증 완료
- 흐름: 현재 HEAD 빌드 → `/Applications/Ontology Atlas.app` 배포 → 지형도 검증
- 관측: 앱과 WebView payload는 `topologyMapEngine: "v2"`를 보고했지만
  검증기가 폐기된 `topologyRelief` 마커를 필수로 요구했다.
- 사용자 영향: 실제 최신 앱도 릴리스 증거가 실패해 설치 앱 품질을 신뢰할 수 없다.
- 수정: canvas/v2 활성 계약을 우선하고 레거시 엔진에서만 Relief 마커를 요구한다.
- 증거: 검증기 테스트 61개 통과, `desktop:deploy:app -- --skip-build` 통과.
- 커밋: `bc8b399a8`

### UX-002 — 가이드 투어에서 키보드 포커스가 뒤 화면으로 이탈

- 심각도: `S4`
- 상태: 수정·설치 앱 재검증 완료
- 흐름: 첫 실행 → `2분 구경하기` → Tab/Shift+Tab
- 관측: `다음` 뒤 Tab이 문서 루트·내비게이션·첫 실행 버튼으로 빠졌다.
  4/7의 캔버스 노드 클릭 단계에는 키보드로 같은 행동을 수행할 방법도 없었다.
- 사용자 영향: 키보드 사용자는 투어를 완료하거나 강조된 노드 카드를 열 수 없다.
- 수정: 공용 다이얼로그 포커스 계약을 추가하고, 투어 카드 안에 강조 노드를
  선택하는 동일 행동 버튼을 제공했다. 투어 종료는 원래 호출 버튼으로 복귀한다.
- 회귀 증거: `GuidedTourOverlay.test.tsx`
- 설치 앱 증거: Tab이 `건너뛰기 ↔ 다음` 안에서 순환하고, 4/7 대체 버튼을
  Return으로 실행해 `상품` 데이터 카드와 5/7 단계가 열렸다.

### UX-003 — 폴더 안내 모달이 포커스를 가두거나 호출 버튼으로 복귀하지 않음

- 심각도: `S4`
- 상태: 수정·설치 앱 재검증 완료
- 흐름: 첫 실행 → `내 마크다운 폴더 열기` → Tab 여러 번 → Escape
- 관측: 포커스가 모달 뒤의 투어·새 vault·보기 모드 버튼으로 이동했고,
  Escape 뒤에는 마지막으로 밟은 배경 버튼에 남았다.
- 사용자 영향: 보이지 않는 배경 액션을 실행할 수 있고 현재 맥락을 잃는다.
- 수정: 열릴 때 다이얼로그로 이동, 양방향 Tab 순환, Escape 소비, 닫힐 때
  정확한 호출 버튼 복귀를 하나의 공용 계약으로 묶었다.
- 회귀 증거: `VaultOpenGuideSheet.test.tsx`
- 설치 앱 증거: 배경 접근성 트리가 모달 동안 제외되고, 포커스가
  `닫기 → 기존 폴더 → 새로 시작 → 다음에 → 닫기`로 순환했다.

### UX-004 — 예시 비즈니스 선택 뒤 설명이 다른 데이터셋을 지칭

- 심각도: `S3`
- 상태: 수정·설치 앱 재검증 완료
- 흐름: `예시 비즈니스 보기` → `시작 안내 다시 열기`
- 관측: 온라인 쇼핑몰 지도가 보이는데 본문은 계속 “이 프로젝트 자신의 지도”라고
  설명했다. 잘못된 데이터 출처를 말하는 신뢰 결함이다.
- 수정: 선택된 샘플 출처에 따라 dogfood/온라인 쇼핑몰 설명을 분리하고 한·영
  메시지 키 모양을 동일하게 유지했다.
- 회귀 증거: `FirstRunStarterModule.test.tsx`, 메시지 카탈로그 shape 검사
- 설치 앱 증거: 재실행 후 선택된 온라인 쇼핑몰 지도와 같은 설명이 노출됐다.

### UX-005 — 권한 대기 상태에서 폴더 선택 취소가 잘못된 `loaded` 상태를 만듦

- 심각도: `S4`
- 상태: 수정·설치 앱 재검증 완료
- 흐름: 저장된 vault 권한 대기 → 새 폴더 선택 → macOS 선택창 취소
- 관측: `handle` 존재만으로 `loaded`를 추정해 자동 새로고침이 깨어났고,
  빈 지도와 `No such file or directory (os error 2)` 원문이 노출됐다.
- 사용자 영향: “취소”가 상태 변경과 기술 오류를 만들며 로컬 파일 신뢰를 훼손한다.
- 수정: 선택창 직전의 전체 vault 상태를 보존하고 취소 시 그대로 복원한다.
- 회귀 증거: `use-local-vault.reopen.test.tsx`
- 설치 앱 증거: macOS 선택창 취소 뒤 온라인 쇼핑몰 샘플·선택 상태가 그대로
  복원됐고 raw OS 오류와 빈 지도 전이가 다시 나타나지 않았다.

### UX-006 — 투어 5/7에서 설명 대상과 시각적 주목 대상이 분리됨

- 심각도: `S3`
- 상태: 현행 구현에서 해소 확인, 수정 없음
- 흐름: 투어 4/7 노드 선택 → 5/7 데이터 카드 설명
- 최초 관측: 본문은 오른쪽 데이터 카드를 설명하지만 강한 포인터 광점은
  캔버스에 남고, 데이터 카드는 스크림 아래에서 약하게 보인다고 판정했다.
- 재측정: 최신 `/Applications/Ontology Atlas.app`에서 같은
  `직접 눌러보세요 → 카드 = 문서의 앞면` 흐름을 외부 27-inch wide와
  1920×1080 창에서 반복했다. 두 폭 모두 오른쪽
  `topology-v2-detail-panel` 전체가 직사각형 컷아웃으로 밝게 유지됐고,
  지도·INDEX·utility chrome은 같은 scrim 아래로 내려갔다.
- 포인터 분리 증거: 5/7을 그대로 둔 채 Computer Use 포인터를 화면 좌하단
  비정보 영역으로 옮기자 푸른 광점도 포인터와 함께 이동했다. 데이터 카드
  컷아웃은 오른쪽에 고정돼 있었다. 최초 관측의 강한 광점은 제품의 캔버스
  highlight가 아니라 Computer Use 포인터 피드백을 주의 계층으로 오인한
  측정 오류였다.
- 코드 계약: `TOUR_STEPS`의 `datasheet` 단계는
  `topology-v2-detail-panel`을 직접 앵커로 삼고,
  `GuidedTourOverlay`는 그 실제 rect 사방 8px에 컷아웃을 만든 뒤 바깥만
  `--topology-tour-scrim-surface`로 감광한다. 기존 guided-tour e2e도
  노드 선택 뒤 `data-tour-step="datasheet"`와 resolvable cutout을 요구한다.
- PO pass: 현재 사용자는 설명 문장과 같은 오른쪽 데이터 카드를 첫 주의
  대상으로 읽을 수 있고, 선택한 ontology fact와 다음 행동도 같은 카드에
  남는다. 수정할 현재 현상이 없으므로 새 강조·토큰·모션을 더하지 않는다.
- 디자인 pass: attention winner=오른쪽 데이터 카드,
  demote=지도·INDEX·utility chrome, responsive=wide/1920 동일,
  agent handoff=선택 노드와 카드 URL 유지.
- PO·디자인 판정: **Do not build** — 감사 상태와 측정 방법만 바로잡는다.

### UX-007 — 번역 계약 테스트 다섯 건이 현재 메시지와 역방향으로 드리프트

- 심각도: `S3`
- 상태: 해소 확인 (2026-07-27 기준선)
- 관측: 현재 앱 문구는 GitHub Pages·쉬운 작업공간/AI 표현으로 바뀌었지만
  `scripts/validate-messages.test.mjs` 일부가 Firebase Hosting·구 MCP 문구·
  폐기된 키를 계속 요구한다.
- 영향: 전체 메시지 검증이 항상 실패해 새 번역 회귀를 신뢰할 수 없다.
- 재검증: `pnpm test:i18n:messages`가 현행 한·영 카탈로그와 ICU 경계
  16/16을 통과했다. 같은 기준선에서 `pnpm desktop:check`도 통과했으며,
  로컬 vault 진입 문구는 `온톨로지 폴더`/`vault 폴더` 계약으로 정렬했다.

### UX-008 — 읽기 전용 샘플의 AI 인계가 실제 vault 쓰기 명령을 제안

- 심각도: `S4`
- 상태: 수정·설치 앱 재검증 완료
- 흐름: 온라인 쇼핑몰 샘플 → 상품 등록 노드 → `AI에게 넘길 요약 복사`
- 관측: 복사된 패킷은 샘플 노드의 사실 뒤에
  `get_concept("capabilities/product-register")`와
  `patch_concept / add_relation`을 다음 행동으로 제안했다. 이 노드는 사용자의
  연결된 vault에 있다는 보장이 없고, 현재 화면은 읽기 전용 샘플이다.
- 사용자 문제: 사람은 “이 화면을 그대로 AI에게 넘긴다”고 이해하지만, 에이전트는
  다른 vault를 조회·수정하라는 실행 불가능하거나 잘못된 지시를 받는다.
- 현재 대안: 사용자가 샘플임을 별도로 설명하고 복사된 명령을 수동으로 지운다.
- 온톨로지·에이전트 가치: UI가 읽는 사실의 출처와 MCP가 수정할 source of truth를
  같은 패킷 안에서 명시해, 샘플 사실이 실제 vault 사실로 승격되는 것을 막는다.
- 최소화: 액션과 사실 요약은 유지한다. 읽기 전용 샘플에서는 출처와 쓰기 금지를
  적고, 실제 vault가 로드됐을 때만 기존 MCP 다음 행동을 제공한다.
- 디자인 계약: 카드 계층·모션·반응형 배치는 바꾸지 않는다. 변경 표면은 복사된
  에이전트 패킷뿐이며, 설치 앱의 샘플/실 vault 두 상태에서 증명한다.
- 수정: 모든 패킷에 `source`를 추가했다. `read-only-sample`은
  `get_concept / patch_concept / add_relation` 실행 금지와 실제 vault를 연 뒤
  다시 복사하라는 다음 행동을 싣고, `loaded-vault`만 기존 MCP 다음 행동을 싣는다.
- 회귀 증거: `topology-v2-datasheet.test.ts` 33개 통과, TypeScript 통과.
- 설치 앱 증거: 온라인 쇼핑몰의 `capabilities/product-register`에서 복사한
  패킷이 `source: read-only-sample`과 `write_guard`를 포함하고 해당 노드의
  `get_concept(...)` 명령을 더는 포함하지 않았다. 이어 실제
  `docs/ontology` vault를 열고 `project` 노드에서 복사한 패킷은
  `source: loaded-vault`와 실행 가능한 `get_concept("project")` 다음 행동을
  유지했다.
- PO 판정: **Build and verify**

### UX-009 — 공방 인라인 관계 카드의 닫기 제어가 이름과 Escape 계약을 잃음

- 심각도: `S3`
- 상태: 수정·설치 앱 재검증 완료
- 흐름: 지도 노드 → `관계 편집` → 공방 ENHANCE → 관계의 `관계 고치기`
- 관측: 카드 우상단 `×`가 macOS 접근성 트리에서 이름 없는 `button`으로
  노출되고, 카드가 열린 상태에서 `Escape`도 아무 동작을 하지 않았다. 같은
  패턴의 소켓 picker와 접힌 관계 목록 닫기 버튼도 시각 기호만 갖고 있었다.
- 사용자 문제: 스크린리더 사용자는 닫기 기능을 식별할 수 없고, 키보드 사용자는
  비차단형 임시 카드를 열기 전 맥락으로 빠르게 되돌아갈 수 없다.
- 현재 대안: 보이는 `×`를 포인터로 누르거나 긴 Tab 순회 뒤 이름 없는 버튼을
  추측해 실행한다.
- 온톨로지·에이전트 가치: 관계를 읽고 고치는 의미 흐름을 보조 기술에서도 같은
  순서로 유지한다. 데이터·관계 모델은 바꾸지 않는다.
- 최소화: 새 모달이나 새 문구 체계를 만들지 않는다. 기존 공통 `닫기` 번역을
  세 인라인 카드의 아이콘 버튼에 연결하고, 열린 관계 편집 카드만 한 번의
  `Escape`로 닫는다. 키보드로 연 트리거 포커스는 그대로 유지한다.
- 디자인 계약: anchored nonmodal 계층·위치·모션·색상은 불변이다. 접근 가능한
  이름과 닫기 이벤트만 추가하고 설치 앱에서 다시 증명한다.
- 수정: 관계 편집 카드·소켓 picker·접힌 관계 목록의 아이콘 닫기 버튼에 기존
  `preview.close` 번역을 연결했다. 관계 편집 카드가 열린 동안 `Escape`는 그
  카드만 닫고, 키보드로 연 트리거는 단위 테스트에서 포커스를 유지한다.
- 회귀 증거: `StudioCompass.test.tsx` 35개와 handoff 포매터 테스트 33개,
  합계 68개 통과. TypeScript 통과.
- 설치 앱 증거: 실제 `docs/ontology` vault의 `CLI Developer Entry` ENHANCE
  화면에서 `MCP Server` 관계 편집 카드를 열었다. macOS 접근성 트리는
  아이콘 버튼을 `button 닫기`로 식별했고, `Escape` 뒤 카드가 사라지면서
  공방의 나머지 맥락은 유지됐다.
- PO 판정: **Build and verify**

### UX-010 — 재실행 시 열린 탭은 남지만 활성 문서가 README로 돌아감

- 심각도: `S3`
- 상태: 수정·설치 앱 재검증 완료
- 흐름: 임시 local vault에서 새 capability 작성 → 문서함에서 선택 →
  앱 종료·재실행
- 관측: 로컬 vault와 열린 탭 두 개는 복원됐지만 마지막 활성 문서와 지도 문서
  컬렉션 대신 README/가이드 컬렉션이 표시됐다. 첫 원인은 전역 route memory가
  `/ko/docs/` pathname만 저장해 `?slug=`를 잃는 것이었다. query를 보존한 뒤에도
  저장된 local source가 복원되기 전 임시 server manifest의 기본 선택 effect가
  README를 본문 state에 기록하는 두 번째 레이스가 남았다.
- 사용자 문제: 사용자는 앱을 다시 켜면 작업하던 문서로 돌아갈 것으로 기대하지만,
  열린 탭만 남고 본문이 다른 문서가 되어 직전 맥락을 다시 찾아야 한다.
- 현재 대안: 남아 있는 탭을 매번 다시 클릭한다.
- 온톨로지·에이전트 가치: 사람이 판단하던 source record와 에이전트에게 넘길
  근거의 초점을 재실행 경계에서도 동일하게 유지한다.
- 최소화: 새 UI나 모션을 추가하지 않는다. 현재 URL·vault별 활성 slug를
  저장하고, 저장 source와 local manifest가 준비되기 전 기본 README 선택만
  지연한다.
- 디자인 계약: 문서함 계층·탭 모양·전환 모션·반응형 배치는 불변이다.
- 수정: 전역 route memory가 query/hash와 `app:urlchange`·뒤로가기·hash 변경을
  함께 기억한다. 열린 탭 저장소에는 명시적으로 선택한 활성 slug를 vault별로
  분리해 기록하고, 앱 시작 시 source preference와 local manifest hydration
  뒤에만 기본 문서를 선택한다.
- 회귀 증거: route memory·URL state·collection selection·open tabs 집중 테스트
  50개, 전체 테스트 3,463개, TypeScript, production build 통과.
- 설치 앱 증거: `/tmp/ontology-atlas-ux-audit.dPX5qi`의
  `capabilities/감사-샘플-기능`을 선택한 뒤 두 번 연속 앱을 종료·재실행했다.
  두 번 모두 정확한 query URL, `감사 샘플 기능` 본문, 지도 문서 컬렉션,
  README와 감사 문서의 열린 탭 두 개가 함께 복원됐다.
- PO 판정: **Build and verify**

### UX-011 — 외부 편집 뒤 저장이 최신 mtime을 기준으로 삼아 변경을 덮어씀

- 심각도: `S4`
- 상태: 수정·설치 앱 재검증 완료
- 흐름: local vault 문서 편집 → 미저장 초안 유지 → 외부 에이전트가 같은 파일
  수정 → 편집 다시 열기 → 저장
- 관측: 브라우저 초안 자체는 유지됐지만, 저장 시 편집을 시작한 시점의 mtime이
  아니라 poll 뒤 최신 `selectedDoc.mtime`을 넘겼다. conflict guard가 최신 값과
  최신 값을 비교해 통과하면서 외부 에이전트가 쓴 한 줄을 경고 없이 덮어썼다.
- 사용자 문제: 사람과 에이전트가 같은 local-first source of truth를 함께
  편집하는 핵심 상황에서 한쪽 변경이 조용히 사라진다.
- 사용자 순간: 문서함에서 초안을 쓰는 동안 IDE·MCP·다른 에이전트가 같은
  Markdown을 갱신한 직후 최종 저장할 때.
- 현재 대안: 저장 직전 직접 `git diff`나 파일 mtime을 확인하고 수동 병합한다.
- 온톨로지·에이전트 가치: 사람의 초안과 에이전트의 최신 변경을 모두 보존해,
  같은 frontmatter·본문을 공동 source of truth로 쓴다는 제품 약속을 지킨다.
- 최소화: 새 병합 UI를 만들지 않는다. 이미 존재하는 conflict 오류·초안 유지
  메시지를 실제로 작동시키도록, 에디터가 최초 읽은 mtime만 저장 경계에 넘긴다.
- 디자인 계약: `blocking task`는 저장 시점의 충돌 메시지이며 편집 버퍼가
  `active focus`로 남는다. 레이아웃·색상·모션·반응형은 바꾸지 않고 기존
  inline 오류와 toast를 재사용한다.
- 검증 계획: 컴포넌트 테스트에서 poll로 doc mtime이 바뀐 뒤에도 최초 mtime을
  저장 함수에 전달하는지 고정한다. 설치 앱 임시 vault에서 외부 한 줄, 브라우저
  초안, conflict 메시지 세 가지가 모두 남고 디스크가 덮이지 않는지 증명한다.
- 수정: 에디터가 파일을 처음 읽은 mtime을 브라우저 초안과 함께 보존하고,
  최종 저장 시 page의 최신 manifest mtime 대신 이 기준값을 conflict guard에
  전달한다. poll로 에디터가 잠시 unmount되더라도 복원 초안의 기준값이 유지된다.
  기준값이 없는 구형 초안에서 디스크 변경이 감지되면 추정 저장하지 않고 같은
  충돌 안내로 안전하게 차단한다.
- 회귀 증거: editor·persistence·local-vault 집중 테스트 48개, 전체 396개
  파일의 테스트 3,464개(별도 todo 3개), TypeScript, lint(오류 0·기존 경고
  154개), production build를 통과했다.
- 설치 앱 증거: `/tmp/ontology-atlas-ux-audit.dPX5qi`에서 사람의 미저장
  초안을 만든 뒤 외부 에이전트 변경을 같은 Markdown에 추가했다. poll 뒤
  편집기를 다시 열자 사람 초안은 복원되고 inline conflict 안내가 즉시
  나타났으며, 저장을 눌러도 toast와 함께 덮어쓰기가 차단됐다. 디스크에는
  외부 변경만 남고 미저장 사람 초안은 쓰이지 않았으며, vault 6개 파일 검증도
  문제 0건이었다.
- PO 판정: **Build and verify**

### UX-012 — 노드 상세를 닫으면 키보드 포커스가 사라짐

- 심각도: `S3`
- 상태: 수정·설치 앱 재검증 완료
- 흐름: INDEX 검색 → Tab으로 tree 진입 → 방향키로 결과 이동 → Enter로
  노드 상세 열기 → 상세의 닫기 실행
- 관측: 검색·tree 로빙 tabindex·Enter 선택은 모두 작동했고 선택 카메라도
  정상 전환됐지만, 닫기 버튼이 120ms 퇴장 뒤 unmount되면
  `document.activeElement`가 body로 떨어지고 macOS 접근성 포커스도 HTML
  문서 루트로 이동했다. 즉 다음 조작을 받을 수 있는 컨트롤이 남지 않았다.
- 사용자 문제: 키보드·보조기술 사용자는 방금 보던 INDEX 결과로 돌아가지
  못하고 페이지 처음부터 다시 Tab 순회를 시작해야 한다.
- 사용자 순간: 지도에서 한 노드의 사실을 확인한 뒤 같은 검색 결과나 인접
  노드를 계속 비교하려는 반복 탐색 순간.
- 현재 대안: 마우스로 INDEX 행을 다시 클릭하거나 검색창까지 Tab을 반복한다.
- 온톨로지·에이전트 가치: 사람이 typed facts를 연속 비교하는 탐색 루프의
  위치를 유지해, 다음 노드 판단과 AI 인계가 끊기지 않게 한다.
- 최소화: 새 UI·문구·색·레이아웃·모션을 만들지 않는다. 닫기 뒤 선택한
  `data-index-row`로 포커스를 돌리고, 행이 필터나 접힘 때문에 없으면 기존
  검색창, 접힌 INDEX 탭 순서로 안전하게 복귀한다.
- 디자인 계약: 상세가 `active focus`인 동안 기존 180ms 등장/120ms 퇴장
  모션은 유지한다. 닫힌 뒤 attention은 사용자가 출발한 INDEX 탐색 맥락으로
  돌아가며, 배경 canvas를 새 포커스 표면으로 만들지 않는다.
- 구현: 상세를 닫기 직전 선택한 node id를 보존하고 다음 animation frame에
  보이는 동일 INDEX 행으로 포커스를 복원한다. 행이 없으면 검색창, INDEX가
  접혀 있으면 INDEX 탭 순서로만 강등한다.
- 모션 증거: macOS 화면 녹화 4초를 30fps로 추출했다. 최근 변경
  스포트라이트 121프레임의 node crop은 stalls 0, CV 0.30이었다. 전체 맞추기와
  검색 결과 선택 카메라도 전이 구간에서 중간 프레임이 연속적으로 진행했고
  정지 프레임은 없었다. 원본과 phase strip은
  `/tmp/ontology-atlas-motion.th9R0x`에 보존했다.
- 회귀 증거: DOM helper의 행 → 검색창 → INDEX 탭 복귀 우선순위 4개 테스트와
  INDEX·상세 패널 집중 테스트를 합친 82개, 전체 397개 파일의 테스트
  3,468개(별도 todo 3개), TypeScript, lint(오류 0·기존 `HomePage` 경고
  46개), production/desktop build를 통과했다.
- 설치 앱 증거: `/Applications/Ontology Atlas.app`에서 `감사` 검색 → tree
  결과까지 키보드 이동 → Enter로 상세 열기 → Tab으로 닫기 → Return을
  실행했다. 퇴장 후 동일 `감사 샘플 기능` 행에 포커스 링이 복원됐고, Tab을
  다시 순회하지 않은 다음 Return 한 번으로 같은 상세가 재개됐다.
- PO 판정: **Build and verify**

### UX-013 — 설치 앱에서 임의 로컬 프로젝트의 상세·전체 편집 경로가 열리지 않음

- 심각도: `S4`
- 상태: 수정·설치 앱 재검증 완료
- 흐름: 임시 로컬 vault 열기 → 프로젝트 목록 → `My project 상세로 가기`
  → 인라인 편집 또는 전체 편집
- 관측: 프로젝트 카드는 실제 로컬 `kind: project` 문서를 정상 표시했지만,
  상세 링크는 `/project/project/`를 가리켰다. 정적 export에는 빌드 시점의
  dogfood slug만 생성되므로 설치 WebView에는 해당 파일이 없고, 포인터·접근성
  `AXPress` 모두 아무 전환 없이 목록에 남았다. 같은 직접 경로를 전역 검색,
  홈 드로어, 관련 프로젝트, 전체 편집, 저장 후 이동도 공유한다.
- 사용자 문제: 사람이 이미 선택한 로컬 source of truth의 프로젝트를 목록에서
  볼 수는 있지만 상세를 읽거나 편집할 수 없어 핵심 과업이 첫 액션에서 중단된다.
- 사용자 순간: 임의 폴더를 연 직후 프로젝트 루트의 설명·상태·관계를 검토하고
  다음 편집이나 지도 판단으로 이어가려는 순간.
- 현재 대안: 문서함에서 project Markdown을 직접 찾거나 외부 편집기로 수정한다.
- 온톨로지·에이전트 가치: 프로젝트는 containment의 루트다. 사람의 상세 판단과
  에이전트가 읽는 동일 frontmatter 사이 진입점이 끊기면 공유 의미 계층이라는
  제품 약속이 성립하지 않는다.
- 최소화: 새 페이지·카드·문구·색·모션을 만들지 않는다. 빌드타임 프로젝트의
  공개 canonical 경로는 유지하고, 앱 내부 상세·전체 편집 이동만 이미 정적으로
  존재하는 `/project/fallback/`의 query 계약으로 모은다. 과거 CDN rewrite
  pathname 진입도 계속 허용한다.
- 디자인 계약: 프로젝트 목록의 `primary reading`과 상세의 `active focus` 위계는
  그대로 둔다. 라우팅만 복구하며 전환 모션·반응형·시각 토큰을 바꾸지 않는다.
  fallback은 같은 `ProjectDetailPage`/`ProjectEditorPage`를 렌더해 별도 UI
  변형을 만들지 않는다.
- 검증 계획: canonical·runtime 상세·runtime 편집 href와 fallback query/pathname
  해석을 실패 테스트로 고정한다. 설치 앱 임시 vault에서 목록 → 상세 → 인라인
  저장 → 전체 편집 → 저장 후 같은 상세 복귀를 실행하고 Markdown을 디스크에서
  확인한다. 새 임의 slug 프로젝트 생성 후에도 같은 흐름을 반복한다.
- 수정: 정적 dogfood slug는 기존 canonical 경로를 유지하고, 로컬/미확정
  slug의 앱 내부 링크만 `/project/fallback/?slug=…`로 보낸다. fallback은
  query의 `mode=edit`와 과거 pathname rewrite를 모두 해석해 기존 상세·편집
  컴포넌트를 그대로 렌더한다.
- 설치 앱 증거: scratch vault에서 `audit-second-project`를 생성해
  `저장하고 계속 보기` → 전체 편집 → 목록 복귀 → 상세 링크를 연속 실행했다.
  최종 URL은 `/ko/project/fallback/?slug=audit-second-project`, 화면은 실제
  이름·설명과 `0 도메인 · 0 역량 · 0 요소` 사실을 표시했다.
- PO 판정: **Build and verify**

### UX-014 — 경로가 자유로운 project 문서 편집이 원본 대신 복제 파일을 만듦

- 심각도: `S4`
- 상태: 수정·설치 앱 재검증 완료
- 흐름: vault 루트 `project.md` 상세 → 프로젝트 이름 인라인 편집 → Enter 저장
- 관측: 화면은 `이름 저장됨`을 알렸지만 원본 `project.md`의 `title`은 그대로였고,
  새 `projects/project.md`가 생성됐다. 읽기 계약은 `kind: project`면 경로와
  무관하게 project로 인정하지만 쓰기 계약은 무조건 `projects/<slug>.md`를
  upsert해 서로 달랐다.
- 사용자 문제: 성공 알림을 믿고 편집했는데 source of truth가 바뀌지 않고 같은
  slug의 복제 노드가 생겨, 이후 목록·상세·에이전트가 어느 문서를 읽는지
  비결정적이 된다.
- 사용자 순간: 프로젝트 상세에서 이름·설명을 짧게 고쳐 사람과 에이전트가 읽는
  동일 Markdown을 갱신하려는 순간.
- 현재 대안: 문서함이나 외부 편집기에서 실제 파일 경로를 찾아 직접 수정하고,
  UI가 만든 복제 파일을 수동 정리한다.
- 온톨로지·에이전트 가치: path-agnostic project 인식과 동일한 역참조로 원본
  `VaultDoc.slug`를 써야 frontmatter 한 장이 사람·에이전트의 단일 진실원이다.
- 최소화: 프로젝트 모델이나 폴더 규칙을 새로 만들지 않는다. 이미 존재하는
  `findProjectVaultDoc(manifest, projectSlug)`를 create 중복 검사,
  update, delete의 공통 원본 경로 해석에 사용한다. 신규 생성만 기존
  `projects/<slug>.md` 기본 경로를 유지한다.
- 디자인 계약: 레이아웃·문구·모션은 바꾸지 않는다. 기존 성공 toast는 실제
  원본 write가 끝난 뒤에만 의미가 성립하도록 데이터 경계만 복구한다.
- 검증 계획: 루트 project 문서 update/delete와 경로 무관 중복 생성 거부를 hook
  테스트로 고정한다. 설치 앱에서 원본 `project.md` mtime·frontmatter가 바뀌고
  새 `projects/project.md`가 생기지 않는지 확인한다.
- 수정: create/update/delete가 공통으로 `findProjectVaultDoc`에서 원본
  `VaultDoc.slug`를 해석한다. 생성은 같은 logical slug가 경로 밖에 있어도
  거부하고, 갱신·삭제는 실제 파일을 대상으로 한다.
- 설치 앱 증거: 루트 `project.md`의 `title`을 인라인으로 바꾼 뒤 원본
  frontmatter와 mtime만 갱신됐고 `projects/project.md`는 생기지 않았다.
  전체 편집의 담당자·좌표 저장도 같은 루트 파일에 남았다.
- PO 판정: **Build and verify**

### UX-015 — vault 재로딩 순간 전체 편집이 샘플 모드로 바뀌어 not-found를 고정함

- 심각도: `S4`
- 상태: 수정·설치 앱 재검증 완료
- 흐름: 프로젝트 인라인 저장 → 즉시 `프로젝트 정보 수정` → `전체 편집`
- 관측: 로컬 write 뒤 manifest 증분 재빌드가 `status: loading`으로 전환되자,
  이미 보존된 로컬 manifest가 있어도 data-source mode가 `static`으로 바뀌었다.
  편집기는 dogfood 프로젝트 1개에서 로컬 slug를 못 찾고 곧바로
  `프로젝트를 찾을 수 없습니다`를 영구 상태로 고정했다.
- 사용자 문제: 성공 직후 이어지는 편집 액션이 실패하고, 재로딩이 끝나도 스스로
  회복하지 않아 목록으로 후퇴해야 한다.
- 사용자 순간: 작은 인라인 수정을 마친 뒤 태그·담당·관계를 이어서 정리하거나,
  새 프로젝트를 생성해 `저장하고 계속`하려는 순간.
- 현재 대안: 목록으로 돌아가 로딩이 끝날 때까지 기다린 뒤 다시 상세와 편집을
  연다.
- 온톨로지·에이전트 가치: 마지막으로 검증된 로컬 manifest가 있는 동안에는
  dogfood 사실로 source를 바꾸지 않아야 같은 vault 맥락이 유지된다.
- 최소화: 별도 로딩 화면이나 retry 버튼을 만들지 않는다. 보존 manifest가 있으면
  transient `loading`에서도 local mode를 유지하고, 편집기는 `loaded:true`가
  되기 전에는 not-found를 판정하지 않는다.
- 디자인 계약: `loading`은 기존 편집기 로딩 라벨, 실제 부재만 기존 not-found를
  사용한다. 새 색·패널·모션 없이 상태 의미만 바로잡는다.
- 검증 계획: data-source mode가 `loading + manifest`에서 local을 유지하고,
  project editor가 미완료 로딩을 not-found로 판정하지 않는 테스트를 추가한다.
  설치 앱에서 인라인 저장 직후 전체 편집과 새 프로젝트 `저장하고 계속`을
  연속 실행한다.
- 수정: 검증된 manifest가 남아 있으면 transient `loading`에서도 local mode를
  유지한다. 편집기는 local vault가 `loaded`가 되기 전 not-found를 확정하지
  않고, 실제 프로젝트가 도착하면 이전 오류를 지운다.
- 설치 앱 증거: 인라인 이름 저장 직후 전체 편집을 열어 not-found 없이 실제
  값을 복원했고, 새 프로젝트 생성 직후에도 편집 화면이 `방금 저장했습니다`와
  저장된 taxonomy·설명을 바로 표시했다.
- PO 판정: **Build and verify**

### UX-016 — 짧은 인라인 편집이 없던 분류·상태를 만들어 전체 편집 저장을 막음

- 심각도: `S4`
- 상태: 수정·설치 앱 재검증 완료
- 흐름: category/status가 없는 root project → 이름 인라인 저장 → 전체 편집
  → 담당자 입력 → `저장 후 돌아가기`
- 관측: 이름만 바꿨는데 `projectToInput`의 form 전용 기본값
  `uncategorized/active`와 `position 0,0`, 본문 excerpt가 frontmatter에 함께
  기록됐다. 전체 편집은 앞의 두 값을 실제 taxonomy에 없는 참조로 정확히
  거부해 `존재하지 않는 카테고리/상태` 오류를 냈다.
- 사용자 문제: 작은 필드 하나의 성공 저장이 보이지 않는 다른 필드를 오염시키고,
  이어지는 전체 편집을 사용자가 고치기 전까지 막는다.
- 사용자 순간: 상세에서 이름만 빠르게 정리한 뒤 담당·태그 같은 다른 정보를
  전체 편집에서 이어서 저장하려는 순간.
- 현재 대안: 생성된 frontmatter 키를 문서함에서 직접 삭제하거나, 전체 편집에서
  원치 않던 category/status를 새로 선택한다.
- 온톨로지·에이전트 가치: vault가 가지지 않은 typed fact를 UI가 만들면 사람과
  에이전트 모두 fabricated classification을 사실로 읽게 된다.
- 최소화: 전체 form의 명시적 직렬화 계약은 유지한다. 인라인 이름·설명과
  빠른 편집 이름·설명·담당·태그만 별도 partial frontmatter patch를 사용해
  사용자가 만진 키 외에는 보존한다. 기존 문서가 `title`만 쓰면 rename은
  새 `name` 키를 겹쳐 만들지 않고 기존 `title`을 갱신한다.
- 디자인 계약: 기존 inline/quick-edit UI, validation, toast, 모션을 그대로
  사용한다. 변경 범위는 성공 toast가 말하는 필드와 실제 disk diff를 일치시키는
  쓰기 계약뿐이다.
- 검증 계획: partial patch가 root 원본 경로와 mtime을 쓰고, title/name 형태를
  보존하며 category/status/position을 전달하지 않는 테스트를 추가한다.
  설치 앱에서 이름 저장 후 disk diff를 확인하고, 전체 편집 담당자 저장과 상세
  복귀가 추가 정정 없이 성공하는지 증명한다.
- 수정: 상세 인라인·빠른 편집은 사용자가 만진 이름·설명·담당·태그만
  `patchProject`로 쓴다. 전체 편집은 category/status가 없을 때 form 안에서만
  `미지정 · 원본 유지`를 표시하고, 사용자가 새 값을 고르지 않으면 해당 typed
  fact와 position을 쓰지 않는다. 기존 문서가 `title`만 쓰면 전체 편집도
  `name`을 겹쳐 만들지 않고 같은 key-shape를 보존한다.
- 설치 앱 증거: 인라인 이름 저장의 disk diff에는 기존 `title`만 바뀌었고
  category/status/position이 생기지 않았다. 최신 설치 앱에서
  `missing-taxonomy-project` 전체 편집은 두 선택란에
  `미지정 · 원본 유지`를 표시했다. 담당자만 `Preserve audit`으로 저장한 실제
  파일에는 owner만 추가되고 category/status/position/name은 생기지 않았으며
  기존 title 형태가 유지됐다.
- PO 판정: **Build and verify**

### UX-017 — 새 프로젝트 파일이 graph node 종류 없이 생성됨

- 심각도: `S4`
- 상태: 수정·설치 앱 재검증 완료
- 흐름: 프로젝트 목록 → 새 프로젝트 → 이름·설명 입력 → `생성하고 계속 보기`
  → 실제 Markdown validator 검사
- 관측: 화면에는 프로젝트가 정상 생성·표시됐지만 새
  `projects/audit-second-project.md` frontmatter에 `kind: project`가 없었다.
  `vault:validate`는 `missing-kind`를 경고했고, graph node가 되기 위한 핵심
  typed fact가 UI 생성 경로에서만 빠졌다.
- 사용자 문제: 성공한 프로젝트가 목록 UI에는 보이면서 ontology graph와
  validator에는 불완전한 문서로 남아, 사람과 에이전트가 서로 다른 사실을
  읽는다.
- 사용자 순간: 첫 프로젝트를 폼으로 만든 직후 지도·인사이트·에이전트
  handoff까지 같은 프로젝트가 이어질 것으로 기대하는 순간.
- 현재 대안: 문서함이나 외부 편집기에서 `kind: project`를 직접 추가한다.
- 온톨로지·에이전트 가치: `kind`는 Markdown을 graph node로 만드는 최소
  계약이다. 생성 write가 이를 보장해야 frontmatter 한 장이 사람·에이전트의
  공유 의미 계층이 된다.
- 최소화: 폼이나 새 선택지를 추가하지 않는다. Project/ProjectInput 전용
  serializer가 항상 `kind: project`를 정규화해 신규 생성과 전체 편집이 같은
  schema를 쓰게 한다.
- 디자인 계약: 레이아웃·카피·모션·반응형은 바꾸지 않는다. 화면의 성공 상태와
  디스크의 typed fact를 일치시키는 데이터 계약만 수정한다.
- 검증: serializer 실패 테스트에 `kind`를 고정했다. 최신 설치 앱에서
  `kind-contract-project`를 새로 생성한 직후 파일 첫 frontmatter에
  `kind: project`가 기록됐다. 과거 누락 문서도 전체 편집 저장으로 정규화했고,
  동일 scratch vault `9 파일`을 다시 검사해 `issue 0 · vault clean`을 얻었다.
- 추가 source 경계 증거: `missing-taxonomy-project` 상세에서 복사한 링크는
  현재 locale을 포함한
  `tauri://localhost/ko/project/fallback/?slug=missing-taxonomy-project`였다.
  같은 scratch vault에 없는 dogfood slug `ontology-atlas`를 최신 설치 앱의
  runtime 상세 경로로 직접 열었을 때, 실제 URL을 유지한 채
  `프로젝트를 찾을 수 없음`을 표시했고 static 샘플 상세는 노출하지 않았다.
- 회귀 게이트: 프로젝트 흐름 집중 테스트 `15 파일 · 80개`, 전체 테스트
  `403 파일 · 3,491개`가 통과했다(todo 3개 별도). TypeScript, production
  build, docs-vault freshness, self-vault validation도 통과했고 lint는
  오류 0·기존 경고 155개를 보고했다.
- PO 판정: **Build and verify**

### UX-018 — 유효한 로컬 온톨로지 딥링크가 선택 성공과 not-found를 동시에 표시

- 심각도: `S3`
- 상태: 수정·설치 앱 재검증 완료
- 흐름: 저장된 로컬 vault 자동 복원 → 구
  `/ontology/?node=capabilities/example-capability` 링크 직접 실행
  → `/topology` 선택 데이터시트 확인
- 관측: 최종 URL과 데이터시트는 `capability:example-capability`을 정확히
  선택해 이름·kind·관계·근거·공방 링크를 표시했지만, 같은 화면 아래에
  `노드를 찾을 수 없습니다: capability:example-capability` 오류 toast가
  함께 남았다. 첫 렌더의 static sample에는 로컬 노드가 없어서 kind-prefixed
  miss를 즉시 확정했고, 직후 persisted vault가 복원돼 실제 노드가 도착해도
  이미 띄운 오류는 취소할 수 없었다.
- 사용자 문제: 성공한 선택 사실과 실패 경고가 동시에 보여, 사용자는 지금 보는
  개념이 실제 vault의 것인지 링크가 깨진 것인지 판단할 수 없다.
- 사용자 순간: 과거 북마크·문서·에이전트 인계가 만든 `/ontology?node=` 링크로
  특정 개념의 관계와 근거를 바로 검토하려는 순간.
- 현재 대안: 오류 toast를 무시하고 데이터시트 slug와 문서 링크를 수동 대조한다.
- 온톨로지·에이전트 가치: 딥링크는 같은 typed node handle을 사람의 지도 선택,
  문서 근거, 공방 쓰기와 연결한다. source 복원 전에 부재를 선언하면 이 공유
  handle의 신뢰가 깨진다.
- 최소화: 라우트·지도·INDEX·toast UI·모션은 바꾸지 않는다. 기존 miss 판정에
  `sourceReady`를 추가해 persisted restore 또는 vault 전환이 끝난 뒤에만 실제
  부재를 알린다. 권한 대기·loading·오류 상태에서는 source 자체가 확정되지
  않았으므로 not-found를 만들지 않는다.
- 디자인 계약: 선택 데이터시트가 `active focus`, toast는 확정 오류의 보조
  경고다. 성공 focus와 오류 경고가 같은 attention layer에서 충돌하지 않게
  transient 오류만 제거하며 노드 kind/slug·관계·문서·공방 handoff는 유지한다.
- 회귀 증거: `deeplink-miss-notice.test.ts`에 source 복원 전 kind-prefixed
  miss가 `none`인 실패 테스트를 추가했고 기존 진짜 miss의 즉시/유예 판정은
  그대로 통과한다. redirect·node href까지 묶은 집중 테스트
  `5 파일 · 48개`, TypeScript, production/desktop build, docs-vault
  freshness, self-vault validation이 통과했다.
- 설치 앱 증거: 최신 `/Applications/Ontology Atlas.app`을 위 구 경로로
  재실행했다. 최종 URL은
  `/ko/topology/?index=expanded&p=capability%3Aexample-capability`,
  데이터시트는 `예시 기능 · 역량`과 관계·근거·공방 링크를 표시했으며 작업
  알림 영역에 not-found toast가 없었다. 구
  `/ontology/edit/?node=capabilities/example-capability`도
  `/ko/ontology/studio/?node=capability%3Aexample-capability`로 이동해 같은
  `예시 기능`을 공방 중앙에 표시했다.
- PO·디자인 판정: **Build and verify**

### UX-019 — CREATE 저장 예고가 새 노드를 0가지로 세고 확정 충돌도 저장을 허용

- 심각도: `S3`
- 상태: 수정·설치 앱 재검증 완료
- 흐름: 공방 `?mode=create` → 이름·도메인·정의 입력 → 저장 예고 확인
  → 실제 Markdown 생성 → 같은 이름으로 다시 CREATE
- 관측: 관계를 하나도 고르지 않은 정상 draft는 새 Markdown 노드 1개를 만들지만
  접힌 저장 예고는 `기록될 내용 0가지`라고 표시했다. 같은 kind·이름으로
  이미 결정적 slug가 점유된 경우에도 근접 중복 안내가 `그래도 새로 만들기`와
  활성 저장 버튼을 남겨, 누르면
  `Document already exists: "capabilities/create-감사-기능"`으로 끝났다.
- 사용자 문제: 저장 직전 보조 계층이 실제 파일 생성을 부정하고, 성공할 수 없는
  액션을 계속 권해 공방 write와 vault 파일의 신뢰를 깬다.
- 사용자 순간: 관계는 나중에 채우되 먼저 의미 있는 노드를 만들거나, 기존
  개념과 같은 이름인지 확인하며 중복을 피하려는 순간.
- 현재 대안: `0가지`를 무시하고 저장하거나, 실패 toast를 본 뒤 이름을 바꾸고
  다시 모든 필드를 검토한다.
- 온톨로지·에이전트 가치: CREATE는 사람의 draft를 같은 Markdown node handle로
  만드는 경계다. 파일 1개와 relation N개를 구분해 말하고, 이미 점유된 slug는
  쓰기 전에 막아야 사람과 MCP/CLI가 같은 노드 정체성을 읽는다.
- 최소화: 새 모드·다이얼로그·장식 모션은 추가하지 않는다. create summary만
  `새 노드 1개 · 관계 N개`로 분리하고, `buildCreateNodeSlug`와 기존 후보 ref가
  정확히 같을 때를 hard conflict로 판정해 `기존 노드 열기`만 남기고 저장을
  비활성화한다. 충돌 중에는 생성 summary와 delta preview도 숨겨 우회 저장과
  거짓 예고를 함께 막고, 하단 hint는 `이름을 바꾸면 저장할 수 있어요`로
  바뀐다. 근접 중복은 기존의 선택 가능한 soft nudge를 유지한다.
- 디자인 계약: 중앙 draft 카드는 계속 `blocking task`, 4방위 소켓은
  `active focus`, 하단 예고는 디스크 효과를 정확히 설명하는 `support layer`다.
  경고는 기존 amber 토큰과 아이콘 라이브러리를 쓰며 새 색·glow·모션은 없다.
  이름 input은 충돌 때 `aria-invalid`와 경고 id `aria-describedby`를 가지며,
  경고는 polite live region으로 동적 상태를 알린다. 한국어 조사 의존 문장도
  이름을 인용하는 형태로 바꿔 임의 문자열에서 `... 기능 가`처럼 깨지지 않게
  했다.
- 회귀 증거: slug 충돌 순수 함수, CREATE summary, 경고 액션·저장 disabled
  컴포넌트 계약을 실패 테스트로 먼저 추가했다. 충돌 상태에 staged relation,
  summary, delta preview까지 주입해 summary/preview가 사라지고 입력 오류가
  경고와 연결되는 계약도 잠갔다. 집중 테스트 `3 파일 · 75개`와 TypeScript가
  통과했고 production/desktop build도 최신 설치 앱으로 배포됐다.
- 설치 앱 증거: scratch vault의 기존 `CREATE 감사 기능`을 입력하자
  `같은 경로의 노드가 이미 있어요`와 `그 노드 열기`만 나타났고
  `그래도 새로 만들기`는 사라졌으며 저장 버튼은 disabled였다. 이름을
  `CREATE 후속 검증`으로 바꾸자 접힌 예고는 `새 노드 1개 · 관계 0개`,
  펼친 예고는 `새 역량 ... 생성`과 `파일 1개 생성 · 관계 0줄 기록`을
  표시했다. 저장 후 canonical `?node=capability:create-후속-검증`으로
  전환돼 `‘CREATE 후속 검증’의 의미를 ...` 문구와 정의를 보였고,
  실제 `capabilities/create-후속-검증.md`가 생성됐다. 같은 vault
  `11 파일`을 검사해 `issue 0 · vault clean`을 얻었다. Guardian 후속으로
  새 이름에서 `예시 구성요소` 관계 1개를 먼저 stage한 뒤 다시
  `CREATE 감사 기능` 충돌을 만들었다. 최신 설치 앱/AX 트리에서 관계는 무대에
  유지됐지만 `새 노드 1개 · 관계 1개` summary와 `미리보기`는 모두 사라졌고,
  하단은 `이름을 바꾸면 저장할 수 있어요`와 disabled 저장만 표시했다.
- PO·디자인 판정: **Build and verify**

### UX-020 — 인사이트 탭이 복합 위젯을 선언하고 일반 링크처럼 동작

- 심각도: `S3`
- 상태: 수정·설치 앱 재검증 완료
- 흐름: 인사이트 → `할 일` 탭 키보드 포커스 → 구조/신선도 반복 비교
- 관측: 세 제어는 접근성 트리에서 `tab group`/`tab`으로 노출됐지만 모두
  순차 Tab 이동에 들어갔고, 선택 탭에서 `ArrowRight`를 눌러도 아무 변화가
  없었다. 포인터로 탭을 바꾸면 query route 전환 뒤 포커스가 document root로
  빠졌다.
- 사용자 문제: 키보드 사용자는 같은 정비 보드의 세 관점을 비교할 때마다
  세 탭을 Tab으로 다시 훑고 Enter를 눌러야 하며, 전환 뒤 다음 조작 위치도
  잃는다. 선언된 탭 의미와 실제 조작 규칙이 다르다.
- 현재 대안: 포인터로 탭을 누르거나, Tab을 여러 번 눌러 각 탭을 개별
  버튼처럼 사용한다.
- 온톨로지·에이전트 가치: 할 일·구조·신선도는 같은 vault graph 사실의 세
  읽기 관점이다. URL 딥링크와 패널 관계를 유지하면서 한 복합 위젯 안에서
  빠르게 전환돼야 사람의 판단과 에이전트 인계 맥락이 갈라지지 않는다.
- 최소화: 탭의 시각 계층·query URL·패널 내용은 바꾸지 않는다. 선택 탭만
  `tabIndex=0`으로 두고, 좌우 방향키는 순환 이동, Home/End는 처음/끝 이동,
  이동 즉시 기존 URL state를 활성화한다. 전체 router navigation 대신 현재
  locale pathname의 query만 native history로 바꿔 선택 탭 포커스를 보존하고,
  이미 선택된 탭을 다시 누를 때는 불필요한 같은-route replace를 하지 않는다.
- 디자인 계약: 새 색·레이아웃·전환 모션은 없다. 키보드 포커스만 기존
  `--color-indigo-ring-a46` 시맨틱 토큰의 inset ring으로 보여 가로 스크롤
  tablist 경계에서도 잘리지 않으며, `aria-selected`, `aria-controls`,
  `tabpanel` 연결을 유지한다.
- 회귀 증거: 선택 탭 한 개만 순차 포커스에 들어가는 계약, 좌우 순환,
  Home/End, activeKey 반영 뒤 선택·tabIndex·포커스 복원, 선택 탭 재클릭의
  무탐색 계약과 locale pathname 보존 URL 직렬화를 집중 테스트
  `2 파일 · 15개`로 고정했고 TypeScript가 통과했다.
- 설치 앱 증거: 최신 `/Applications/Ontology Atlas.app`의 11개 개념 vault에서
  `할 일`을 포커스한 뒤 Right는
  `/ko/ontology/insights/?tab=structure`, 구조 `tabpanel`, AX focus
  `tab (selected) 구조 11`을 동시에 만들었다. 다시 Right는 신선도,
  Home은 query 없는 기본 할 일, End는 신선도 URL·패널·포커스로 각각
  이동했다. 신선도 탭에서 Tab을 누르자 비선택 할 일/구조를 다시 밟지 않고
  패널의 첫 `지도에서 보기` 링크로 이동했다. 키보드 스크린샷에서 inset
  focus ring은 tablist 경계 안에 완전히 남아 잘리지 않았다.
- PO·디자인 판정: **Build and verify**

### UX-021 — 다운로드 경로의 첫 화면이 설치 판단 대신 제품 소개를 먼저 요구

- 심각도: `S3`
- 상태: 수정·설치 앱 재검증 완료
- 흐름: `/download` 진입 → 현재 설치 가능 여부 확인 → GitHub Release 이동
- 관측: 1512×917 첫 화면은 breadcrumb가 `macOS 앱 다운로드`인데도 구
  LandingPage에서 옮긴 소개 히어로·dogfood 미니어처·가치 카드가 전부
  차지했다. 실제 다운로드 제목·CTA·버전/DMG/체크섬·대기 상태는 스크롤
  아래에 있었다. 현재 `gh release list --repo wlsdks/ontology-atlas`도
  공개 릴리스 0건이라, “지금 받을 수 없음”이 가장 중요한 사실이었다.
- 사용자 문제: 설치하려고 온 사용자는 긴 제품 설명을 먼저 읽고 스크롤한
  뒤에야 다운로드 asset이 아직 없다는 사실을 알 수 있다.
- 현재 대안: 소개 전체를 지나 다운로드 구간을 찾거나, GitHub 저장소를 직접
  열어 Releases가 비어 있는지 확인한다.
- 온톨로지·에이전트 가치: 앱 설치는 로컬 vault와 MCP/CLI 에이전트 협업을
  시작하는 진입 경계다. 릴리스 상태를 먼저 정확히 보여야 사람이 설치 가능성과
  다음 행동을 판단하고, 에이전트도 존재하지 않는 asset을 안내하지 않는다.
- 최소화: 콘텐츠·링크·토큰은 삭제하거나 새로 만들지 않는다. 기존 다운로드
  h1, GitHub Releases/소스 CTA, release facts, checksum과 availability를
  소개보다 먼저 두고, 제품 소개는 divider 아래 보조 설명으로 내린다.
  owner 전용 first-release checklist가 명시적으로 켜진 경우에도 상태 설명 뒤,
  소개 앞에 유지한다.
- 디자인 계약: 첫 attention winner는 다운로드 결정이고 소개는 secondary
  explanation이다. 새 색·자산·모션 없이 기존 divider/spacing/token만
  사용한다. 문서 heading도 h1 다운로드 → h2 소개 순서가 된다.
- 회귀 증거: DownloadPage DOM 계약은 h1·primary/source CTA·fact strip·
  checksum·availability가 모두 소개 h2보다 먼저 오고, primary CTA가 source
  CTA보다 먼저 오는 순서를 고정한다. 다운로드 집중 테스트 `4 파일 · 20개`,
  TypeScript, touched ESLint, production/desktop build가 통과했다.
- 설치 앱 증거: 최신 `/Applications/Ontology Atlas.app`의 `/ko/download/`
  1512×917 무스크롤 첫 화면에서 h1, `GitHub에서 릴리스 확인`, `소스 코드
  보기`, v0.1.0/DMG/Apple Silicon+Intel/macOS 12 facts, checksum 게시 대기,
  release availability 안내가 동시에 보였다. 소개 히어로는 divider 아래에서
  시작했다. AX 키보드 순서는 primary CTA → source CTA였고 두 링크의 실제
  GitHub 목적지도 유지됐다.
- PO·디자인 판정: **Build and verify**

### UX-022 — 언어 전환이 현재 인사이트 과업을 기본 탭으로 초기화

- 심각도: `S3`
- 상태: 수정·설치 앱 재검증 완료
- 흐름: 인사이트 `신선도` 검토 → 설정 → EN 전환 → 같은 검토 계속
- 관측 현상: 설치 앱에서 `/ko/ontology/insights/?tab=freshness`와 선택된
  `신선도` 탭을 만든 뒤 EN을 선택하면 `/en/ontology/insights/`로 이동해
  query가 사라지고 기본 `DO NEXT` 탭이 열렸다. 설정 시트는 닫히고 포커스는
  HTML 문서 루트로 이동했다.
- 사용자 문제: 언어는 같은 과업의 표현만 바꾸는 제어인데 현재 검토 대상과
  위치를 함께 버려, 사용자가 다시 신선도 탭을 찾아야 한다.
- 사용자 순간: 다국어 팀원이 같은 온톨로지 사실·필터·선택 상태를 다른
  언어로 확인하거나 화면을 공유하는 순간이다.
- 현재 대안: 언어 전환 뒤 사라진 query 상태를 기억해 같은 탭·노드·필터를
  수동으로 다시 연다.
- 온톨로지·에이전트 가치: 어권이 바뀌어도 같은 vault facts와 decision
  context를 가리켜야 사람과 에이전트의 인계가 동일한 상태를 재현한다.
- 최소화: 화면·토큰·자산·모션은 바꾸지 않는다. locale path segment만
  교체하되 클릭 순간의 raw query와 hash를 그대로 붙이고
  `router.replace`로 히스토리 증가 없이 전환한다.
- 검증 계획: locale-prefixed/non-prefixed와 trailing slash, 중복 query,
  Unicode/reserved value, hash를 pure helper 테스트로 고정한다. 설치 앱에서
  KO freshness → EN freshness → KO freshness 왕복 후 URL·선택 탭·표시
  facts·`documentElement.lang`·locale `aria-pressed`가 같은 과업을 유지하는지
  확인한다. 설정 닫힘과 문서 루트 포커스는 별도 접근성 잔여 이슈로 기록한다.
- 수정: locale segment만 교체하는 `buildLocaleTarget`에 클릭 순간의
  `window.location.search`·`hash`를 전달한다. URLSearchParams 재직렬화를
  피했기 때문에 중복 key 순서와 원래 인코딩도 그대로 남는다.
  `router.replace(target, { scroll: false })`로 history와 검토 위치를 늘리거나
  초기화하지 않는다.
- 회귀 증거: `LocaleSwitch.test.tsx` 7개가 raw query/hash, 중복 key,
  Unicode/reserved encoding, locale-prefixed/non-prefixed, `/en`·`/en/`·`/`
  trailing slash와 실제 replace 인수를 고정한다. 설정 통합 테스트를 포함한
  집중 테스트는 `2 파일 · 23개`, TypeScript, touched ESLint, production
  build와 desktop deploy가 통과했다.
- 설치 앱 증거: `/Applications/Ontology Atlas.app` 1512×917에서
  `/ko/ontology/insights/?tab=freshness`의 `신선도 12주`와
  `11 개념 · 10 관계 · 1 도메인`을 확인한 뒤 설정에서 EN을 선택했다.
  `/en/ontology/insights/?tab=freshness`, `FRESHNESS 12W`,
  `11 Concepts · 10 Relations · 1 Domains`가 유지됐고, 설정을 다시 열었을
  때 EN은 `aria-pressed=true`, KO는 false였다. KO로 되돌린 뒤에도 같은
  query·신선도 탭·세 사실이 복구됐다.
- 잔여 판정: locale navigation 뒤 설정 시트가 닫히고 포커스가 새 문서의
  HTML root로 가는 현재 동작은 trap이나 과업 상태 유실은 아니지만,
  전환 호출점 복귀가 더 나은지는 A20 접근성·reduced-motion sweep에서
  별도로 판정한다.
- PO·디자인 판정: **Build and verify**

### UX-023 — 설치 앱 검증기가 현재 Atlas 셸·canvas-v2 선택 맥락을 오판

- 심각도: `S4`
- 상태: 수정·설치 앱 재검증 완료
- 흐름: 외부 27-inch 모니터의 설치 앱에서 `/ko/topology/`를 네 폭으로
  재배치 → 프로젝트 노드 선택 → macOS `동작 줄이기` ON/OFF → 동일 선택
  동작 녹화·검증
- 관측 현상: 현재 한국어 셸은 제품 이름을 `Atlas`로 표시하고
  canvas-v2는 `TopologyV2DetailPanel`을 선택 노드의 읽기 표면으로 쓰지만,
  검증기는 `온톨로지|Ontology` 브랜드와 폐기된
  `topology-node-popover`만 인정했다. 실제 최신 화면·선택 맥락이 정상이어도
  설치 앱 증거가 실패했고, OS의 reduced-motion 상태도 payload에서 판정할
  수 없었다.
- 사용자 문제: 감사기가 현재 제품보다 뒤처지면 실제 UI 결함과 검증기
  false negative를 구분할 수 없어, 반응형·모션 품질을 릴리스 근거로
  신뢰할 수 없다.
- 사용자 순간: 14-inch급 compact 폭부터 외부 모니터 wide 폭까지 같은 지도를
  읽고, 선택 노드에 초점을 옮기거나 macOS 접근성 설정을 켠 상태에서 작업을
  계속하는 순간이다.
- 현재 대안: 자동 증거를 무시하고 단일 스크린샷이나 육안 기억으로 현재
  선택·주의 계층·축소 모션 여부를 추정한다.
- 온톨로지·에이전트 가치: 현재 선택한 canonical `kind:slug`, 보조 상세
  표면, 주의 계층과 OS 모션 선호가 같은 payload에 남아 사람의 화면과
  에이전트 검증이 동일한 사실을 가리킨다.
- 최소화: 사용자에게 보이는 레이아웃·색·카피·모션은 바꾸지 않는다.
  현재 panel에 선택 노드 identity/role 마커를 추가하고, WebView probe가
  실제 `matchMedia("(prefers-reduced-motion: reduce)")` 결과를 보고하게
  하며, 필요한 감사에서만 `--require-webview-reduced-motion`을 켜
  fail-closed로 판정한다.
- 디자인 계약: 선택된 지도 노드는 `active focus`, 오른쪽 상세는
  `supporting detail`, 명령 크롬은 `selected-node-inspector`다. compact에서
  utility label을 줄이고 wide에서 복원하는 기존 단계형 계약을 유지하며,
  새 장식·전환·토큰을 만들지 않는다.
- 반응형 증거: `/Applications/Ontology Atlas.app`의 실제 WebView를
  1100×768, 1512×885, 1920×917, 2560×917로 검증했다. 네 폭 모두
  card overlap, fixed-surface overlap, card/fixed overlap, clipped card,
  transient surface가 `0`이었다. 1100에서는 compact label, 1512에서는
  workspace/concept label, 1920/2560에서는 전체 utility label·검색이
  단계적으로 복원됐다. 설치 앱의 현재 세로 상한은 917px이므로
  1920×1080·2560×1440 요청은 폭 계약을 증명하되 전체 물리 높이를
  채우지는 않는다는 한계도 함께 기록한다.
- 모션 증거: 외부 모니터에서 각 5초·30fps로 같은 프로젝트 → 예시 영역
  선택을 녹화하고 전체 앱 프레임을 비교했다. 일반 모션은 69–76번의
  8프레임(약 267ms)에 걸쳐 연속 보간됐고 프레임 차이
  `mean 1.0457 · CV 0.164 · min 0.7902 · max 1.2562`, stall/spike `0`이었다.
  축소 모션은 69번 한 프레임만 크게 바뀌고 다음 프레임부터 정착했으며
  전환 뒤 10프레임 평균 차이는 `0.0152`였다. 비교 strip에서도 일반 모션의
  연속 카메라 이동과 축소 모션의 즉시 정착이 각각 확인됐다.
- fail-closed 증거: macOS `동작 줄이기` OFF에서 새 검증 플래그는
  `WebView did not report reduced motion from the installed macOS preference`로
  실패했다. ON에서는 `topologyV2PrefersReducedMotion: true`,
  `topologyV2DetailPanelNodeId: "project:project"`, visible detail,
  `focus-state`, `selected-node-inspector`, overlap/clipping `0`으로 통과했다.
  감사 뒤 시스템 설정은 OFF로 원복했다.
- 회귀 증거: 설치 앱 payload/CLI 계약 `9개`, v2 detail panel 계약 `52개`,
  TypeScript가 통과했다. 한국어 Atlas 셸, v2 선택 identity·주의 계층,
  reduced-motion ON/OFF 기대를 테스트로 고정한다.
- 독립 디자인 검토: Design Guardian이 attention hierarchy, token drift,
  일반/축소 모션, 네 폭 반응형, 설치 앱 payload와 fail-closed 계약을
  재검토했고 차단 이슈 없이 승인했다.
- PO·디자인 판정: **Build and verify**

### UX-024 — 설정에서 언어를 바꾸면 포커스가 새 문서 루트로 유실됨

- 심각도: `S3`
- 상태: 수정·설치 앱 재검증 완료
- 흐름: 지도 설정 열기 → KO/EN 언어 전환 → 설정을 다시 열어 같은 작업 계속
- 관측 현상: URL·선택 탭·표시 facts는 A19에서 보존됐지만 locale segment
  navigation이 설정 시트를 닫은 뒤 AX focused element가 새 WebView의 HTML
  document root였다.
- 사용자 문제: 언어 버튼은 같은 화면의 표현만 바꾸는 제어인데, 키보드
  사용자는 전환 뒤 설정 호출점까지 주요 내비게이션과 지도 제어를 다시
  순회해야 한다.
- 사용자 순간: 동일 온톨로지 화면을 다른 어권으로 확인한 뒤 보기 모드,
  INDEX 기본 상태, 작업공간 또는 AI 연결 설정을 계속 조정하는 순간이다.
- 현재 대안: Shift+Tab/Tab으로 새 문서 전체를 다시 탐색하거나 포인터로
  톱니를 다시 찾는다.
- 온톨로지·에이전트 가치: query/hash가 보존한 task context와 키보드의
  interaction context가 함께 유지돼, 사람의 재현 경로와 에이전트가 설명하는
  현재 화면이 어권 전환 뒤에도 같은 상태를 가리킨다.
- 최소화: 시트를 route 사이에 억지로 유지하거나 새 알림·모션·UI를 만들지
  않는다. `LocaleSwitch`가 navigation 직전 target locale을 host callback으로
  알리고, `AppSettingsMenu`가 현재 trigger variant와 함께 짧은 session
  intent를 기록한다. 새 어권에서 같은 variant의 닫힌 설정 호출점만 focus한다.
- 경계: 지도는 lg+ rail trigger와 compact chrome trigger가 동시에 mount될
  수 있으므로 locale만 기록하면 숨은 진입점으로 잘못 복귀할 수 있다.
  intent는 `rail-tile` / `chrome-tile` / `header-pill`까지 일치해야 소비되며,
  10초가 지난 stale intent는 폐기한다.
- 디자인 계약: 설정 modal은 route navigation에서 닫히고 background
  workspace가 다시 `base task`를 소유한다. 포커스는 그 화면의 동일 설정
  `return point`로 복귀한다. 시각 hierarchy, scrim, panel motion, tokens,
  responsive placement는 변경하지 않는다.
- 회귀 증거: LocaleSwitch callback이 `router.replace`보다 먼저 실행되는
  순서, 새 어권 remount의 닫힌 설정 trigger 복귀, rail/chrome 동시 mount에서
  exact variant 복귀를 `2 파일 · 26개` 집중 테스트로 고정했다. TypeScript와
  touched ESLint도 통과했다.
- 설치 앱 증거: `/Applications/Ontology Atlas.app`의 `/ko/topology/`에서
  rail 설정을 열어 EN을 선택했다. 시트가 닫힌 `/en/topology/`의 AX focused
  element는 `summary Open app settings`, `Value: off`였고 해당 호출점으로
  설정을 즉시 다시 열 수 있었다. KO로 되돌린 뒤에도 focused element가
  `summary 앱 설정 열기`, `Value: off`로 복귀했다.
- PO·디자인 판정: **Build and verify**

### UX-025 — 설정 modal의 마지막 Tab이 열린 시트 뒤 HTML 문서로 이탈

- 심각도: `S4`
- 상태: 수정·설치 앱 재검증 완료
- 흐름: 지도 설정 열기 → 닫기부터 AI 에이전트 연결까지 Tab 순회 →
  마지막에서 Tab → 첫 제어에서 Shift+Tab → Escape
- 관측 현상: 설치 앱에서 10번째 focusable인 `AI 에이전트 연결`까지 이동한
  뒤 Tab을 한 번 더 누르면 시트와 scrim은 열린 채 AX focused element가
  배경 `HTML content`로 바뀌었다.
- 사용자 문제: 화면은 modal이라고 말하지만 키보드는 차단된 배경으로
  이동해, 현재 위치와 다음 Tab의 결과를 예측할 수 없다. 배경은 scrim 아래라
  focus ring도 읽기 어렵다.
- 사용자 순간: 언어·보기·INDEX·vault·AI 연결 설정을 포인터 없이 훑고
  처음이나 마지막 제어로 되돌아가려는 순간이다.
- 현재 대안: 포커스가 사라진 것처럼 보이면 Escape로 시트를 닫고 다시
  열거나 Shift+Tab을 반복해 우연히 modal 안으로 돌아온다.
- 온톨로지·에이전트 가치: 사람의 `blocking task` 경계와 자동화가 읽는
  dialog 경계가 일치해야 설치 앱의 설정 흐름을 재현 가능한 계약으로
  설명할 수 있다.
- 최소화: 새 컴포넌트·카피·토큰·모션을 만들지 않는다. 이미 투어와 vault
  안내가 쓰는 공용 `useDialogFocusTrap`을 현재 panel ref에 연결한다.
  initial focus와 Tab/Shift+Tab만 공용 계약이 소유하고, 기존 `closePanel`이
  호출점 복귀를 계속 소유한다. 그래서 ⌘K demotion은 palette에 포커스를
  양보하는 기존 예외를 유지한다. panel은 `aria-modal="true"`를 함께 선언해
  스크린리더의 virtual navigation에도 같은 blocking 경계를 전달한다.
- 디자인 계약: 설정 시트는 `blocking task`, 내부 제어가 유일한
  interaction layer다. background workspace는 보이되 focusable하지 않으며,
  마지막→닫기와 닫기→마지막이 같은 sheet 안에서 순환한다.
- 회귀 증거: AppSettingsMenu 통합 테스트가 `role=dialog` +
  `aria-modal=true`, panel initial focus, forward/reverse wrap을 고정한다.
  locale 연속성 회귀까지 포함한 집중
  테스트는 `2 파일 · 27개`, TypeScript와 touched ESLint가 통과했다.
- 설치 앱 증거: `/Applications/Ontology Atlas.app`에서 panel container
  → `설정 닫기` → EN → KO → 개발 → 일반 → 펼침 → 접힘 → 바꾸기 →
  문서함 → `AI 에이전트 연결` 순으로 Tab 이동했다. 다음 Tab은
  `설정 닫기`, 그 상태의 Shift+Tab은 `AI 에이전트 연결`로 돌아왔다.
  Escape 후에는 닫힌 `summary 앱 설정 열기`, `Value: off`에 복귀했다.
- PO·디자인 판정: **Build and verify**

### UX-026 — AI 설정 드릴인 진입이 열린 modal의 포커스를 문서 루트로 유실

- 심각도: `S4`
- 상태: 수정·설치 앱 재검증 완료
- 흐름: 설정 열기 → Tab으로 `AI 에이전트 연결` → Return → 상세 읽기 →
  Escape 또는 `설정으로 돌아가기`
- 관측 현상: 키보드로 root row를 활성화하면 그 버튼이 agent subview와
  교체되면서 AX focused element가 배경 `HTML content`가 됐다. 시트와
  `aria-modal=true`는 유지됐지만 Escape는 더 이상 details의 React
  keydown 경로에 도달하지 않았다.
- 사용자 문제: 사용자는 새 상세가 열렸다는 시각적 변화만 받고 읽기 시작점과
  복귀 수단을 키보드·스크린리더에서 잃는다. modal을 닫거나 root로 돌아가는
  예측 가능한 키 경로도 끊긴다.
- 사용자 순간: vault의 MCP/Codex 설정 준비 상태를 확인하거나 복사 패킷을
  가져오기 위해 설정의 agent 상세로 들어가는 순간이다.
- 현재 대안: Tab을 한 번 더 눌러 focus trap이 modal 첫 제어를 구조할 때까지
  기다리거나 포인터로 뒤로가기/닫기를 다시 찾는다.
- 온톨로지·에이전트 가치: AI 연결 상세는 사람과 agent의 handoff를 설명하는
  표면이므로, UI 안의 root↔detail 관계 자체도 재현 가능한 방향성과 복귀
  계약을 가져야 한다.
- 최소화: subview·copy·layout·모션은 바꾸지 않는다. 진입 row와 back
  button에 ref를 두고 view state를 바꾼 다음 DOM이 교체된 tick에 진입은
  back button, 복귀는 원래 agent row에 `preventScroll` focus한다.
- 디자인 계약: agent subview는 설정 modal 안의 `nested task`; 헤더의
  `설정으로 돌아가기`가 첫 `active focus`다. root로 돌아오면 그 nested
  task를 연 `AI 에이전트 연결` row가 `return point`를 다시 소유한다.
- 회귀 증거: controlled-open Escape ladder 테스트가 agent row 활성화 →
  back focus → 첫 Escape → root row focus → 두 번째 Escape close 요청
  순서를 고정한다. A21/A22까지 포함한 집중 테스트는 `2 파일 · 27개`,
  TypeScript와 touched ESLint가 통과했다.
- 설치 앱 증거: `/Applications/Ontology Atlas.app`에서 root sheet의
  `AI 에이전트 연결`을 Return으로 열자 AX focused element가
  `button 설정으로 돌아가기`가 됐다. Escape 뒤에는 root의
  `button AI 에이전트 연결`, 두 번째 Escape 뒤에는 닫힌
  `summary 앱 설정 열기`, `Value: off`로 복귀했다.
- PO·디자인 판정: **Build and verify**

### UX-027 — 설정에서 문서함으로 이동하면 새 화면의 읽기 시작점을 잃음

- 심각도: `S3`
- 상태: 수정·설치 앱 재검증 완료
- 흐름: 지도 설정 열기 → Tab으로 `문서함` → Return → 문서함 과업 시작
- 관측 현상: 설치 앱에서 `/ko/topology/`의 설정 문서함 링크를 Return으로
  실행하면 `/ko/docs/?slug=README`로 정상 이동하지만 AX focused element는
  새 WebView의 `HTML content`였다. 새 화면의 `문서함` h1이나 main landmark는
  읽기 시작점을 소유하지 않았다.
- 사용자 문제: 키보드·스크린리더 사용자는 화면이 바뀌었다는 사실과 새 과업의
  제목을 즉시 확인하지 못하고, skip link와 전역 내비게이션부터 다시 순회해야
  문서함 제어에 도달한다.
- 사용자 순간: 지도에서 vault 문서를 직접 확인하거나 작업공간 폴더·문서 상태를
  이어서 관리하려고 설정의 `문서함` CTA를 실행한 순간이다.
- 현재 대안: 화면 전환을 시각적으로 추정한 뒤 Tab을 반복하거나, 브라우저의
  문서 루트부터 새 화면의 h1을 수동으로 다시 탐색한다.
- 온톨로지·에이전트 가치: 사람의 route 전환과 에이전트가 재현하는 URL이
  동일한 새 surface의 제목·과업 경계를 가리켜야 handoff가 어디서 시작되는지
  명확하다.
- 최소화: query/hash만 바뀌는 같은 surface와 locale만 바뀌는 같은 과업은
  건드리지 않는다. 실제 pathname이 다른 client navigation이 기존 포커스를
  잃었거나, 호출점이 native navigation에도 남는 임시 `focus=main` 의도를
  붙인 경우에만 새 page h1(없으면 `#main`)을 programmatic focus 대상으로
  삼는다. 표식은 소비 즉시 URL에서 제거한다. 새 카피·토큰·모션·레이아웃은
  추가하지 않는다.
- 디자인 계약: route가 바뀌면 새 surface가 `base task`를 소유하고 그 h1이
  첫 `active focus`다. URL query로 문서·노드 선택만 바뀌는 경우에는 현재
  세부 과업의 포커스를 유지한다. locale 전환은 A21의 동일 설정 return point
  계약을 우선한다.
- 수정: 영속 `AppShell`의 `RouteFocusManager`가 pathname surface를 비교하고,
  설정 문서함/agent workflow CTA는 session intent와 native-navigation-safe
  `focus=main` query를 함께 남긴다. 정적 export의 Suspense와 로컬 vault
  자동 복원이 shell보다 늦게 끝나므로 첫 `#main`을 즉시 잡지 않는다.
  DOM이 120ms 안정된 뒤 page h1을 focus하고, 최대 2초까지만 관찰한다.
  destination이 이미 main 내부 제어나 `aria-modal` dialog에 포커스를 둔
  경우에는 그 소유권을 덮지 않는다.
- 회귀 증거: 초기 mount 무개입, pathname 전환, h1 없는 main fallback,
  workbench header의 main 바깥 h1, query-only·locale-only 무개입,
  destination-owned focus, shell remount session intent, native URL intent,
  Suspense 지연 및 loading→ready surface 교체를 route manager 테스트 10개로
  고정했다. 설정 link intent와 A21–A23 회귀를 포함한 집중 테스트는
  `3 파일 · 38개`, TypeScript와 touched ESLint가 통과했다.
- 설치 앱 증거: `/Applications/Ontology Atlas.app`의 `/ko/topology/`에서
  설정을 열고 Tab으로 `문서함` 링크를 선택해 Return을 실행했다. 링크의
  native 목적지는 `/ko/docs/?focus=main`이었고, 로컬 vault가 복원된 최종
  URL은 표식이 제거된 `/ko/docs/?slug=README`였다. AX focused element는
  `heading 문서함, Value: 1`이어서 새 surface의 읽기 시작점을 정확히
  소유했다. production build, desktop app build/deploy도 통과했다.
- PO·디자인 판정: **Build and verify**

### UX-028 — 활성 문서 탭을 키보드로 닫으면 포커스가 앱 루트로 유실

- 심각도: `S3`
- 상태: 수정·설치 앱 재검증 완료
- 흐름: 문서함 지도 문서 선택 → 열린 활성 탭의 닫기 버튼에 Tab 이동 →
  Return → 왼쪽 우선 이웃 문서에서 작업 계속
- 관측 현상: 문서 선택과 범위 전환은 호출 행·탭 포커스를 유지했지만, 활성
  문서의 닫기 버튼을 Return으로 실행하면 해당 DOM이 제거된 뒤 AX focused
  element가 `HTML content`로 떨어졌다. URL과 본문은 이웃 문서로 정상
  전환됐으나 열린 문서 스트립의 현재 위치를 잃었다.
- 사용자 문제: 키보드·스크린리더 사용자는 새 활성 문서가 무엇인지 바로
  확인하지 못하고, 전역 내비게이션과 문서함 헤더를 처음부터 다시 순회해야
  워킹셋으로 돌아올 수 있다.
- 사용자 순간: 여러 ontology 근거 문서를 나란히 열고 검토하다 끝낸 문서를
  닫은 뒤 인접 문서의 판단을 이어가려는 순간이다.
- 현재 대안: URL·본문 변경을 시각적으로 추정한 뒤 Tab을 반복하거나 포인터로
  새 활성 탭을 다시 선택한다.
- 온톨로지·에이전트 가치: 사람이 읽는 활성 source record와 `?slug=`로
  에이전트에게 재현되는 문서가 바뀔 때, UI의 읽기 위치도 같은 워킹셋 문서를
  가리켜야 인계의 현재 근거가 분명하다.
- 최소화: 탭 수명·닫기 순서·URL·카피·토큰·모션은 바꾸지 않는다. 키보드
  activation(`click.detail=0`)으로 닫기 버튼이 제거된 경우에만 렌더 뒤
  authoritative 활성 탭 라벨에 `preventScroll` focus한다. 포인터 닫기는
  브라우저의 자연 포커스 정책을 유지한다.
- 디자인 계약: 열린 문서 스트립은 `working set`, 활성 탭은 닫기 뒤 이어질
  `active focus`다. 기존 왼쪽 우선·오른쪽 fallback 활성 규칙과 화면의
  `aria-current="page"` 진실원을 그대로 따른다.
- 회귀 증거: 탭 닫기 버튼에 포커스를 둔 뒤 활성 탭을 제거·이웃 활성화하는
  실패 테스트를 추가했고, docs tab state와 A24 query-only 무개입 경계를
  포함한 집중 테스트는 `4 파일 · 44개`, TypeScript와 touched ESLint가
  통과했다.
- 설치 앱 증거: `/Applications/Ontology Atlas.app`에서 활성
  `My ontology vault 탭 닫기`를 Return으로 실행하자 URL·본문이 왼쪽 탭이
  없어 오른쪽 이웃인 `감사 샘플 기능`으로 전환됐고, AX focused element도
  `button 감사 샘플 기능`이 됐다. production build와 desktop app
  build/deploy를 통과한 동일 코드다.
- PO·디자인 판정: **Build and verify**

### UX-029 — 전역 레일 이동과 공방 surface가 새 과업의 읽기 시작점을 잃음

- 심각도: `S4`
- 상태: 수정·설치 앱 재검증 완료
- 흐름: 문서함 또는 지도 → 전역 레일 `공방` Return → 중심 노드 과업 시작 →
  전역 레일 `프로젝트` Return → 프로젝트 목록 읽기
- 관측 현상: 설치 앱에서 전역 레일 링크를 키보드로 실행하면 URL과 화면은
  바뀌지만 AX focused element가 새 WebView의 `HTML content`였다. pathname
  변화만 보는 영속 셸 계약은 Tauri navigation/remount 경계에서 초기화됐고,
  공방은 skip link가 `#main`을 가리키면서도 실제 main landmark와 h1이 모두
  없어 명시적 포커스 의도도 소비할 대상이 없었다.
- 사용자 문제: 키보드·스크린리더 사용자는 전역 목적지를 선택하고도 새 과업의
  제목을 듣지 못하며, skip link와 전역 레일을 다시 순회해야 공방 검색·관계
  편집 또는 프로젝트 목록에 도달한다.
- 사용자 순간: 한 ontology 근거를 문서함에서 읽은 뒤 공방에서 관계를 보완하거나,
  공방 작업 뒤 프로젝트 단위 현황으로 이동하는 핵심 workspace 왕복이다.
- 현재 대안: 화면 변화를 시각적으로 추정하고 Tab을 반복하거나, 목적 화면에서
  보이는 제목·첫 제어를 포인터로 다시 선택한다.
- 온톨로지·에이전트 가치: 전역 레일 URL은 사람이 이동한 semantic surface와
  에이전트가 재현할 handoff 경계를 함께 가리킨다. 공방의 현재 중심 노드가
  h1이면 사람이 읽는 과업 제목과 에이전트가 편집할 focal node도 일치한다.
- 최소화: 레일 목적지·아이콘·카피·레이아웃·모션은 바꾸지 않는다. 모든 전역
  목적지 href에 기존 bounded `focus=main` 표식과 unmodified-primary session
  intent를 재사용하고, 공방 stage root만 `main#main`, 상단 현재 중심 노드명만
  h1으로 의미를 바로잡는다. modifier/new-tab 동작은 session intent를 남기지
  않고 URL 표식만 새 문서에서 소비한다.
- 디자인 계약: 전역 레일은 `surface switcher`, 도착 surface의 h1은 첫
  `active focus`다. 공방의 h1은 장식 제목이 아니라 현재 작업 중인 focal
  node이며, 전체 무대는 하나의 main task landmark다.
- 회귀 증거: 레일의 5개 목적지·context docs deep-link가 query를 보존하며
  native-safe 표식을 갖는지, primary activation만 session intent를 남기는지,
  공방이 `main#main`과 focal h1을 소유하는지 고정했다. RouteFocusManager
  경계까지 포함한 집중 테스트는 `3 파일 · 61개`, TypeScript와 touched
  ESLint가 통과했다.
- 설치 앱 증거: `/Applications/Ontology Atlas.app`의 `/ko/topology/`에서
  `공방` 링크가 `/ko/ontology/studio/?focus=main`을 가리키는 것을 확인하고
  Return으로 실행했다. 최종 URL은 표식이 제거된 `/ko/ontology/studio/`,
  AX focused element는 `heading 예시 기능, Value: 1`이었다. 이어 공방에서
  전역 레일 `프로젝트`를 Return으로 실행하자 AX focus가
  `heading 프로젝트, Value: 1`로 옮겨졌다. production build와 desktop
  app build/deploy를 통과한 동일 코드다.
- PO·디자인 판정: **Build and verify**

### A27 검증 메모 — 하단 탭바 route·safe-area 계약 유지

- 상태: 검증 완료, 수정 없음
- 흐름: 768px·900px web surface의 문서함 → 하단 탭바 `프로젝트` Return →
  프로젝트 제목 읽기 → 긴 문서의 스크롤 끝 → 1023/1024px breakpoint 왕복
- 관측 결과: 하단 탭 링크는 web client navigation에서 문서함 h1에서 프로젝트
  h1으로 포커스를 정상 인계했고, 선택 목적지의 `aria-current="page"`도 함께
  갱신됐다. 768px에서 document horizontal overflow는 `0px`였다.
- 가림 계약: 문서함 내부 스크롤러의 mobile bottom reserve는 계산된
  `68px`, 하단 탭바 높이는 `57px`였다. 스크롤 끝의 마지막 콘텐츠 bottom은
  탭바 top보다 위에 있어 실제 overlap은 `0px`였다.
- breakpoint 계약: 1023px에서는 하단 탭바만 `display:flex`, AppNavRail은
  숨김이었다. 1024px에서는 AppNavRail만 `display:flex`, 하단 탭바는 숨김이라
  전환 경계의 이중 내비·빈 구간이 없었다.
- 설치 앱 경계: 현재 macOS 창 최소 폭에서는 `<1024px` 하단 탭바 상태까지
  줄어들지 않는다. 따라서 실제 사용 가능한 설치 앱 폭은 A20/A26의 AppNavRail
  증거가 소유하고, 하단 탭바는 responsive-sweep web 증거가 소유한다.
- 최소화: 실제 과업 실패·가림·상태 불일치가 없으므로 href 표식이나 padding을
  추가하지 않는다. 공통 RouteFocusManager와 기존 reserve token을 그대로
  유지한다.
- PO·디자인 판정: **Do not build**

### UX-030 — 화면 밖 AI 연결 진입이 시트를 잃고 문서 루트로 포커스를 버림

- 심각도: `S3`
- 상태: 수정·설치 앱 재검증 완료
- 흐름: 프로젝트 목록 → 전역 레일의 미연결 AI 작업 타일 Return → 지형도
  이동과 연결 시트 열기 → Shift+Tab/Tab 순환 → Escape → AI 타일 복귀
- 관측 현상: 설치 앱에서 미연결 타일을 키보드로 실행하면 프로젝트에서
  지형도로 URL은 이동했지만 연결 시트가 열리지 않았고, AX focused element가
  지형도 `HTML content`로 떨어졌다. 레이아웃 provider의 `wantOpen` state
  commit보다 static-export/WebView route 전환이 먼저 완료되는 경계였다.
- 사용자 문제: 사용자는 “AI 연결 안내 열기”를 실행했지만 결과 화면에서
  아무 안내도 받지 못하고, 다시 레일 타일까지 탐색해야 한다. 보조기술에는
  동작이 실패했는지 화면만 바뀐 것인지 구분할 단서도 없다.
- 사용자 순간: 다른 workspace surface에서 에이전트 상태가 비어 있음을 보고
  즉시 MCP 연결 방법을 확인하려는 첫 연결 순간이다.
- 현재 대안: 지형도 도착 후 AI 타일을 다시 찾아 재실행하고, 시트가 열려도
  배경으로 빠지는 Tab과 닫기 뒤 문서 루트 포커스를 수동으로 복구한다.
- 온톨로지·에이전트 가치: 사람의 “에이전트 연결” 의도와 에이전트가 읽을
  vault 등록 스니펫이 한 번의 행동으로 이어져야 공동 의미 계층의 시작점이
  신뢰를 얻는다.
- 최소화: 시트의 카피·정보 구조·토큰·기존 scrim/패널 모션은 바꾸지 않았다.
  지형도 밖 전환에만 일회성 `agentConnect=1` marker를 붙이고 도착 즉시
  소비·제거한다. 기존 launcher state는 `aria-expanded` 진실원으로 유지한다.
- 디자인 계약: 연결 시트가 열리면 첫 동작인 닫기 버튼이 `active focus`를
  소유하고, Tab/Shift+Tab은 시트 안에서 순환한다. 닫으면 살아 있는 원래
  트리거로, route 전환으로 사라졌다면 상주 AI 타일로 복귀한다.
- 회귀 증거: route marker가 다른 query/hash를 보존하며 한 번만 소비되는지,
  사라진 트리거의 AI 타일 fallback, 살아 있는 시작 체크리스트 CTA 복귀,
  자동 안내의 안전한 AI 타일 복귀, 시트 첫 포커스·양방향 Tab trap·Escape를
  새 테스트 6개로 고정했다. AppNavRail·agent model·RouteFocusManager까지
  포함한 집중 테스트는 `5 파일 · 33개`, TypeScript·touched ESLint(오류 0)와
  production build가 통과했다.
- 설치 앱 증거: `/Applications/Ontology Atlas.app`의 `/ko/projects/`에서
  AI 타일에 키보드 포커스를 두고 Return을 실행했다. 최종 URL은 일회성
  marker가 제거된 `/ko/topology/`, 연결 시트가 `aria-modal` dialog로
  열렸고 AX focused element는 `button 닫기`였다. Shift+Tab은 마지막
  `인계 텍스트 복사`, 다음 Tab은 `닫기`로 순환했다. Escape 뒤 AX focus는
  `이 문서함에 아직 새 AI 작업 상태가 없습니다.` AI 타일로 복귀했다.
  같은 코드로 desktop app build/deploy를 통과했다.
- PO·디자인 판정: **Build and verify**

### UX-031 — 설치 앱 관계 검증이 사용자의 저장 vault에 의존해 재현성을 잃음

- 심각도: `S3`
- 상태: 수정·설치 앱 재검증 완료
- 흐름: 최신 HEAD 배포 → 설치 앱 재실행 → 1920×1080
  `domain:views` 선택 관계 검증
- 관측 현상: 앱이 이전에 저장된 11개 노드 테스트 vault를 정상 복원했다.
  검증기는 dogfood 전용 `domain:views`를 URL로 요청했지만 현재 vault에는
  그 노드가 없어 `노드를 찾을 수 없습니다: domain:views` toast를 냈고,
  관계 라벨 클릭 proof가 실패했다. WebView 자체는 1920×917로 로드됐다.
- 사용자 문제: 사용자 상태를 보존해야 하는 설치 앱과 고정 fixture를 필요로
  하는 릴리스 검증이 같은 저장소를 공유한다. 실제 렌더 회귀와 검증 입력
  불일치를 구분할 수 없어 wide 검증 결과를 신뢰하기 어렵다.
- 현재 대안: 검증 전 사람이 원하는 vault를 다시 선택하거나, 실패 후 payload를
  열어 현재 vault census와 대상 slug를 수동 대조한다.
- 온톨로지·에이전트 가치: 관계 검증의 입력 vault와 대상 slug가 증거에 함께
  고정돼야 사람과 에이전트가 같은 의미 그래프를 검증했다고 말할 수 있다.
- 수정: 제품의 저장 vault 복원과 사용자 IndexedDB는 바꾸지 않았다. 직접
  실행되는 WebView 검증 창만 Tauri `incognito` 저장소를 쓰며,
  `--webview-fixture-vault=docs/ontology`가 그 격리 저장소의 현재 vault를
  명시한다. 현재 canvas-v2 관계 선택은 퇴역한 DOM 관계 라벨 대신 기존
  `onSelectEdge` 흐름을 호출하는 검증 이벤트로 재현한다.
- 설치 앱·Computer Use 증거: Codex Computer Use AX 트리는
  `tauri://localhost/ko/topology/?p=domain%3Aviews&mode=focus`, INDEX의
  `11 개념 · 10 관계 · 1 도메인`, disabled `블록 가져오기`, not-found
  toast를 함께 읽어 최초 실패를 확인했다. 격리 저장소만 적용했을 때는
  storefront sample 31개 노드가 열리는 것도 측정해 fixture 명시가 필요함을
  확인했다. 최종 실행은 dogfood vault 289개 개념·448개 관계·6개 도메인을
  읽고 선택 관계 dialog의 역할·관계 문장·양 끝점·출처를 보고했다.
  Computer Use가 별도로 발견한 첫 방문 투어와 관계 inspector의 주의 경쟁도
  검증 저장소에서만 tour를 건너뛰고 payload가 재출현을 실패 처리하도록
  닫았다. 1920·2560 자동 WebView 증거와 2560 Computer Use 화면을 통과했고,
  검증 앱 종료 뒤 일반 실행에서 원래 11개 노드 사용자 vault가 그대로
  복원돼 사용자 저장소 비변경을 확인했다.
- PO·디자인 판정: **Build and verify**

### UX-032 — 설치 앱의 블록 가져오기가 폴더 선택 미지원으로 비활성화됨

- 심각도: `S2`
- 상태: 수정·설치 앱 재검증 완료
- 흐름: 저장된 local vault 복원 → 지형도 INDEX 하단 → `블록 가져오기`
- 관측 현상: 설치된 macOS 앱의 AX 트리에서 버튼이 disabled이고 도움말은
  `이 환경은 폴더 선택을 지원하지 않아요`였다. 문서함·공방·인사이트·프로젝트·
  기록은 같은 Computer Use 세션에서 정상 진입했다.
- 사용자 문제: 로컬 파일을 주 진실원으로 삼는 설치 앱에서 가져오기만
  브라우저 capability 부재처럼 보인다. 의도된 제한인지 bridge 누락인지
  화면만으로 구분할 수 없다.
- 최소화: 기능을 바로 추가하지 않는다. 현재 버튼이 요구하는 파일/폴더
  capability와 Tauri 경로를 구조적으로 확인하고, 의도된 제한이면 정확한
  안내와 대체 경로를 제공하며, bridge가 이미 있으면 기존 경로를 재사용한다.
- 설치 앱·Computer Use 증거: 1100px 창과 macOS 전체화면에서 동일한 disabled
  상태를 읽었다. 다른 전역 surface의 h1과 핵심 액션은 AX 트리에 정상 노출됐다.
- 조사 결과: 일반 vault 열기는 이미 `pick_vault_directory` → 재귀 목록/읽기/
  쓰기 → `FileSystemDirectoryHandle` 호환 shim을 사용한다. 블록 UI 두 곳만
  `showDirectoryPicker()` 존재를 직접 검사해 설치 앱 경로를 차단하고 있었다.
  새 파일 포맷·권한·저장소 없이 같은 bridge를 재사용할 수 있다.
- PO pass:
  - 사용자/순간: 설치 앱에서 열린 vault에 다른 온톨로지 블록을 병합하려는 사람.
  - 현재 대안: CLI `ontology-atlas import`로 이탈하거나 브라우저 환경을 다시 연다.
  - 문제: 설치 앱이 실제로 가진 폴더 capability를 없다고 말해 로컬-퍼스트
    작업 흐름과 제품 신뢰를 끊는다.
  - 온톨로지·에이전트 가치: 승인 전 dry-run 병합 프리뷰와 기존 vault write
    경로를 유지하므로, 사람의 선택과 에이전트가 읽는 같은 markdown graph가
    계속 단일 진실원이다.
  - 범위/단순화: 새 가져오기 UI나 Tauri 권한을 만들지 않는다. 기존 native
    picker와 FSA shim에 필요한 iterator 계약만 보강하고 가져오기·내보내기
    양쪽에서 같은 선택 함수를 쓴다.
  - 검증: bridge 단위 테스트, import/export UI 회귀 테스트, TypeScript 및
    desktop gate, `/Applications/Ontology Atlas.app` 재배포 뒤 Codex Computer
    Use로 enabled 상태와 native picker 진입을 확인한다.
- 디자인 pass:
  - attention winner: INDEX의 기존 `블록 가져오기` 행. 새 패널·배지·모션은 없다.
  - 상태 계약: vault 없음=disabled, 지원 런타임=enabled, 취소=상태 무변,
    선택=기존 병합 프리뷰, 승인 전 쓰기 0.
  - 반응형/14-inch 규칙: 기존 한 줄 행과 병합 다이얼로그의 geometry를 바꾸지
    않아 1100px·14-inch·1920·2560 계약을 그대로 유지한다.
  - graph/agent 계약: `.md`와 `block-manifest.json`만 읽고 기존 `createDoc`
    경로로 쓰며 CLI `import` 대체 경로도 유지한다.
- 회귀 증거: block import/export + Tauri shim 집중 테스트 31개, desktop
  bridge Vitest 35개와 Rust 70개, TypeScript, production static build,
  `desktop:check`, 설치 앱 launch/WebView 검증이 통과했다.
- 최종 설치 앱 증거: 최신 production 앱을
  `/Applications/Ontology Atlas.app`에 배포했다. Codex Computer Use AX
  트리에서 INDEX의 `블록 가져오기`가 enabled이고 도움말이
  `블록 폴더를 골라 병합 미리보기 열기`임을 확인했다. 클릭하면 같은 문구를
  제목으로 가진 macOS native picker가 열렸고, 테스트 vault 선택 뒤
  `파일 11개 · 새 노드 3 · 슬러그 충돌 8 · 3개 가져오기` 프리뷰가 나타났다.
  `취소` 뒤 프리뷰가 닫히고 원래 지도 상태로 돌아와 승인 전 쓰기 0도 유지됐다.
  연결된 `내 프로젝트` 영역에서는
  `이 영역의 원본 .md 를 블록 폴더로 내보내기` 버튼이 enabled였고,
  같은 목적 문구의 native picker를 연 뒤 취소하면 영역 상태로 정상 복귀했다.
- PO·디자인 판정: **Build and verify**

### UX-033 — AI 연결 화면이 현재 32도구 MCP를 24도구라고 안내

- 심각도: `S3`
- 상태: 수정·설치 앱 재검증 완료
- 흐름: 설정 → AI 에이전트 연결 → `고급 · 자세한 검증`
- 관측 현상: 실제 MCP와 문서 계약은 32도구(read 19 + write 13)인데
  첫 연결 증거 계약과 MCP 연결 모드 설명은 `index_project 포함 24개 tool`을
  두 번 표시했다. 복사되는 first-contact/모드 패킷도 같은 24도구를 말했다.
- 사용자 문제: 사용자는 `mcp-verify`의 32개 결과를 보고도 앱이 기대하는
  24개와 다르므로 연결 실패나 stale client로 오판할 수 있다. 에이전트에게
  복사하는 증거 패킷도 시작부터 현재 tool inventory와 어긋난다.
- 온톨로지·에이전트 가치: UI·복사 패킷·문서·실제 `tools/list`가 하나의
  32도구 계약을 말해야 같은 local vault를 읽는다는 첫 연결 증거가 성립한다.
- 최소화: 한·영 메시지, copy packet 상수, 현재 사실을 흉내 내는 테스트 fixture,
  활성 backlog/prototype의 숫자만 32로 맞췄다. 화면 계층·상호작용·모션·
  반응형 구조는 바꾸지 않았다.
- 회귀 증거: 한·영 메시지/ICU 계약 16개, 설정 패널·전역 검색·ontology tree
  직접 테스트 96개(63 + 33), 설정 패널을 포함한 desktop runtime 64개,
  TypeScript, `desktop:check`가 통과했다.
- 설치 앱 증거: 최신 production build를 `/Applications/Ontology Atlas.app`에
  다시 배포했다. Codex Computer Use로 설정 → AI 에이전트 연결 →
  `고급 · 자세한 검증`을 실제 클릭해, AX 트리의 첫 연결 증거와 MCP 연결 모드가
  모두 `index_project 포함 32개 tool`을 말하고 24도구 문구가 사라졌음을
  확인했다. 같은 상태의 스크린샷도 저장했다.
- PO·디자인 판정: **Build and verify**

### UX-034 — invalid MCP 설정 옆 주요 버튼이 이미 완료된 작업처럼 읽힘

- 심각도: `S2`
- 상태: 수정·설치 앱 재검증 완료
- 흐름: 저장된 local vault → 설정 → AI 에이전트 연결
- 관측 현상: 상단은 `설정 파일 0/3개 준비됨`과
  `.mcp.json 가 ontology-atlas MCP 설정이 아닙니다`를 경고하지만, 첫 주요
  버튼은 체크 아이콘과 `이 폴더에 .mcp.json 을 만들었어요`라는 완료형 문구다.
- 사용자 문제: 이미 설정을 만들었다는 상태 표시인지, 눌러서 설정을 만들거나
  복구하는 액션인지 구분하기 어렵다. 기존 파일을 덮어쓰지 않는다는 고급 설명과
  함께 읽으면 다음 행동은 더 모호해진다.
- 최소화: 측정 중에는 vault 파일을 쓰는 버튼을 누르지 않았다. 버튼 handler가
  새 파일 생성, invalid 파일 repair, 사용자 확인 중 무엇을 수행하는지 먼저
  확인하고, 상태라면 비버튼으로 내리며 액션이라면 명령형·결과 예고형 문구로
  바꾼다.
- 조사 결과: `AgentClientButtons`는 `.mcp.json`의 **존재**만 `ready`로
  전달받아 완료형 버튼을 초기화한다. 자동 생성 handler는 missing 파일만 쓰고
  기존 invalid 파일은 덮어쓰지 않지만, 호출이 resolve되면 컴포넌트가 검증
  결과와 무관하게 `done`으로 바꾼다. Codex 버튼도 같은 자동 생성 callback을
  공유해 invalid `.codex/config.toml`에서 같은 오판이 가능하다.
- PO pass:
  - observed phenomenon/user moment: 첫 연결을 준비하는 사용자가 invalid 경고와
    완료형 주요 버튼을 동시에 보고 다음 행동을 결정할 수 없다.
  - current alternative: 고급 영역에서 기존 파일 비덮어쓰기 설명을 읽고,
    올바른 템플릿을 찾아 수동으로 복사·교체한다.
  - ontology/agent value: UI의 설정 상태가 실제 local MCP/CLI handoff 준비
    여부와 같아야 read-first 연결 증거가 성립한다.
  - success/simplification: 새 화면·자동 overwrite·장식 motion 없이
    `missing=생성 action`, `invalid=교체 설정 복사 action`,
    `ready=비상호작용 상태`로 MCP/Codex를 같은 문법으로 나눈다.
  - verification: 세 상태 component test, 설정 패널 회귀, 번역 계약, 설치 앱
    AX 트리에서 invalid 경고와 교체 action을 함께 읽고 완료형 버튼 부재를
    확인한다.
- 디자인 gate: attention winner는 현재 설정 상태에 맞는 **다음 행동**이다.
  ready 확인은 support status로 내리고, invalid 교체는 utility action으로
  유지한다. 기존 control height·border·색 token을 재사용하며 레이아웃,
  반응형, graph semantics, motion은 바꾸지 않는다.
- 구현: shared `AgentClientButtons`가 MCP/Codex 각각의
  `missing | invalid | ready`를 받는다. missing만 기존 자동 생성 callback을
  실행하고, invalid는 vault-local 검증과 같은 `OATLAS_VAULT=.` 교체 JSON/TOML을
  복사하며, ready는 `role=status`인 비상호작용 행으로 표시한다. Cursor/VS Code
  절대경로 deep link용 JSON과 vault-local 교체 JSON도 분리했다.
- 설치 앱·Computer Use 증거: 수정 전 실제 앱에서 warning, `0/3`, 체크 아이콘
  완료형 버튼을 한 화면에서 재현했다. production 앱 재배포 뒤 같은 11문서
  invalid vault에서 설정 → AI 에이전트 연결을 다시 열자 AX 트리는 warning과
  `올바른 .mcp.json 복사`, `올바른 Codex 설정 복사`를 함께 보고했다.
  `이 폴더에 .mcp.json 을 만들었어요`와 `Claude Code에 연결`은 없었다.
- 회귀 증거: settings/shared sheet/model/config validation 39개, 번역 16개,
  TypeScript, focused ESLint가 통과했다. ready는 버튼이 아닌 status이고,
  invalid 교체 copy는 자동 생성 callback을 호출하지 않는 테스트를 포함한다.
- PO·디자인 판정: **Build and verify**

### UX-035 — 활성 문서와 프로토타입이 CLI 45·48·50명령을 동시에 주장

- 심각도: `S2`
- 상태: 수정·설치 앱 재검증 완료
- 흐름: CLI `--help` 현재 inventory 확인 → README·아키텍처·제품 방향·기술
  스택·다운로드/프로젝트 프로토타입·테스트 fixture 교차 검색
- 관측 현상: 실제 CLI 배너와 dogfood ontology는 52명령인데 활성 문서는
  45·48·50명령을 혼용했다. 다운로드 프로토타입은 MCP도 25도구
  (read 16 + write 9)로 표시했고 ontology-sync capability는 24도구를 말했다.
- 사용자 문제: 사용자는 설치/아키텍처 문서마다 서로 다른 제품 크기를 읽고,
  에이전트는 현재 dogfood 노드를 흉내 낸 오래된 fixture 제목을 다시 인용한다.
- 최소화: `node cli/src/index.mjs --help`의 `52 commands + MCP setup`과
  검증된 MCP 32도구(read 19 + write 13)를 현재 진실원으로 삼았다. 활성
  운영 문서·프로토타입·현행 사실 fixture만 교정하고 archive, changelog,
  숫자 보간/legacy parsing 자체를 시험하는 입력은 보존했다.
- 온톨로지·에이전트 가치: onboarding, architecture, product direction,
  ontology-sync skill이 동일한 현재 inventory를 말해 코드와 의미 계층 사이의
  숫자 드리프트를 막는다.
- 설치 앱·Computer Use 증거: 최신 main을 반영해 production app을 재배포한
  뒤 설정 → AI 에이전트 연결 → 고급 검증을 실제 클릭했다. AX 트리는
  `mcp-verify`와 MCP 연결 모드에서 모두 `index_project 포함 32개 tool`을
  표시했고, 이어서 열린 내장 Agent Graph Workflow는 CLI 52 commands,
  MCP 32 local tools, read 19 + write 13을 노출했다. 이 경로를 막던 source
  경계 문제는 UX-036에서 수정·재검증했다.
- PO·디자인 판정: **Build and verify**

### UX-036 — `기능 문서 열기`가 약속한 내장 문서 대신 local README를 엶

- 심각도: `S2`
- 상태: 수정·설치 앱 재검증 완료
- 흐름: 저장된 local vault → 설정 → AI 에이전트 연결 → 고급 검증 →
  `기능 문서 열기`
- 관측 현상: 버튼 도움말은 CLI/MCP/graph DB 차이와 실제 검증 명령을 설명하는
  Agent Graph Workflow를 연다고 말하지만, 실제 설치 앱은
  `/ko/docs/?slug=README`로 이동해 선택된 local vault의 README를 열었다.
- 사용자 문제: 첫 연결을 검증하는 개발자와 에이전트는 현재 product runbook을
  기대하지만 임의의 vault 안내 문서를 받는다. local README에 최신 명령 수나
  setup gate가 없으면 검증 경로가 조용히 끊긴다.
- 온톨로지·에이전트 가치: 앱이 가리키는 runbook과 복사되는 MCP/CLI handoff가
  같은 현재 계약을 말해야 사용자가 local vault를 안전하게 넘길 수 있다.
- 최소화: 새 화면을 만들지 않는다. Docs Vault의 source 선택과 deep-link
  계약을 확인해, 버튼이 실제 내장 `AGENT-GRAPH-WORKFLOW` 문서를 열도록 한다.
  local vault 선택과 열린 사용자 문서 탭은 손상하지 않아야 한다.
- 수정: 버튼은
  `/docs/?source=server&sample=dogfood&slug=AGENT-GRAPH-WORKFLOW`를 연다.
  URL source/sample override는 저장된 local vault·sample 선호를 바꾸지 않고,
  문서함에서 사용자가 source를 바꾸면 해제된다. 페이지가 선택한 bundled
  content를 viewer에도 직접 전달해 목록은 dogfood인데 본문은 storefront를
  읽는 source 분리도 막았다.
- 발견 순서: 첫 설치 앱은 local `README`로 이동했다. explicit server source를
  넣은 다음에는 저장된 31문서 storefront manifest에 runbook이 없어 빈 화면이
  됐다. dogfood sample을 지정한 뒤에는 목록·제목은 맞지만 viewer가 전역
  storefront content를 읽어 `Load failed`가 났다. 세 source 경계를 각각
  고정한 뒤에야 제목과 본문이 같은 runbook을 읽었다.
- 설치 앱·Computer Use 증거: `/Applications/Ontology Atlas.app`을 다시
  배포하고 설정 → AI 에이전트 연결 → 고급 → `기능 문서 열기`를 실제 클릭했다.
  AX 트리는
  `tauri://localhost/ko/docs/?source=server&sample=dogfood&slug=AGENT-GRAPH-WORKFLOW`,
  샘플 선택, 전체 158·가이드 62·지도 문서 96, `Agent Graph Workflow` 본문을
  보고했다. 본문에서 `Current as of 2026-07-27`, CLI 52 commands, MCP 32
  local tools, 19 read tools, 13 write tools, 96 nodes, 543 edges를 읽었고
  `Load failed`는 없었다.
- 회귀 방지: route/source/sample/persistence/viewer 테스트와
  `launch-docs-current.test.ts`가 packaged runbook의 CLI·MCP·dogfood 수치를
  실제 metadata/census와 대조한다.
- PO·디자인 판정: **Build and verify**

### UX-037 — 자동 AX probe가 Computer Use로 읽히는 창을 timeout으로 오판

- 심각도: `S2`
- 상태: 3차 보강·설치 앱 반복 재검증 완료
- 흐름: production app 직접 실행 → WebView·CoreGraphics window 확인 →
  foreground activation → System Events AX window 확인 → screenshot 저장
- 관측 현상: 설치 앱 WebView payload와 1.4MB window screenshot은 저장됐고
  Codex Computer Use는 같은 창의 URL·h1·내비·본문 AX 트리를 읽었지만,
  자동 proof는 `post-activation Accessibility probe timed out after 3000ms`를
  간헐적으로 보고했다. 수정 전 반복 실행은 첫 회에 같은 timeout으로 실패했다.
- 사용자 문제: maintainer와 agent가 실제 UI 회귀와 검증기 지연을 구분하려면
  CGWindow·WebView JSON·Computer Use를 매번 수동 대조해야 한다. 이 오판은
  설치 앱 증거의 fail-closed 신뢰를 낮춘다.
- 원인·1차 최소화: foreground/window probe가 PID·frontmost·window 수뿐 아니라
  WebView의 전체 `UI elements` 수도 System Events로 세고 있었다. 빠른 probe는
  window 사실만 읽도록 줄이고, 화면 문구는 이미 존재하는 bounded Swift AX
  text probe가 계속 담당한다. timeout을 늘리거나 권한 경고를 숨기지 않았다.
- 2차 관측·보강: 위 순회를 제거한 뒤에도 실제 `desktop:deploy:app`의 첫 내부
  proof에서 foreground activation 5초와 post-activation AX probe 3초가 함께
  timeout했고, 같은 배포의 다음 내부 proof는 `frontmost=true`로 성공했다.
  따라서 한 번의 일시적 macOS automation 지연만 최대 1회 다시 시도한다.
  두 시도가 모두 실패하면 `ok=false`와 시도별 원인을 그대로 남기며, timeout
  상향·권한 실패 은폐·무한 재시도는 하지 않는다. 로그는 `attempts`,
  `recovered`, `attemptErrors`를 구분한다.
- 3차 관측·보강: 최신 main을 병합해 다시 배포하자 activation 명령은 두 번
  모두 5초 timeout했지만, 각 시도 뒤의 AX probe는 최종 상태를
  `frontmost=true`로 확인했고 1.48MB window PNG도 저장했다. 목표는 activation
  명령의 반환문을 받는 것이 아니라 앱이 실제 foreground인지 증명하는 것이다.
  이제 AX의 최종 frontmost 행을 성공 진실원으로 삼고, activation command
  timeout은 `commandConfirmed=false` warning으로 보존한다. AX가 frontmost를
  확인하지 못하면 activation 명령이 성공했어도 계속 실패한다.
- 설치 앱·Computer Use 증거: 1차 수정 전 실패 실행과 동시에 Computer Use가
  `tauri://localhost/ko/` 첫 화면의 38개 AX 항목을 읽었다. 수정 뒤 실제 배포
  계약과 같은 8초 hold·foreground activation·window screenshot 경로를 5회
  반복했고 내부 전·후 proof 총 10회 모두 `frontmost=true`, AX window 1개,
  PNG 저장으로 통과했다. 2차 bounded retry 추가 뒤에는 같은 8초 경로 3회,
  내부 proof 6회가 모두 첫 시도(`attempts=1`)에 통과하고 각 771,968-byte PNG를
  저장했다. 이 반복에서는 실제 retry 회복이 발생하지 않았으며, 일시 실패 →
  2차 성공과 지속 2회 실패의 분기는 주입 단위 테스트로 각각 증명했다.
  3차 상태 판정 뒤 같은 8초 경로 2회·내부 proof 4회도 모두
  `frontmost=true`, `commandConfirmed=true`, 첫 시도에 통과했다. 이번 반복에는
  command-timeout warning이 재현되지 않았으므로, 그 분기는 직전 실제 배포
  로그와 주입 테스트를 구분해 근거로 남긴다. Computer Use는 같은 설치 앱의
  URL·공방 h1·CREATE 이름 입력을 계속 읽었다.
- 회귀 증거: foreground retry/최종 상태 단위 테스트 4개를 포함한 desktop
  verifier 22개, 전체 `test:desktop:check`, `desktop:check` 통과.
- 온톨로지·에이전트 가치: 사람이 보는 설치 앱과 agent가 읽는 자동 proof가
  같은 window 사실을 말하고, 텍스트 handoff는 더 강한 전용 AX 경로로 남는다.
- PO·디자인 판정: **Build and verify** — 렌더링·주의 계층 변화 없음

### UX-038 — 공방 진입 선택 뒤 키보드 포커스가 작업대로 이어지지 않음

- 심각도: `S2`
- 상태: 수정·설치 앱 재검증 완료
- 흐름: bare `/ontology/studio` → `기존 노드 강화` 또는 `새 노드 만들기`를
  키보드로 선택 → 첫 작업 계속
- 관측 현상: 진입 선택 다이얼로그의 기본 포커스와 Tab 순서는 정확했지만
  Return으로 선택한 뒤 포커스가 WebView의 HTML content root로 유실됐다.
  CREATE는 같은 route의 `?mode=create` query 전환이라 전역 route focus
  manager도 개입하지 않았다.
- 사용자 문제: 화면은 바뀌었는데 읽기·입력 시작점이 없으므로 키보드 사용자는
  긴 전역 내비와 작업대 컨트롤을 다시 Tab으로 훑거나 포인터로 돌아가야 했다.
- PO pass: 현재 대안은 재탐색뿐이고, 선택 직후의 다음 과업은 이미 결정돼 있다.
  새 표면·기능을 만들지 않고 ENHANCE는 현재 focal h1, CREATE는 이름 입력칸으로
  한 번만 인계하면 온톨로지 강화/생성 루프를 즉시 계속할 수 있다.
- 디자인 gate: attention winner는 새로 열린 공방 작업대다. ENHANCE는 현재
  개념 이름, CREATE는 첫 필수 입력이 읽기 시작점을 소유한다. 주의 계층·그래프
  의미·반응형 레이아웃·모션·MCP/CLI handoff는 바꾸지 않는다.
- 수정: 진입 선택에서 task intent를 넘기고, 무대가 마운트된 다음 프레임에
  `preventScroll` 포커스를 적용한다. CREATE query 전환에서는 전역 route
  focus보다 task-specific 이름 입력이 이기며, deep-link 진입 계약은 그대로다.
  첫 방문 안내가 열리면 blocking task가 일시적으로 포커스를 소유하고,
  `건너뛰기` 뒤 같은 목표로 복귀한다.
- 회귀 증거: `StudioCompass.test.tsx` 63개, TypeScript, focused ESLint 통과.
- 설치 앱·Computer Use 증거: 최신 production 앱을 외장 모니터에서
  1920×1080 ENHANCE와 2560×1440 CREATE로 각각 열었다. 키보드만 사용해
  진입 선택과 첫 방문 안내를 통과한 뒤 AX 포커스가 각각
  `터미널에서 쓰기` h1과 `새 노드 이름 — 예: 결제 취소` 입력칸에
  도착했으며, 두 폭 모두 잘림·충돌을 발견하지 못했다.
- PO·디자인 판정: **Build and verify**

### UX-039 — 수리 큐 총계가 가리키는 나머지 대상을 찾을 수 없음

- 심각도: `S3`
- 상태: 수정·설치 앱·자동 WebView 재검증 완료
- 흐름: 인사이트 → 할 일 → 수리 큐 총계 확인 → 모든 분리 섬·누락 연결 수리
- 관측 현상: 실제 감사 vault는 `분리된 섬 3`과 `누락된 연결 4`, 합계 `할 일 7`을
  말했지만 첫 번째 `누락된 연결` 대상 하나만 이름과 행동을 제공했다. 나머지
  여섯 건은 같은 화면에서 식별하거나 관계 편집·원문으로 이동할 수 없었다.
- 사용자 문제: 건강도 숫자가 문제의 존재만 알리고 수리 경로를 숨겼다. 사람은
  어떤 노드가 남았는지 찾기 위해 지도·문서를 전수 탐색해야 하고, agent에게도
  정확한 수리 대상을 넘길 수 없었다.
- 원인: `buildVaultHealthRepair`가 총계와 단일 `actionTarget`만 반환했고,
  `DoNextTab`도 그 한 행만 렌더링했다.
- PO pass: 사용 순간은 건강도 이상을 본 직후의 수리 시작이다. 현재 대안은
  수동 전수 탐색이며, 온톨로지 가치는 typed issue와 정확한 노드의 연결,
  agent 가치는 같은 대상을 관계 편집/문서 handoff로 받는 데 있다. 새 화면이나
  새 모드를 만들지 않고 기존 카드의 숨겨진 대상만 도달 가능하게 한다.
- 디자인 gate: attention winner는 수리 큐다. 첫 대상은 그대로 상시 노출하고,
  나머지는 같은 카드의 조용한 disclosure로 연다. 각 행은 `누락된 연결` 또는
  `분리된 섬` 유형과 노드 이름을 함께 보존하고, 목록은 `max-height`와 내부
  스크롤로 14-inch/1920/2560 레이아웃을 밀어내지 않는다. 새 토큰·장식 모션은
  추가하지 않았다.
- 수정: 모든 해석 가능한 누락 연결을 먼저, 각 분리 섬의 대표 노드를 다음으로
  보존하는 `actionTargets` 계약을 추가했다. 호환용 `actionTarget`은 첫 항목으로
  남겼다. 첫 행 아래 `나머지 수리 대상 N개 보기`를 열면 모든 행에 관계 편집과
  개념 문서 링크가 나타난다.
- 회귀 증거: `vault-health-repair`와 `DoNextTab` 집중 테스트 32개,
  TypeScript, i18n 메시지 계약 16개, focused ESLint 통과.
- 설치 앱·Computer Use 증거: 쓰기 없는 격리 fixture에서 분리된 섬 3개와 누락
  연결 3개를 만들고 최신 production 앱을 외장 모니터로 이동했다. 1920×1080과
  2560×1440 모두에서 disclosure, 6개 typed target, 각 관계 편집/개념 문서
  링크를 AX 트리로 읽었고, 펼친 목록의 잘림·겹침을 발견하지 못했다.
  `.screenshots/ux-039-island-repair-queue/14-legion-1920-expanded.png`와
  `16-tfg-2560-expanded.png`를 현재 실행 증거로 보존했다.
- 후속 proof: UX-040에서 구 `businessDecisionQuestions`·`readerDecisionLens`
  요구를 현행 maintenance-board 계약으로 교체해 직접 설치 앱 검증까지 닫았다.
- PO·디자인 판정: **Build and verify**

### UX-040 — 설치 앱 검증기가 폐기된 인사이트 DOM을 요구해 최신 앱을 실패 처리

- 심각도: `S4`
- 상태: 수정·설치 앱 재검증 완료
- 흐름: 최신 production 앱 → `/ko/ontology/insights/` 직접 로드 → 자동
  WebView payload와 실제 화면 대조
- 관측 현상: 설치 앱은 현재 5탭 정비 보드와 `할 일` 활성 패널, agent handoff를
  정상 렌더링했지만 검증기는 이미 제거된 `businessDecisionQuestions`와
  `readerDecisionLens`를 필수로 요구해 실패했다.
- 사용자 문제: 현재 앱을 배포해도 자동 proof가 구 UI를 진실원으로 삼아
  false-fail했다. maintainer와 agent는 매번 Computer Use로 정상 상태를 수동
  재해석해야 했고, 릴리스 판단에서 실제 회귀와 계약 드리프트를 구분할 수 없었다.
- PO pass: 사용 순간은 설치 앱이 최신 인사이트 과업을 실제로 렌더링했는지
  판단할 때다. 현재 대안은 수동 화면 대조뿐이다. 온톨로지 가치는 선택된
  maintenance 질문과 실제 `tabpanel`의 일치, agent 가치는 같은 탭의 query
  handoff를 기계적으로 읽는 데 있다. 새 UI를 만들지 않고 proof만 현재 표면에
  맞춘다. 판정은 **Build and verify**.
- 디자인 gate: attention winner는 선택된 탭과 그 패널, support layer는 정비
  보드, agent layer는 하단 handoff다. exactly five tabs, exactly one selected,
  selected panel visible을 계약으로 고정했다. 렌더링·토큰·모션·반응형 배치는
  바꾸지 않았고 1920/2560 설치 앱을 모두 확인했다.
- 수정: 인사이트 root에 `maintenance-board`와
  `one-tab-one-question` marker를, handoff 행에 `tab-query` marker를 추가했다.
  Tauri probe와 payload validator는 5탭, 단일 선택, 연결된 visible panel,
  handoff를 함께 요구한다. 구 reader-persona marker는 명시적으로 더 이상
  통과 조건이 아니다.
- 회귀 증거: payload/WebView source 계약 12개와 인사이트 `DoNextTab` 집중
  테스트 29개 통과. 각 새 marker의 누락·오류는 별도 실패 케이스로 고정했다.
- 설치 앱·Computer Use 증거: 격리 fixture로
  `tauri://localhost/ko/ontology/insights/`를 직접 열어 1512×917 WebView에서
  여섯 marker를 모두 저장했고 자동 verifier가 두 번 통과했다. 같은 설치 앱을
  외장 모니터에서 1920×1080과 2560×1440으로 옮겨 AX 트리의 5탭·단일 선택·
  active panel·handoff를 읽고 원본 PNG에서 잘림·겹침이 없음을 확인했다.
  `.screenshots/ux-040-insights-verifier-contract/03-computer-use-current-contract.png`,
  `04-legion-1920-current-contract.png`,
  `05-tfg-2560-current-contract.png`, 그리고
  `02-verifier-current-contract.webview.json`을 현재 실행 증거로 보존했다.
- 증거 한계: AX는 역할·선택·읽기 순서를, PNG는 시각적 잘림·겹침을 증명한다.
  이 조합은 전체 WCAG 적합성이나 모든 보조기기 동작을 대신하지 않는다.
- PO·디자인 판정: **Build and verify**

### UX-041 — fresh build 뒤에도 desktop smoke가 폐기된 route 계약으로 실패

- 심각도: `S4`
- 상태: 수정·fresh build 재검증 완료
- 흐름: `pnpm build` 성공 → 같은 `out/`로 `pnpm desktop:smoke`
- 관측 현상: fresh static export인데도 smoke가 폐기된 `/ontology` tree,
  `/ontology/edit` builder, 구 insights query cockpit과 오래된 docs/download/
  route title·copy를 요구하며 실패했다. 실패 안내는 원인을 계약 드리프트로
  말하지 않고 다시 `pnpm build`를 실행하라고 제안했다.
- 사용자 문제: 릴리스 preflight가 최신 production payload를 구 제품과 비교해
  false-block하고, 이미 수행한 빌드를 반복하도록 유도한다. 실제 정적 payload
  회귀를 잡아야 할 신호도 오래된 기대값 잡음에 묻힌다.
- 조사: source-of-truth route와 fresh `out/`를 대조했다. `/ontology`는
  `/topology?index=expanded`, `/ontology/edit`는 `/ontology/studio`로 보내는
  호환 entry이고, 인사이트는 5탭 정비 보드다. Download는 install → vault →
  AI assistant handoff, Docs는 Files/Graph/Agent source contract가 현재 의미다.
- 수정: 현재 EN/KO metadata title, Download handoff, Docs source marker,
  두 compatibility redirect, Topology canvas-v2/focus/path, Insights
  `maintenance-board`/`one-tab-one-question`/`tab-query`만 static proof로
  고정했다. 퇴역 browse/builder/query-cockpit 테스트를 제거했다.
- 다음 행동 계약: root/route/assets/offline docs가 없을 때만 `pnpm build`를
  권한다. title/copy/chunk만 어긋나면 `static-contract-drift`로 분류하고 현재
  route source와 smoke contract를 비교하도록 안내한다.
- 회귀 증거: 새 desktop-smoke 계약 테스트 10개와 전체 desktop checker
  205개가 통과했다. `pnpm build` 성공 직후 같은 `out/`에
  `pnpm desktop:smoke`를 실행해 EN/KO 6개 route, 10개 current title,
  2개 Download copy 묶음, 6개 route chunk contract, 2개 offline doc를 모두
  통과시켰다.
- 설치 앱·Computer Use 교차 증거: 같은 fresh artifact의 production 앱을
  `/ko/ontology/insights`로 실행해 direct verifier가 foreground, 1512×917
  WebView, current maintenance-board payload를 통과했다. Codex Computer Use
  AX 트리는 실제 설치 앱에서 탭 5개, 선택 탭 1개, 활성 `할 일` 패널,
  수리 큐와 `에이전트 인계`를 읽었고 현재 화면 캡처도 함께 저장했다.
- 디자인 gate: 렌더링·토큰·주의 계층·모션은 변경하지 않았다. static artifact
  proof를 현재 shipped UI에 맞춘 운영 슬라이스이므로 새 시각 디자인 승인은
  필요 없고, 설치 앱 runtime/visual proof와 증거 층을 분리 유지한다.
- PO·디자인 판정: **Build and verify**

### UX-042 — design guard가 초록이어도 퇴역 3탭 인사이트를 보호

- 심각도: `S4`
- 상태: 수정·회귀 검증 완료
- 관측 현상: `pnpm design:ontology`는 통과했지만 Insights 구조 계약이
  `TabBar` + `InsightsHeroCensus` + `InsightsHandoffRow`만 요구하며 설명과
  테스트는 고정 3탭 대시보드를 현재 제품으로 불렀다.
- 사용자 문제: maintainer와 agent는 설계 가드의 초록을 현재 UI 계약 증거로
  해석하지만, 실제 5개 질문 탭·단일 활성 panel·탭별 handoff가 사라져도 구
  census hero와 복사 버튼만 남으면 통과할 수 있었다. 설치 앱 수동 대조 외에는
  회귀를 막을 방법이 없었다.
- 현재 대안·단순화: 새 UI나 또 다른 verifier를 추가하지 않았다. 이미
  `insights-tab-state.ts`, page DOM, handoff row가 노출하는 shipped marker를
  하나의 구조 계약으로 묶고 퇴역 3탭 fixture를 실패 입력으로 만들었다.
- 구현 계약: 정확한
  `do-next/composition/connections/boundaries/freshness` 집합,
  `maintenance-board`, `one-tab-one-question`, `TabBar`, 한
  `tabpanel`, `tab-query` handoff와 copy action을 함께 요구한다.
- 문서 동기화: `DESIGN-SYSTEM`, `FEATURES`, `DEVELOPMENT-CHECKS`와 관련
  ontology 노드에서 tree/ERD Builder/query cockpit 및 고정 3탭을 현재
  구조처럼 말하던 내용을 Topology INDEX / Workshop / 5탭 maintenance board로
  교체했다.
- 검증: characterization test는 수정 전 2건 red로 실제 거짓 초록을
  재현했다. 수정 후 design-surface 테스트 8개와 live
  `pnpm design:ontology`의 159 files / 10 surfaces / 6 contracts가 통과했다.
- 디자인 gate: 렌더링·token·motion·layout 변경은 없다. 기존 installed-app
  5탭·단일 선택·활성 panel·agent handoff 증거를 자동 설계 가드가 같은 뜻으로
  보호하게 한 운영 변경이다.
- PO·디자인 판정: **Build and verify**

### 2026-07-27 반복 측정 기록

- 코드 기준선: `899eb7072`에서 시작해 로컬 vault 문구와 문서·ontology
  동기화 슬라이스를 각각 커밋한 뒤 설치 앱을 다시 빌드·배포했다.
- 문서/ontology: MCP 32도구(read 19 + write 13), CLI 52명령,
  dogfood 96노드·543관계로 활성 문서를 맞췄다. `vault:validate`,
  `vault:audit`, `dogfood:verify`, `dogfood:status`, docs vault build/check가
  통과했고 freshness stale node는 0이었다.
- viewport: 일반 `/ko/topology/`는 1100×768, 1512×885, 1920×917,
  2560×917 WebView에서 로드됐다. 네 증거 모두 canvas-v2, map-layer attention,
  fixed-surface overlap 0을 보고했다. 선택 관계 시나리오는 UX-031의 격리
  fixture 수정 뒤 1920·2560에서 다시 통과했다.
- Computer Use: 1100px와 실제 macOS 전체화면의 스크린샷·AX 트리를 확인하고,
  지도 → 문서함 → 공방 → 인사이트 → 프로젝트 → 기록을 실제 클릭으로 왕복했다.
  각 surface는 현재 route와 h1을 노출했다. 기록 화면의 `기록 시작하기`는
  파일 변경을 만들므로 측정 중 실행하지 않았다.
- 인사이트 수리 큐: 실제 감사 vault에서 총계 7과 단일 노출 대상의 불일치를
  UX-039로 재현했다. 격리 fixture의 전체 typed target 6개를 펼친 뒤 같은 설치
  앱을 외장 1920×1080과 2560×1440 모니터에서 각각 읽어 행별 관계 편집/문서
  인계와 제한 높이 스크롤을 확인했다.
- 인사이트 자동 proof: UX-040에서 폐기된 reader-persona marker를
  maintenance-board·one-tab-one-question·5탭·단일 선택·visible panel·handoff
  계약으로 교체했다. 직접 설치 앱 verifier는 1512×917 WebView에서 두 번
  통과했고, Computer Use로 같은 앱의 1920×1080·2560×1440 화면과 AX를
  교차 확인했다.
- static smoke: UX-041의 구 `/ontology` tree, `/ontology/edit` builder,
  insights query cockpit, stale docs/download 기대를 현행 route 계약으로
  이관했다. fresh build의 EN/KO 6개 route와 offline docs가 통과했고,
  artifact 누락과 current-contract drift의 다음 행동도 분리했다. 같은
  production 앱의 인사이트를 direct verifier와 Codex Computer Use AX로 다시
  열어 5탭·단일 선택·활성 패널·agent handoff가 유지됨을 교차 확인했다.
- design guard: UX-042의 고정 3탭·census hero 계약을 정확한 5개 질문
  tab set, maintenance-board, 한 active tabpanel, tab-scoped handoff로
  이관했다. 퇴역 3탭 fixture는 red, 현재 live source는 green으로 분리했다.
- 자동 검증: window screenshot과 WebView evidence가 저장되는 실행에서
  foreground activation/AX probe의 간헐 timeout을 UX-037로 재현했다.
  빠른 probe의 WebView AX 순회를 제거한 뒤에도 한 번 남은 일시 실패에는
  2회 bounded retry를 추가했다. 최신 main 배포에서는 activation command가
  timeout해도 AX 최종 상태와 PNG는 성공하는 제3의 경우를 잡아, command 반환
  대신 AX frontmost를 성공 진실원으로 고쳤다. AX 지속 실패는 fail-closed이며,
  최종 수정 뒤 8초 설치 앱 경로 2회·내부 proof 4회가 모두 첫 시도에 통과했다.

## 현재 PO·디자인 판정

- A1/A2 수정 슬라이스: **Build and verify**
- A20/A21 반응형·모션·포커스 연속성 슬라이스: **Build and verify**
- A22 modal 키보드 경계 슬라이스: **Build and verify**
- A23 nested settings task 포커스 슬라이스: **Build and verify**
- A24 client route 읽기 시작점 슬라이스: **Build and verify**
- A25 문서 탭 키보드 닫기 연속성 슬라이스: **Build and verify**
- A26 전역 레일 route·공방 landmark 슬라이스: **Build and verify**
- A27 하단 탭바 responsive 계약: **Do not build**
- A28 AI 연결 교차 route·모달 포커스 슬라이스: **Build and verify**
- A29 반복 측정 기준선·선택 관계 fixture·설치 앱 가져오기:
  **Build and verify**
- A30 에이전트 handoff tool inventory·invalid 설정 CTA 의미:
  **Build and verify**
- A31 CLI/MCP 활성 문서 inventory: **Build and verify**
- A32 내장 기능 문서 navigation/source 계약: **Build and verify**
- A33 설치 앱 foreground/AX window proof: **Build and verify**
- A34 공방 진입 선택 keyboard handoff: **Build and verify**
- A35 인사이트 수리 큐 전체 대상·행별 handoff: **Build and verify**
- A36 인사이트 설치 앱 현행 WebView 계약: **Build and verify**
- A37 packaged static smoke route 계약: **Build and verify**
- A38 ontology design guard 현재 구조 계약: **Build and verify**
- 전체 제품 전면 수정: **Investigate first**
- 주의 계층: 첫 실행 안내와 투어는 `blocking task`; 강조 노드/카드는
  그 안의 유일한 `active focus`; 배경 크롬은 상호작용과 Tab 순회에서 제외한다.
- 모션: 기존 scrim/패널 전환만 유지한다. 새 장식 모션은 추가하지 않는다.
- 에이전트 인계: UI 사실과 MCP/CLI 인계 문구가 같은 실제 vault·샘플 출처를
  말해야 한다.
- 설치 앱 증거: 브라우저 결과만으로 닫지 않는다.
