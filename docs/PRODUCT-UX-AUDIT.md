# Ontology Atlas 제품 UX 감사 장부

> 상태: 진행 중. 이 문서는 전면 재디자인 제안서가 아니라, 실제 사용자
> 시나리오를 설치 앱에서 반복 검증하며 발견·수정·재검증한 계약을 기록한다.
>
> 원칙: 취향보다 과업 성공, 스크린샷보다 상호작용 증거, 새 기능보다 현재
> 흐름의 신뢰 회복을 우선한다.

## 감사 방법

각 항목은 아래 순서로 닫는다.

1. 사용자·과업·시작 상태·이벤트 순서를 고정한다.
2. 설치 앱에서 포인터와 키보드로 재현한다.
3. 주의 계층, 모션, 반응형, 접근성, 로컬 파일 신뢰를 함께 판정한다.
4. 실패 테스트를 먼저 추가한다.
5. 가장 작은 일관된 슬라이스로 수정한다.
6. 집중 테스트와 `/Applications/Ontology Atlas.app`에서 다시 증명한다.

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

## 이슈 장부

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
- 상태: 열림
- 흐름: 투어 4/7 노드 선택 → 5/7 데이터 카드 설명
- 관측: 본문은 오른쪽 데이터 카드를 설명하지만 강한 포인터 광점은 캔버스에
  남고, 데이터 카드는 스크림 아래에서 약하게 보인다.
- 다음 판정: 카드 자체 컷아웃과 캔버스 초점의 관계를 14인치·와이드 화면에서
  다시 기록한 뒤 최소 주의 계층 수정 여부를 결정한다.

### UX-007 — 번역 계약 테스트 다섯 건이 현재 메시지와 역방향으로 드리프트

- 심각도: `S3`
- 상태: 열림
- 관측: 현재 앱 문구는 GitHub Pages·쉬운 작업공간/AI 표현으로 바뀌었지만
  `scripts/validate-messages.test.mjs` 일부가 Firebase Hosting·구 MCP 문구·
  폐기된 키를 계속 요구한다.
- 영향: 전체 메시지 검증이 항상 실패해 새 번역 회귀를 신뢰할 수 없다.
- 현재 증거: 새 한·영 키 shape와 ICU 컴파일 경계는 통과한다. 이 항목은
  현행 제품 문구를 다시 확인한 뒤 테스트를 현재 계약으로 정리한다.

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

## 현재 PO·디자인 판정

- A1/A2 수정 슬라이스: **Build and verify**
- A20/A21 반응형·모션·포커스 연속성 슬라이스: **Build and verify**
- A22 modal 키보드 경계 슬라이스: **Build and verify**
- A23 nested settings task 포커스 슬라이스: **Build and verify**
- 전체 제품 전면 수정: **Investigate first**
- 주의 계층: 첫 실행 안내와 투어는 `blocking task`; 강조 노드/카드는
  그 안의 유일한 `active focus`; 배경 크롬은 상호작용과 Tab 순회에서 제외한다.
- 모션: 기존 scrim/패널 전환만 유지한다. 새 장식 모션은 추가하지 않는다.
- 에이전트 인계: UI 사실과 MCP/CLI 인계 문구가 같은 실제 vault·샘플 출처를
  말해야 한다.
- 설치 앱 증거: 브라우저 결과만으로 닫지 않는다.
