# MCP dogfood round 2 — 2026-07-23

## 결론

빈 폴더, cold-start bootstrap, strict input recovery, 관계/노드 destructive
workflow, Git 상태 조합, packed install, Node 24 최신 runtime을 대상으로
명시적 runtime 시나리오 128건을 실행했다. 직렬 108건과 동시 read RPC
20건이며, 별도로 unit/integration/package/contract/build gate를 반복했다.

기본 MCP CRUD와 strict schema는 강했다. 실제 결함은 주로 “source checkout은
green이지만 설치 패키지 또는 agent가 만나는 상태 조합은 깨지는” 경계에 있었다.
확정된 P1/P2 결함은 회귀 테스트와 함께 수정했다.

## Product-owner pass

- 관찰 현상: checkout test는 통과해도 packed CLI test, 첫 bootstrap 직후
  verifier, detached HEAD, Unicode Git path, external vault path에서 실패하거나
  모순된 결과가 나왔다.
- 사용자 문제: AI agent가 green status를 믿고 다음 write/commit으로 진행할 수
  없으며, detached 상태에서는 복구하기 어려운 고아 commit도 만들 수 있었다.
- 사용자 순간: 최초 설치/upgrade, 빈 repo bootstrap, first-contact health,
  ontology Git checkpoint.
- 현재 대안: 사람이 Git 상태와 YAML warning을 따로 읽고 수동 복구한다.
- ontology/agent 가치: 한 MCP 응답 안에서 안전한 다음 행동과 usable path를
  제공하고, bootstrap 산출물이 즉시 verifier-clean하도록 만든다.
- 최소 slice: 패키지 독립성, Node 24 reporter, deterministic single-domain
  containment, actionable validation, Unicode-safe Git parsing, detached block,
  vault-relative validate path.
- 검증: exact repro regression + packed tarball + Node 24.18 + full
  MCP/CLI/contract/build gates.
- verdict: **Build and verify**.

## 실행 매트릭스

| 묶음 | 수량/결과 | 핵심 범위 |
|---|---:|---|
| Luna serial scenarios | 74 | empty folder, 31-tool inventory, strict errors, batch isolation, write recovery, Git edge cases |
| Luna parallel RPC | 20/20 | 같은 server process의 concurrent read 응답 |
| Main-agent manual scenarios | 34 | Unicode/space vault, strict retry, write tools, snapshot boundary |
| MCP JSON-RPC integration | 84/84 | read/write/schema/error/recovery contracts |
| CLI local-vault focused integration | 45/45 | validate/add/import/find 및 external absolute vault |
| CLI repo-analysis focused integration | 47/47 | analyze/bootstrap/infer/index와 immediate verifier |
| Analyzer + Git focused unit | 22/22 | single-domain containment, detached block, Unicode paths |
| Graph DB dogfood | 14/14 | graph database-style query runtime |
| Package contracts | 180 lib + 24 commands + 55 contracts | installed CLI/MCP file and command contract |
| MCP docs contracts | 22/22 | inventory/README/schema documentation alignment |
| Installed verifier | 31/31 | clean starter and post-bootstrap vault |

Luna는 임시 fixture만 사용했고 저장소 파일을 수정하지 않았다. 임시 폴더도 모두
정리했다.

## 수정한 결함

### 1. Packed CLI test가 monorepo 밖에서 실패

CLI test가 `../../../mcp/src/activity-log.mjs`를 직접 import해 설치 tarball에서
package root를 탈출했다. source checkout에서는 monorepo 경로를, installed
package에서는 선언된 `ontology-atlas-mcp` dependency를 resolve하도록 변경했다.

### 2. Node 24 test reporter contract drift

packed smoke가 Node 20식 `# fail 0`만 허용해 Node 24의 `ℹ fail 0`을 실패로
판정했다. 두 reporter를 명시적으로 허용하는 contract로 바꿨다.

### 3. Packed smoke의 오래된 starter/health 가정

clean starter는 compile issue 0이며 현재 health advisory는
`relation_recommendations`다. packed smoke 기대값을 현재 제품 계약으로 맞추고,
별도 dangling fixture로 fail-closed 검증은 유지했다.

### 4. `needs_attention`인데 next action/score는 healthy

wrapper validator가 core diagnosis 뒤에 붙으면서 status만 바꾸고
`nextActions`는 비워 두며 agent readiness 100점을 유지했다. 이제 validator
warning/failure는 최우선 `vault_validation` action을 만들고, validator-only
downgrade는 readiness score를 25점 낮춘다.

### 5. Git Unicode/space path가 C-quoted octal string

`git status --porcelain=v1 -z`와 NUL parser를 사용한다. 한글, 공백, tab,
newline 경로가 agent가 다시 사용할 수 있는 실제 문자열로 반환되며 rename/copy
record도 destination/source pair를 안전하게 소비한다.

### 6. 첫 bootstrap 직후 verifier 실패

README에 business domain이 하나뿐인데 feature 이름이 다르면 capability에
`domain:`이 없었다. 경쟁 의미가 없는 단일 README domain은 unmatched
capability/element의 deterministic parent가 된다. 여러 domain이 있을 때는
기존처럼 evidence 없는 추측을 하지 않는다.

### 7. Detached HEAD에서 agent가 고아 commit 생성

detached HEAD는 이제 risk `high`, orphan warning, confirm hard block이다. dry-run
preview는 상태를 설명하지만 branch로 이동하기 전 commit은 불가능하다.

### 8. 외부 절대 vault validate path

CLI JSON issue path를 process cwd가 아니라 선택한 vault root 기준으로 만든다.
agent/CI는 항상 `capabilities/auth.md` 같은 안정적인 경로를 받는다.

### 9. No-change snapshot subject

vault change가 없는 preview의 빈 기호/이중 공백 subject를
`ontology snapshot: no vault changes`로 정규화했다.

## 남은 개선 후보

### P2 — destructive preview 공통 계약

현재 dry-run의 `ok` 의미가 도구별로 다르다. `previewReady`, `canConfirm`,
`blockedReasons`, `wouldChange` 같은 공통 필드를 설계하면 agent가 `ok:false`를
transport/tool failure로 오인하지 않는다. 기존 output schema와 verifier를 함께
바꿔야 하므로 별도 호환성 slice로 진행하는 편이 안전하다.

### P2 — `absorb_document` 외부 파일 confirm gate

absolute path로 repo/vault 밖 source도 backup+rewrite할 수 있다. dry-run에는
`outsideRepo`를 노출하고 confirm은 `allowOutsideRepo:true` 같은 명시적 opt-in을
요구하는 정책 검토가 필요하다.

## 최종 품질 기준

- Node runtime: local 24.16.0 + latest tested 24.18.0
- package: source checkout 없이 tarball install/test/verify
- safety: no repo init, no push, vault-only commit, stale HEAD block,
  operation-in-progress block, detached HEAD block
- recovery: strict error payload에 exact field/value/tool suggestion
- bootstrap: apply 직후 validate clean + MCP verify 31/31
- path contract: Git path와 CLI issue path가 agent가 재사용 가능한 형태
