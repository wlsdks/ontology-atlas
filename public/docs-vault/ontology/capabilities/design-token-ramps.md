---
uid: e098afc6-7170-4740-9161-c370a7cb2283
slug: capabilities/design-token-ramps
kind: capability
title: Design Token Ramps
display_ko: 디자인 토큰 램프
display_en: Design Token Ramps
domain: domains/design-system
elements: []
path: app/globals.css
created_by: "agent:unknown"
---

# Design Token Ramps

쓸 수 있는 값을 미리 몇 단계로 정해 둔 사다리들. 그 밖의 값은 lint 가 막는다.

## 사용자 결과
- 화면마다 조금씩 다른 글자 크기·모서리·그림자가 생기지 않는다.
- 빛이 한 방향에서 오고, 위에 뜬 것이 더 짙은 그림자를 갖는다.

## 램프
글자 크기 8단 · 행간 10단(크기와 1:1 짝) · 자간 · 무게 3단 · 반경 5단 ·
그림자 5종(고도 3 + 도킹 2) · 모션 3단(fast 확인 · base 이동 · settle 확정) ·
컨트롤 높이 · 층위(z) 사다리 · 아이콘 3단 · 다이얼로그 폭 2단

## 추출 경계
**혼합.** 고유 토큰 이름 **580** 중 **269(46%)가 `--topology-*`** 이고, 그 밖에
`--git-*` · `--chrome-*` · `--app-nav-*` · `--gateway-*` · `--footprint-*` ·
`--docs-*` 가 앱 표면에 묶여 있다. 코어(색·타입·행간·자간·무게·반경·그림자·
모션·컨트롤 높이·z·아이콘·다이얼로그 폭·overlay)만 extractable 이다.

**분류는 손으로 하지 않는다**: 접두사 규칙으로 판정하고, 어느 쪽도 아닌 토큰은
**실패시킨다**(새 토큰이 조용히 경계 밖에 생기는 길을 무료로 두지 않는다).
전체 2층 분리는 2026-08-15 카운슬에서 다음 슬라이스로 이월됐다(토끼굴 1순위: 
분류 논쟁이 며칠을 먹는다). 이번에는 경계선 표시만 남긴다.

## 게이트
`unused-token-ratchet`(아무도 안 쓰는 토큰은 규격이 아니라 오정보) ·
`type-ramp-step-defined` · `type-ramp-leading-pair` · `contrast` 계측 ·
`icon-size-ramp`(CSS↔JS 거울)