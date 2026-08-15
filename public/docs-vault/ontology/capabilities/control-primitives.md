---
uid: f8f39986-79c1-4dc4-9e7a-ae40dc609f17
slug: capabilities/control-primitives
kind: capability
title: Control & Form Primitives
display_ko: 컨트롤·폼 프리미티브
display_en: Control & Form Primitives
domain: domains/design-system
elements: []
path: src/shared/ui/control-class.ts
created_by: "agent:unknown"
---

# Control & Form Primitives

화면을 만드는 사람이 className 을 손으로 쓰지 않게 하는 부품 층. 값은
`controlClass()`/`fieldClass()`(cva)가 내고, 행동(기본 type · 접근 이름 강제 ·
오류 배선 · 키보드 계약)은 컴포넌트가 진다.

## 사용자 결과
- 같은 뜻의 컨트롤이 화면마다 다른 크기·색으로 나오지 않는다.
- 이름 없는 입력, 배타성이 접근성 트리에 안 실린 선택, 초점 링 없는 체크박스가
  구조적으로 만들어지지 않는다.

## 층 구조
- **값 층** `control-class.ts`: 모양 8종(chip·icon·row·pill·card·link·tile·segment)
  × 크기 × 톤 9단, `fieldClass`(frame 2 × size 4 × multiline) · `fieldLabel`
- **행동 층**: `Button`·`Chip`·`IconButton`·`RowButton`·`Select`·`Input`/`Textarea`·
  `Checkbox`·`SegmentedControl`·`Dialog`·`Surface`·`EmptyState`·`TabBar`·`Tooltip`·`Toast`

## 추출 경계
**혼합.** 이 배럴(`src/shared/ui/index.ts`)에는 범용 부품과 **Atlas 도메인 부품이
같이 서 있다.** 도메인 부품(atlas-bound)은 옮기면 안 된다: 타입 있는 온톨로지
사실의 시각 어휘이기 때문이다:

- `LastEditSubjectRow`: `"agent" | "human"` 유니온. 「agent-native, human-sovereign」
  이 부품 안 타입으로 박혀 있다
- `EvidenceOnlyBadge`: 저작 노드 대 근거-전용 파생 개념의 kind 경계를 그린다
- `MtimeConflictBadge`: `patch_concept` 의 `expected_mtime` 낙관적 동시성 계약
- `NodeExplanationEdit`: 「노드의 본문이 곧 그 노드의 설명」
- `TopologyV2KindGlyph` · `BrandMark` · `HexMark` · `ChromeTile` · `ChromeChip` ·
  `SimilarNodeWarning` · `RouteLoadingFallback`

그리고 소스 8파일이 `next-intl` / `@/i18n` / `sonner` 에 결박돼 있어, 그대로
옮기면 남의 프로젝트에서 돌지 않는다(2026-08-15 이식성 슬라이스가 이것을 뗀다).

좋은 소식: `shared/ui` 는 상위 레이어를 **한 번도** 참조하지 않는다: FSD 경계가
실제로 지켜져서 의존 방향은 이미 이식 가능하다.

## 게이트
`control-class.contract.test.ts`(조합 전수) · `control-adoption-ratchet`(손 컨트롤
0 종료 선언) · `field-class.contract.test.ts` · `field-adoption-ratchet` ·
`checkbox-target-size` · `dialog-adoption-ratchet` · `touch-floor-layer`