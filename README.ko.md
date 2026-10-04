[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh.md)

<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/brand/lockup-dark@2x.png" />
    <img src="public/brand/lockup-light@2x.png" alt="Ontology Atlas" width="360" />
  </picture>
</h1>

<p align="center"><strong>AI 에이전트가 코드를 바꿔도 내 시스템을 계속 이해하세요.</strong></p>

![Online Store 프로젝트를 고른 Ontology Atlas macOS 앱: 그 프로젝트의 도메인 이름이 둘레에 놓이고, 관계없는 것은 흐려지며, 오른쪽 패널에 프로젝트 기록과 코드 근거 상태가 보여요](docs/assets/readme/topology-overview.png)

<p align="center">
  <a href="https://ontologyatlas.com/ko/download/"><strong>macOS용 받기</strong></a> ·
  <a href="https://ontologyatlas.com/ko/download/">Windows x64 베타</a> <sub>미서명</sub> ·
  <a href="https://ontologyatlas.com/ko/topology/">브라우저에서 써보기</a> ·
  <a href="https://ontologyatlas.com/ko/guide/">가이드</a>
</p>

<p align="center"><a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-5e6ad2.svg" /></a> <a href="https://mcpservers.org/servers/wlsdks/ontology-atlas"><img src="https://mcpservers.org/badge.svg" alt="Listed on mcpservers.org" height="20" /></a></p>

- **macOS**(Apple Silicon)용 앱은 서명과 공증을 거쳤고, 앱 안에 MCP 서버가 들어 있어요.
- **Windows x64**는 서명하지 않은 베타예요. SmartScreen이 경고할 수 있고, 회사에서 관리하는 PC는 실행을 막을 수 있어요.
- **Linux**용 앱은 아직 없어요. 브라우저 버전을 쓰거나, [소스 체크아웃](cli/README.md#set-up-from-a-source-checkout)에서 CLI와 MCP 서버를 실행하세요.

[다운로드 페이지](https://ontologyatlas.com/ko/download/)에 릴리스마다 버전, 크기, 체크섬이 있고, [GitHub Releases](https://github.com/wlsdks/ontology-atlas/releases)에도 같은 파일이 있어요. 아래에서 링크하는 저장소 문서는 영어로 쓰여 있어요.

## 하는 일

- **코딩 에이전트에게 작업 맥락을 줘요.** Claude Code, Codex, Cursor, Antigravity가 MCP로 작업에 걸린 역량, 코드 경로, 의존 관계, 근거, 미확인 사항을 읽어요.
- **그 의미를 내가 가진 마크다운에 남겨요.** 저장소 안 `atlas/` 폴더에 개념 하나당 파일 하나가 있어요. 이력과 리뷰는 Git이 맡아요.
- **최종 판단은 사람이 해요.** 제안된 변경은 마크다운 diff로 오고, 그대로 두거나 고치거나 거절할 수 있어요.
- **사람에게도 같은 폴더를 보여 줘요.** 지도, 문서, 자료실, 분석, Git 기록이 모두 그 파일을 읽어요.
- **모르는 것은 모른다고 해요.** 지도의 선은 선언된 관계일 뿐, 실행 시 영향의 증거가 아니에요. 근거가 없으면 안전이 아니라 미확인으로 보여요.

**아직 증명하지 못한 것:** 다시 채점해 보니 우리 벤치마크에서는 Atlas를 썼을 때 답의 품질 차이를 아직 측정하지 못했고, Atlas 쪽이 더 느렸어요([정정 기록](docs/benchmark/FINDINGS-2026-08-31-metric-split.md)).

## 빠른 시작

1. **설치**: [다운로드 페이지](https://ontologyatlas.com/ko/download/)에서 앱을 받거나 [브라우저 버전](https://ontologyatlas.com/ko/topology/)을 여세요.
2. **폴더 열기**: Atlas는 폴더 안의 마크다운을 그 자리에서 읽거나 저장소에 `atlas/` 폴더를 새로 만들고, 무엇이든 쓰기 전에 경로를 먼저 보여 줘요.
3. **에이전트 연결**: **에이전트 › MCP**에서 쓰는 도구의 **연결**을 누르고, 에이전트를 다시 시작한 뒤 다음 작업에 대해 물어보세요.

## 폴더

```text
your-repo/
├── src/
└── atlas/                 ← 코드와 함께 클론하고, 브랜치를 따고, 리뷰해요
    ├── project.md
    ├── domains/  capabilities/  elements/
    ├── sources/           받은 그대로 보관한 문서
    └── wiki/              그 문서로 쓴 페이지, 모든 사실에 출처 표시
```

frontmatter에 `kind:`가 있는 마크다운 파일 하나가 개념 하나예요. `uid`는 바뀌지 않고, `slug`는 지금의 주소이며, `path`는 그 개념이 설명하는 코드를 가리켜요. 한 폴더에 담는 개념 수에는 제한이 없어요.

[무엇이 노드가 되나](docs/guide/what-becomes-a-node.md), [관계](docs/guide/relations.md), [명세](docs/ONTOLOGY-ATLAS-SPEC.md)에서 더 읽을 수 있어요.

## 코딩 에이전트와 함께 쓰기

- **MCP**(Model Context Protocol): 에이전트가 Atlas MCP 서버를 띄우고, 그 서버가 디스크의 폴더를 직접 읽고 써요. 앱이 꺼져 있어도 돼요. [에이전트 연결하기](docs/guide/connect-agent.md) · [MCP 레퍼런스](mcp/README.md)
- **ACP**(Agent Client Protocol): Claude Agent와 Codex는 앱 안 대화에서도 일해요. 읽기는 바로 되고, Atlas 쓰기는 매번 한 번 허락해야 적혀요. [에이전트 화면](docs/features/agents.md)

**지도를 계속 보강하기.** 지도에 분석 현황이 표시돼요. macOS 앱에서 연결된 코드 폴더를 살펴보고 질문을 골라 ‘추가 분석’을 누르면 ACP 에이전트에게 한 번 전달돼요. 날짜가 남은 결과를 다시 보거나 별도의 개선 초안을 준비할 수 있어요. 지도를 여는 것만으로 유료 분석을 시작하지 않으며, 답변과 에이전트 작업 진행률은 의미 승인이나 완성률이 아니에요. 로컬 모델의 네이티브 소스 구축은 아직 지원하지 않아요. [계속 분석하기](docs/features/map/README.md#optional-continued-analysis)

## 구축 성능 측정

2026-10-03에 처음 보는 MIT Python 설정 라이브러리를 실제 ACP 세션으로 구축하고, 소스를 볼 수 없는 별도 읽기 세션과 소스 감사를 진행했어요. 한 저장소의 제한된 결과이며 모델 순위나 의미 품질 인증은 아니에요.

| 경로 | 측정 결과 | 의미 품질 근거 |
|---|---|---|
| Claude Sonnet 5.5, low · 전체 → 구축 프로필 | 107.6 → 100.4초; 도구 설명·입력 스키마 24.0% 감소 | 완전히 답한 질문 3/6 → 2/6; 검증된 주장 17/18 → 18/21; 모두 검토 필요 |
| Codex Luna low · 초기 ACP 진단 | 250.2초; 노드 3개; 호출 33회 중 실패 4회 | 완전히 답한 질문 1/6; 주장 13/13 검증; 설명 범위는 부족 |
| Codex Luna xhigh · 전체 / 구축 ACP 시도 | 모두 900초 제한 도달; 노드 4 / 2개; 완료 기록 없음 | 구축 미완료 |
| 로컬 27B · 빈 볼트 대화 루프 수정 전 → 후 | 모델 요청 4 → 2회; 189.1 → 151.6초 | 소스 도구가 없음을 설명; 생성 노드 0개 |

선택형 `OATLAS_TOOL_PROFILE=construction`은 첫 구축용 기존 도구 20개를 보여줘요. 기본 `full`은 40개예요. 이번 비교에서는 작은 도구 목록이 인수인계 품질을 개선하지 못했어요. 로컬 소스 MCP 실험도 저장 전에 실패해 코드 기반 구축 품질은 아직 측정하지 못했어요. 앱 내부 로컬 대화와 ACP 소스 구축은 도구 능력이 달라요. 로컬 루프는 Node HTTP 연결로 측정했고, 설치 앱의 네이티브 연결은 검증하지 않았어요.

`pnpm benchmark:construction <runs.json> [--json]`으로 시간·사용량·도구 오류·그래프/경로 검사·소스 차단 답변·주장 감사를 구분해 기록하세요. [실험 절차와 실패·한계](docs/benchmark/CONSTRUCTION.md) · [프로필 설정](mcp/README.md#first-construction-discovery-oatlas_tool_profile)


본문 근거 개선 실험에서는 기존 설정 라이브러리의 완전 답변이 **2/6→4/6**, 검증된 주장은 **19/20**이었어요. 새 재시도 라이브러리도 4/6에 답했지만 21개 주장 중 16개만 검증됐고 4개는 오류, 1개는 미확인이었어요. 같은 소스 근거를 담은 후속 응답은 **11,105→2,042바이트(81.6%)** 줄었어요. 설정 라이브러리 구축은 137.5초로 전체 속도 개선은 아니며, 일반적인 의미 품질·공식 검증·네이티브 로컬 구축은 아직 입증되지 않았어요. [본문 근거 실험](docs/benchmark/CONSTRUCTION.md#body-evidence-improvement-trial)

지속 분석 실험: 새로운 TypeScript 표현식 라이브러리 한 곳에서 ACP 추가 조사와 검토한 본문 보강 후, 소스를 가린 독자의 답변은 **완전 0 / 부분 5 / 미확인 1**에서 **1 / 4 / 1**로 바뀌었어요. 조사는 22.8초였고 구축·조사의 제공업체 비용은 확인하지 못했어요. 해시가 있는 인용 21개는 소스와 맞았지만 근거 없는 승인 문구와 다른 노드의 오래된 미확인 기록은 남았어요. 제한된 보강 실험이며 공식 검증이나 모델 순위는 아니에요. [측정과 실패](docs/benchmark/CONSTRUCTION.md#continued-analysis-and-reuse-trial)

승인한 모델 제안을 적용하다 실패하면 저장 완료가 확인된 파일을 표시하고 폴더를 다시 읽어요. 다시 읽기 오류도 따로 알려줘요. 실패한 저장 자체도 파일을 바꿨을 수 있으며 자동으로 되돌리지는 않아요. 다시 시도하기 전에 문서를 확인해 주세요.

## 로컬 우선과 개인정보

- Atlas에는 백엔드, 계정, 텔레메트리가 없어요. 폴더는 내 디스크에 평범한 마크다운으로 남아요.
- 내 API key나 로컬 모델로 Atlas가 모델을 부르는 기능은 직접 켜야 쓸 수 있고, 호출마다 목적지가 `.ontology-atlas/llm-audit.jsonl`에 기록돼요.
- 연결한 코딩 에이전트는 내 질문과 읽은 맥락을 자기 제공자에게 보낼 수 있어요. 이 전송은 그 기록에 들어가지 않아요.

[신뢰에 관하여](docs/guide/trust.md) · [보안](SECURITY.md)

## CLI

CLI는 소스 체크아웃에서 Node.js 24로 `node cli/src/index.mjs`를 실행해 써요. npm 패키지는 없어요. 폴더를 만들고, 검증하고, 컴파일하고, 조회할 수 있고, `mcp-verify`로 에이전트 연결이 살아 있는지 확인해요. [CLI 레퍼런스](cli/README.md)

## 개발

먼저 [CONTRIBUTING.md](CONTRIBUTING.md)를 읽어 주세요. 외부 PR은 포크에서 보내요. 사람과 에이전트가 함께 따르는 규칙은 [AGENTS.md](AGENTS.md)에 있어요.
`pnpm install`과 `pnpm dev`로 시작하고, `pnpm checks:changed -- --run`으로 변경을 검사하고, `pnpm pr:land <number>`로 머지해요.
저장소 명령 목록은 영어 README의 [Development](README.md#development) 절에, 전체 검사 안내는 [Development checks](docs/DEVELOPMENT-CHECKS.md)에 있어요.

## 라이선스

[MIT](LICENSE). 서드파티 고지는 [NOTICE.md](NOTICE.md)에, 라이선스 전문은 [public/third-party-licenses.txt](public/third-party-licenses.txt)에 있어요.
