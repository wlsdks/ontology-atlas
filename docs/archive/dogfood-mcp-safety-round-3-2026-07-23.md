# MCP destructive safety dogfood round 3 — 2026-07-23

## 결론

Round 2에서 남긴 두 P2를 구현했다. 새 도구를 추가하지 않고 기존 31-tool
surface의 파괴적 작업 8개를 하나의 machine-readable preview contract로
통일했으며, `absorb_document`의 source rewrite를 canonical repository
boundary로 제한했다.

새 tool은 필요하지 않았다. 문제는 capability 부재가 아니라 같은 결정을
도구마다 다르게 표현한 contract drift와 파일 경계 누락이었다. 별도
`preflight_*` 도구를 추가하면 agent의 선택지와 왕복만 늘어나므로 기존
dry-run 응답을 강화하는 편이 더 유연하고 빠르다.

## Product-owner pass

- 관찰 현상: dry-run의 `ok` 의미가 도구마다 달랐고, 외부 absolute path의
  `absorb_document(confirm:true)`가 명시적 경계 승낙 없이 source를
  backup+rewrite할 수 있었다.
- 사용자 문제: agent가 transport 실패와 정상 preview를 혼동하거나,
  사용자가 선택한 repository scope 밖 파일까지 실수로 수정할 수 있었다.
- 사용자 순간: rename/merge/delete/relation/Git confirm 직전, 기존
  AGENTS.md/CLAUDE.md 흡수 직전.
- 현재 대안: 도구별 메시지를 parsing하고 absolute path를 사람이 수동
  비교한다.
- ontology/agent 가치: 모든 destructive decision을 같은 typed fields로
  판단하고, scope 밖 rewrite는 명시적 권한 상승으로 분리한다.
- 최소 slice: 공통 preview fields, blocker consistency, canonical path
  boundary, outside opt-in, verifier/schema/docs.
- 검증: schema + runtime, no-op/blocker/confirm, symlink escape, backup
  collision, validator/Git states, source and packed-package gates.
- verdict: **Build and verify**.

## 공통 preview 계약

| 필드 | 의미 |
|---|---|
| `previewReady` | 검토 가능한 완전한 dry-run 응답인지 |
| `wouldChange` | confirm이 실제 disk/Git mutation을 만드는지 |
| `canConfirm` | 현재 args 그대로 `confirm:true`를 붙여 진행 가능한지 |
| `blockedReasons[]` | confirm을 막는 모든 조건의 설명 |

정상 preview의 legacy `ok:false`는 호환성을 위해 유지했다. agent는 더 이상
그 값을 실패 판정에 사용하지 않고 위 네 필드로 결정한다. confirmed response는
계획이 아니므로 preview decision fields를 false/empty로 reset한다.

## 경계/상태 시나리오

| 시나리오 | 기대 계약 |
|---|---|
| rename / merge / replace / reclassify preview | ready + change + confirmable |
| 존재하는 relation 제거 preview | ready + change + confirmable |
| 존재하지 않는 relation 제거 | ready + no-op + blocked |
| backlink 없는 delete | ready + change + confirmable |
| backlink 있는 delete, force 없음 | ready + change + blocked |
| backlink 있는 delete, `force:true` | ready + change + confirmable |
| Git 변경 있음 + clean validation | ready + change + confirmable |
| Git 변경 없음 | ready + no-op + blocked |
| detached HEAD / operation in progress | ready + change + blocked |
| vault validation error | ready + change + blocked |
| absorb source inside repo | ready + change + confirmable |
| absorb source outside repo | ready + change + blocked |
| outside source + `allowOutsideRepo:true` | ready + change + confirmable |
| inside path symlink → outside target | outside로 판정 + blocked |
| absorb backup 이미 존재 | ready + change + blocked |

## 구현 안전성

- boundary는 입력 문자열이 아니라 `realpath`로 canonicalized source와
  repository root를 비교한다.
- outside confirmation은 vault node를 하나도 쓰기 전에 hard block한다.
- 기존 backup도 preview 단계에서 blocker로 보이고 confirm에서 다시
  hard block한다.
- `git_snapshot`은 core Git blockers와 wrapper vault-validation blocker를
  한 `blockedReasons[]`에 합친다.
- initialize instructions는 agent에게 legacy `ok`가 아니라 공통 decision
  fields를 사용하라고 직접 안내한다.
- 독립 adversarial pass에서 compiler/query가 해석하는 stored tail alias를
  relation writer만 raw string으로 비교하는 비대칭을 발견했다. 재현 테스트를
  먼저 실패시킨 뒤 add/remove/replace와 `relation_notes` key가 unique
  tail/frontmatter slug alias를 모두 canonical edge로 해석하도록 수정했다.

## 검증 결과

Luna 독립 pass는 기존 406 assertions와 별도 JSON-RPC/runtime 31개를 실행해
공통 destructive 계약, Git blocker, absorb boundary를 검증했다. 이 과정에서
relation alias 결함 1건을 발견했고, 수정 후 tail/frontmatter alias 회귀 2개와
전체 MCP integration 88개가 모두 통과했다.

| 게이트 | 결과 |
|---|---:|
| MCP integration | 88 / 88 |
| MCP unit | 242 / 242 |
| MCP verifier unit | 122 / 122 |
| cross-package contracts | 212 / 212 |
| CLI library / command | 180 / 180 · 24 / 24 |
| package contract | 55 / 55 |
| packed install smoke | local Node 24 + Node 24.18.0 통과 |
| 1,000-node graph performance | 모든 compile/query budget 통과 |
| app Vitest | 3,040 pass · 3 todo |
| lint / typecheck / production build | 0 errors · 통과 · 33 static pages |
| vault validate / path audit | 105 files issue 0 · 243 paths drift 0 |
| dogfood MCP verify | 31 / 31 tools · 105 nodes · 571 edges · issue 0 |

lint에는 이 변경과 무관한 기존 warning 110개가 남아 있지만 error는 0이다.
docs-vault freshness도 162 docs / 142 backlinked / 14 tags로 통과했다.

## 남은 개선 후보

- CLI의 destructive preview도 MCP와 같은 four-field JSON contract를
  제공할지 별도 호환성 검토가 필요하다. CLI human text까지 성급히 바꾸지는
  않았다.
- `absorb_document`의 vault node writes와 source backup/rewrite 전체를
  rollback 가능한 transaction journal로 만들 수 있다. 현재는 source
  rewrite 전 vault write 실패 시 source는 보존되지만, 앞선 node write 일부는
  남을 수 있다.
- outside-repo absorb는 명시적 opt-in을 요구하지만 preview와 confirm 사이의
  source 내용 일치까지 증명하지는 않는다. 후속 slice에서는 source mtime/hash
  또는 짧은 preview token을 confirm 입력에 묶는 방안을 검토한다.
- remote Git push는 계속 MCP 범위 밖이다. 현재 local snapshot의 explicit
  boundary가 충분하며, credential/remote policy 없이 push tool을 추가하면
  human-sovereign 원칙을 약화시킨다.
