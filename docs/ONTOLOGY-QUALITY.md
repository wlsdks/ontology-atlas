# Ontology Quality Authority Map

이 문서는 새 온톨로지 규칙을 만드는 곳이 아니다. **어떤 질문의 정본이 어디에 있고,
무엇이 기계 강제인지·검토 신호인지·사람 판단인지**를 한 번에 찾게 하는 권위 지도다.
값이나 공개 도구 계약이 아래 문서와 코드에서 다르면 이 문서가 아니라 소유 정본을
고친다.

## 공개 품질 계약

- vault 전체와 project 전체의 **노드 수에는 상한이 없다**.
- 한 부모의 직접 연결 폭은 결함 판정이 아니라 **검토를 시작하는 신호**다. 각 자식의
  역할이 배타적이고 근거가 해소된 넓은 hub는 올바른 구조일 수 있다.
- bridge node는 숫자를 줄이는 바구니가 아니다. 공유 행동을 한 문장으로 설명하고,
  형제와 구별되며, 실제 자식을 재부모화할 때만 자격을 얻는다.
- 저장소 분석기의 후보·인용 상한은 한 번의 **evidence packet 처리 폭**을 제한한다.
  graph 크기, project 크기, node fan-out의 상한이 아니다.
- `uid`는 이름이 바뀌어도 유지되는 영구 정체성이고, `slug`는 사람이 읽고 편집하는
  현재 주소다. 소스 위치는 `path:` 근거이며 graph relation에 raw path를 넣지 않는다.
- 외부 저장소 field trial의 checkout·vault·node·relation은 scratch에 격리한다.
  일반화된 측정과 실패 학습은 남길 수 있지만 외부 trial ontology를 Atlas dogfood
  ontology에 합치지 않는다.

## 누가 무엇을 결정하는가

| 질문 | 분류 | 실행/규범 정본 | 검증 |
|---|---|---|---|
| 어떤 kind와 frontmatter가 유효한가 | hard · code-enforced | `mcp/src/schema.mjs` (`VAULT_KIND_SCHEMA`, `NODE_UID_PATTERN`) · mirror `cli/src/lib/schema.mjs` · 공개 형식 `docs/ONTOLOGY-ATLAS-SPEC.md` | `tests/contract/vault-schema.contract.test.ts` · `tests/contract/validate-vault-document.contract.test.ts` |
| element 이름과 slug, `path:`와 `elements:`의 경계 | hard shape + advisory meaning | `mcp/src/construction-rules.mjs` (`ELEMENT_NAMING_RULE_EN`, `CONSTRUCTION_RULES_EN`) · write path `mcp/src/vault.mjs` · 사람 설명 `docs/guide/what-becomes-a-node.md` | `mcp/src/write-path-gate.test.mjs` · `tests/contract/construction-rules.contract.test.ts` |
| 노드 총량과 직접 fan-out | no hard cap · advisory review | 값 `NODE_ELIGIBILITY_GATE` in `mcp/src/schema.mjs` · 절차/문구 `mcp/src/construction-rules.mjs` · 이유와 반증 `docs/DECISIONS.md` | `mcp/src/write-path-gate.test.mjs` · `tests/contract/vault-schema.contract.test.ts` |
| 넓은 hub를 유지할지 bridge를 만들지 | human judgment · tool-assisted | bridge 네 조건과 비배타성 질문 in `CONSTRUCTION_RULES_EN` · 사용자 가이드 `docs/guide/what-becomes-a-node.md` | write warning/maintenance 결과를 실제 부모의 `get_concept`·`facets`와 함께 검토 |
| 언어별 저장소 분석 packet의 현재 폭 | evidence protocol · code-owned | Python 자동/risk 후보는 `PYTHON_IMPORT_ELEMENT_LIMIT`·`PYTHON_IMPORT_RISK_ELEMENT_LIMIT` in `mcp/src/analyze.mjs`; 추가 exact endpoint는 `PYTHON_SELECTED_IMPORT_ELEMENT_LIMIT` in `mcp/src/meaning-evaluation.mjs`; 공개 동작은 `mcp/README.md` | `mcp/src/analyze.test.mjs` · `mcp/src/meaning-evaluation.test.mjs` · `mcp/src/integration.test.mjs` |
| field trial 데이터와 제품 dogfood의 경계 | evidence protocol | `.agents/skills/ontology-field-trial/SKILL.md`와 같은 내용의 `.claude` mirror · 금지 규칙 `.claude/rules/forbidden.md` | scratch 경로, source-hidden handoff, 인용 경로 검증을 trial 기록에서 확인; 외부 산출물은 repo diff에 없어야 함 |
| 지도에서 많은 자식을 어떻게 그리는가 | rendering only · ontology policy 아님 | `docs/FEATURES.md`의 dense-group contract와 topology renderer | 해당 UI/contract/performance checks; 이 값을 ontology 품질 판정에 재사용하지 않음 |

## 변경 규칙

1. 먼저 위 표의 소유 정본을 바꾼다. 코드가 소유한 수치나 enum을 이 문서에서 별도
   규범으로 만들지 않는다.
2. 기계가 판단 가능한 규칙은 같은 변경에서 테스트와 gate probe로 red/green을
   증명한다. 의미 배타성처럼 사람 판단인 규칙은 문장과 반증 조건을 남긴다.
3. 공개 불변 원칙이 바뀌면 `README.md`의 짧은 계약을 갱신한다. 세부 알고리즘과
   변동 가능한 상한은 README에 복제하지 않는다.
4. 이유·패배한 반대·재검토 조건은 `docs/DECISIONS.md`에 append한다. 이 문서는 그
   역사를 다시 쓰지 않는다.
5. 마지막에 `pnpm checks:changed -- <touched paths>`가 지목한 검증을 실행하고,
   ontology 의미가 달라졌다면 dogfood vault도 기존 노드를 보강하는 방식으로 sync한다.

## 실패로 보는 관측

다음 중 하나가 나타나면 이 권위 지도가 제 역할을 못한 것이다.

- 다음 기여자나 에이전트가 분석 packet 상한을 graph/node/fan-out 상한으로 설명한다.
- 넓다는 이유만으로 정당한 hub를 쪼개거나, 자식을 옮기지 않은 빈 bridge를 만든다.
- raw source path를 `elements:`에 쓰거나 UID와 slug를 같은 정체성으로 취급한다.
- 같은 규칙을 둘 이상의 산문 파일에서 수동으로 고쳐야 하고 하나가 조용히 낡는다.
- 외부 field-trial ontology가 dogfood node/relation으로 들어온다.

이 경우 설명을 더 복제하지 않는다. 실행 정본에서 생성 가능한 표면으로 옮기거나,
찾을 수 없는 권위 지도라면 제거한다.
