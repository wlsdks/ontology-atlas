# 내 저장소에서 시작하기

빈 볼트에 노드를 손으로 백 개 적는 일은 아무도 하지 않습니다. 그래서 시작은
**이미 가진 것에서 뽑아내는 것**입니다. 여러분은 이미 코드가 있고, 폴더 구조가
있고, 아마 `CLAUDE.md` 나 `AGENTS.md` 도 있습니다.

세 가지 입구가 있습니다.

| 가진 것 | 입구 |
|---|---|
| 코드 저장소 | `init --quick-start` (아래 1·2절) |
| 이미 쓰던 에이전트 지침 파일 | `absorb` (3절) |
| 마크다운 문서가 든 폴더 | 앱의 「내 문서로 지도 만들기」 (4절) |

**셋 다 공통 규칙이 하나 있습니다: 제안 단계는 아무것도 쓰지 않습니다.**
확인한 것만 볼트에 들어갑니다.

## 1. 한 줄로 시작하기

```bash
node cli/src/index.mjs init my-vault --quick-start
```

이 한 줄이 하는 일:

1. 볼트 폴더를 만들고 시작 노드를 넣습니다.
2. **저장소를 훑어 첫 그래프를 만듭니다** (아래 `bootstrap` 과 같은 것).
3. 에이전트 설정 파일(`.mcp.json` · `.codex/config.toml`)을 씁니다.
4. `CLAUDE.md` 나 `AGENTS.md` 가 있으면 **흡수를 권하는 줄만** 찍습니다.
   자동으로 흡수하지 않습니다.
5. 다음에 할 일 세 줄을 찍습니다.

4번이 중요합니다. 여러분이 손으로 쓴 지침 파일을 도구가 말없이 재작성하는 일은
일어나지 않습니다.

## 2. 나눠서 보기: 훑기 · 확인 · 적용

한 줄이 불안하면 세 단계로 쪼갤 수 있습니다. **첫 두 단계는 볼트를 건드리지
않습니다.**

### ① 훑기: 무엇이 후보인가

```bash
node cli/src/index.mjs analyze . --vault my-vault
```

이 저장소에서 돌리면 이렇게 나옵니다.

```
analyze /path/to/repo (framework=fsd)

  project     ontology-atlas — Ontology Atlas

  domains (5)
    domains/in-30-seconds          In 30 seconds       ← README.md
    domains/running-from-source    Running from source ← README.md

  capabilities (17)
    capabilities/guided-tour       Guided Tour         ← src/features/guided-tour
    capabilities/locale-switch     Locale Switch       ← src/features/locale-switch

  elements (45)
    elements/knowledge-graph       Knowledge Graph     ← src/entities/knowledge-graph
```

**오른쪽 화살표가 근거입니다.** 이 후보가 어디에서 나왔는지 한 줄마다 적혀
있습니다.

여기서 바로 보이는 것: 위 도메인 후보 두 개는 **README 의 제목에서 뽑힌
것**입니다. 「In 30 seconds」 는 여러분 제품의 도메인이 아니라 문서의 소제목이죠.
이게 이 단계가 **제안**인 이유입니다. 훑기는 구조를 보고 후보를 냅니다. 무엇이
의미 있는지는 여러분이 압니다.

### ② 의존 관계 후보

```bash
node cli/src/index.mjs infer-imports . --vault my-vault
```

TS/JS 의 import 그래프를 읽어 「필요한 항목」(`depends_on`) 관계 후보를 냅니다.

```
infer-imports /path/to/repo — 300 files / 714 edges / 273 external

  module edges (113) — depends_on candidates
    capabilities/project-edit —depends_on→ elements/project × 11 (static=11)
    capabilities/first-run-starter —depends_on→ capabilities/docs-vault-local × 6
```

`× 11` 은 그 방향으로 실제 import 가 열한 번 있었다는 뜻입니다. 약한 후보를
빼려면 `--threshold N` 을 씁니다.

### ③ 적용

읽어 보고 마음에 들면 `--apply` 를 붙입니다. 둘을 한 번에 하려면:

```bash
node cli/src/index.mjs bootstrap . --vault my-vault
```

`bootstrap` 은 훑기와 import 추론을 순서대로 적용한 것뿐입니다. 새로운 마법이
아닙니다. `--skip-imports` 로 노드만 만들 수도 있습니다.

## 3. 이미 쓰던 지침 파일 흡수하기

`CLAUDE.md` · `AGENTS.md` 같은 파일을 이미 유지하고 있다면, 그 안에는 이미
정책과 결정이 문장으로 들어 있습니다. 그걸 두 벌로 관리할 이유가 없습니다.

```bash
node cli/src/index.mjs absorb AGENTS.md --vault my-vault
```

**기본이 dry-run 입니다.** 계획만 찍고 파일은 하나도 건드리지 않습니다.

`--write` 를 붙이면:

- 규칙·정책·결정 절 → `kind: document` 노드가 됩니다.
- **아키텍처·구성요소 절은 제안으로만 남습니다**. 역량인지 요소인지 도메인인지는
  사람이 정해야 하는 판단이라 자동으로 쓰지 않습니다.
- 주입이 의심되는 절은 분류와 무관하게 흡수에서 제외됩니다.
- 원본은 `<파일>.pre-absorb.bak` 으로 백업된 뒤, **흡수되지 않은 절을 그대로
  보존한 얇은 포인터**로 재작성됩니다.

마지막 줄이 이 명령의 계약입니다. **내용은 절대 파괴되지 않습니다.**

## 4. 앱에서: 문서가 이미 있는 폴더

`kind:` frontmatter 는 없지만 마크다운이 든 폴더를 열면, 지도는 「0 개념」이라고
말하는 대신 **찾은 문서 수**를 말하고 「내 문서로 지도 만들기」 를 제안합니다.

누르면 이미 훑어 둔 목록에서 후보를 냅니다.

| 찾은 것 | 후보 |
|---|---|
| 루트 `README` | 프로젝트 이름 |
| 1단계 하위 폴더 | 도메인 |
| 각 문서 | `domain:` 이 달린 요소 |

승인하면 **승인한 문서에만 frontmatter 를 쓰고**, 본문은 손대지 않습니다. 여기에
`project.md` 하나가 새로 생깁니다. 그게 전부입니다.

## 5. AI 에이전트에게 시키기

에이전트를 이미 붙였다면([AI 에이전트 연결하기](/guide/connect-agent)) 말로
시켜도 됩니다. 에이전트가 쓰는 도구는 CLI 와 **같은 것**입니다.

- `analyze_repo_structure`: 저장소를 훑어 후보를 냅니다.
- `infer_imports`: import 그래프에서 「필요한 항목」 후보를 냅니다.
- `index_project`: 위 둘에 검증까지 묶은 계획을 냅니다.

에이전트가 유리한 점은 훑기 다음입니다. 「이 폴더가 무엇을 하는 곳인지」 는
폴더 이름이 아니라 코드를 읽어야 알 수 있고, 에이전트는 읽을 수 있습니다.
그래서 `Locale Switch` 같은 폴더명 그대로의 이름 대신 역할을 적은 이름이
나옵니다.

## 6. 자동으로 생긴 것은 뼈대일 뿐이다

훑기의 결과물을 그대로 두면 **폴더 구조를 마크다운으로 옮겨 적은 것**밖에 되지
않습니다. 그건 지도가 아니라 `tree` 출력입니다. 시작한 다음 반드시 하는 일:

1. **이름을 역할로 고칩니다.** `Docs Vault Local` 은 폴더 이름이지 그것이 하는
   일이 아닙니다.
2. **근거를 붙입니다.** 역량의 `path:` 에 낯선 에이전트가 먼저 열 구현 진입점
   하나를 넣습니다. `elements:`에는 파일 경로가 아니라 역할이 서로 다른 실제
   element node slug만 넣습니다.
3. **의미 관계를 얹습니다.** 담김만 있으면 트리이고, `relates` · `dependencies`
   가 붙어야 그래프입니다.
4. **덜 된 곳을 확인합니다.**

```bash
node cli/src/index.mjs maintenance my-vault
node cli/src/index.mjs health my-vault
```

무엇을 노드로 만들고 무엇을 만들지 않을지는
[무엇을 노드로 만드나](/guide/what-becomes-a-node) 가, 볼트가 자란 다음의
정리는 [볼트가 자란 뒤](/guide/growing-vault) 가 다룹니다.

## 정리

- 시작은 **가진 것에서 뽑아내는 것**입니다. 손으로 백 개 적지 않습니다.
- `analyze` 와 `infer-imports` 는 **볼트를 건드리지 않습니다.** 읽고 나서
  `--apply`.
- 후보 옆의 화살표가 **근거**입니다. 근거가 이상하면 그 후보도 이상합니다.
- `absorb` 는 dry-run 이 기본이고, `--write` 도 원본을 백업한 뒤 내용을 보존합니다.
- **자동 생성물은 뼈대입니다.** 이름·근거·의미 관계는 그다음에 사람이(또는
  에이전트가) 채웁니다.
