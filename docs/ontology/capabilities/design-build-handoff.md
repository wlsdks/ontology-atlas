---
uid: f0289ebb-4f66-4e62-8ed6-456524e4922a
slug: capabilities/design-build-handoff
kind: capability
title: Design Build Handoff
display_ko: 조립 순서 핸드오프
display_en: Design Build Handoff
domain: domains/design-system
elements: []
path: .claude/skills/design-build/SKILL.md
created_by: "agent:unknown"
---

# Design Build Handoff

에이전트가 화면을 만들기 시작할 때 **가장 먼저 읽는 안내판**. 「명령에서 화면까지,
같은 순서로」: 어떤 부품을 집을지, 어느 램프에서 값을 가져올지, 다 짓고 무엇으로
재는지를 순서로 처방한다.

## 사용자 결과
- 에이전트가 매번 다른 방식으로 조립하지 않는다.
- 규격을 어겼을 때 **어느 게이트가 잡는지**까지 같은 문서에서 알 수 있다.

## 왜 이것이 이 시스템의 핵심인가
2026-08-03 census 의 진단: *「막고 있던 것은 모델의 취향이 아니라 가져다 쓸 부품이
없다는 것과 작업 순서가 안 적혀 있다는 것이었다」*. 부품은 2026-08-15 세 라운드로
갖춰졌다: 그러면 남는 것이 이 안내판이다.

## 알려진 결함 (2026-08-15 실측, 수리 중)
조립 시험에서 음성이 나왔다: 같은 날 비준된 새 부품 5개(`Input` · `Textarea` ·
`Checkbox` · `SegmentedControl` · `Select`)가 이 안내판의 라우팅 표에 **0건**
실려 있었다. 지시를 그대로 따르는 에이전트는 폼을 지으려다 「그 여덟에도 없는
모양 → 멈추고 전체를 다시 센다」에 걸리거나 생 `<input>` 을 쓴다.

**부품을 비준하면 안내판도 같이 고쳐야 한다**: 그 짝을 사람이 기억하게 두지
않고 게이트로 만든다(`design-spec-census` 에 얹어, 규격 파일이 새 부품을 export
하는데 안내판이 그 이름을 모르면 실패).

## 추출 경계
**extractable.** 211줄에 앱 고유어가 3회뿐이라 그대로 옮길 수 있다. 다만 이
문서가 가리키는 게이트 이름들은 `design-gate-ratchets` 의 경계(atlas-bound)를
따르므로, 추출본에서는 「부트스트랩 후 켜라」로 바뀌어야 한다.

## 사본 계약
`.claude/skills/design-build/SKILL.md` ↔ `.agents/skills/design-build/SKILL.md`
두 벌이 바이트 동일해야 한다(`pnpm agents:check` 의 `skill-copy`). 셋째 사본은
만들지 않는다.