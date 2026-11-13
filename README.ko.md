[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh.md)

<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/brand/lockup-dark@2x.png" />
    <img src="public/brand/lockup-light@2x.png" alt="Ontology Atlas" width="360" />
  </picture>
</h1>

<p align="center"><strong>AI 에이전트가 코드를 바꿔도 내 시스템을 계속 이해하세요.</strong></p>

<p align="center">
  코드가 무엇을 하고 왜 그렇게 생겼는지 담은 지도를 저장소 안 마크다운으로 남겨요.<br />
  나도, 내 코딩 에이전트도 그 파일을 읽어요.
</p>

<p align="center">
  <a href="https://ontologyatlas.com/ko/download/"><strong>macOS용 받기</strong></a> ·
  <a href="https://ontologyatlas.com/ko/topology/">브라우저에서 써보기</a> ·
  <a href="https://ontologyatlas.com/ko/guide/">가이드</a>
</p>

<p align="center"><a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-5e6ad2.svg" /></a> <a href="https://github.com/wlsdks/ontology-atlas/releases"><img alt="Latest release" src="https://img.shields.io/github/v/release/wlsdks/ontology-atlas?color=5e6ad2" /></a> <a href="https://mcpservers.org/servers/wlsdks/ontology-atlas"><img src="https://mcpservers.org/badge.svg" alt="Listed on mcpservers.org" height="20" /></a> <a href="https://stackmap.shipwithai.xyz/repos/wlsdks/ontology-atlas"><img src="https://img.shields.io/endpoint?url=https%3A%2F%2Fstackmap.shipwithai.xyz%2Fapi%2Fbadge%2Fontology-atlas.json" alt="On StackMap" height="20" /></a></p>

![이 저장소 자체의 온톨로지를 보여 주는 Ontology Atlas 지도: Ontology Atlas 프로젝트를 고르면 도메인과 역량이 둘레에 놓이고, 왼쪽에 개념 목록, 오른쪽에 프로젝트 기록과 코드 근거 상태가 보여요](docs/assets/readme/topology-overview.png)

## 왜 Atlas인가

코딩 에이전트가 코드를 바꾸는 속도가 이제 팀이 머릿속에 그림을 유지하는 속도보다
빨라요. Atlas는 그 그림을 코드 옆에 둬요. 각 부분이 무엇을 위한 것인지, 어느
파일이 구현하는지, 무엇이 무엇에 기대는지, 아직 아무도 모르는 것이 무엇인지까지요.
에이전트는 작업 전에 그 그림을 읽고 작업 뒤에 갱신을 제안해요. 나는 변경마다 마크다운
diff로 보고 그대로 두거나, 고치거나, 거절해요.

- **에이전트가 맥락을 갖고 시작해요.** Claude Code, Codex, Cursor, Antigravity가 MCP로 작업에 걸린 개념, 코드 경로, 의존 관계, 아직 풀리지 않은 질문을 읽어요.
- **기록은 내가 가져요.** `atlas/` 폴더에 개념마다 마크다운 파일 하나가 있고, 코드처럼 Git으로 버전을 관리하고 리뷰해요.
- **무엇이 사실인지는 내가 정해요.** 에이전트의 제안은 내가 받아들이기 전까지 제안으로 남아요.
- **모르는 것은 모른다고 해요.** 지도의 선은 선언된 관계일 뿐, 실행 시 영향의 증거가 아니에요. 근거가 없으면 안전이 아니라 미확인으로 보여요.

## 화면 둘러보기

<table>
<tr>
<td width="50%"><img src="public/gateway/projects.ko.png" alt="프로젝트: 프로젝트마다 도메인, 역량, 코드 근거 상태가 보여요" /><br /><b>프로젝트</b> — 모든 프로젝트와, 그중 코드 근거가 얼마나 있는지.</td>
<td width="50%"><img src="public/gateway/library.ko.png" alt="자료실: 왼쪽에 원문이 있고, 그 원문으로 쓴 위키 페이지와 그 페이지가 가리키는 개념이 이어져요" /><br /><b>자료실</b> — 문서가 들어가면 출처가 달린 위키 페이지가 나와요.</td>
</tr>
<tr>
<td width="50%"><img src="public/gateway/planning.ko.png" alt="기획: 왼쪽에 프로젝트 폴더의 마크다운 파일 목록, 오른쪽에 열어 둔 문서" /><br /><b>기획</b> — 프로젝트 폴더의 마크다운을 복사하지 않고 그 자리에서 읽어요.</td>
<td width="50%"><img src="public/gateway/changes.ko.png" alt="브리핑: 한 주 동안의 커밋과 각 커밋의 날짜" /><br /><b>브리핑</b> — 기간 동안 무엇이 바뀌었는지 풀 리퀘스트, 커밋, 파일로 나눠 봐요.</td>
</tr>
<tr>
<td width="50%"><img src="public/gateway/insights.ko.png" alt="분석: 책임 사이의 관계와 각 주장 옆의 근거" /><br /><b>분석</b> — 무엇이 무엇에 기대는지, 근거와 함께 봐요.</td>
<td width="50%"><img src="public/gateway/git.ko.png" alt="Git: 아직 커밋하지 않은 개념 변경과 그 마크다운 diff" /><br /><b>Git</b> — 커밋하기 전에 정확한 마크다운 diff를 봐요.</td>
</tr>
<tr>
<td width="50%"><img src="public/gateway/harness.ko.png" alt="하네스: 저장소가 코딩 에이전트에게 말해 두고, 막고, 지켜보는 것" /><br /><b>하네스</b> — 저장소가 에이전트에게 말해 두고, 막고, 지켜보는 것.</td>
<td width="50%"><img src="public/gateway/automations.ko.png" alt="자동화: 폴더를 최신으로 유지하는 예약 점검" /><br /><b>자동화</b> — 폴더를 최신으로 유지하는 예약 점검.</td>
</tr>
</table>

**v1.9의 새 기능:** 저장소의 풀 리퀘스트, 커밋, 파일을 따로 읽는 Git·PR 브리핑과, 프로젝트 폴더의 마크다운을 그 자리에서 읽는 기획. [릴리스](https://github.com/wlsdks/ontology-atlas/releases)에서 확인하세요.

시작하기 전에 알아 두면 좋은 것:

- 지도의 선은 선언된 관계이지 실행 영향의 증거가 아니에요. 범례가 모든 표시와 방향을 설명해요. [지도](docs/features/map/flat-dial.md)
- 빈 폴더에서는 시작 동작이 나타나고, 시작이 실패하면 파일을 덮어쓰지 않고 다시 시도할 수 있어요. 팝업 투어는 없어졌어요. [첫 실행](docs/features/first-run.md)
- 자료실 설정과 점검은 앱에서 해요. 브라우저에서는 앱을 받거나 파일을 추가할 수 있어요. [자료실](docs/features/library/workspace.md)
- 기획은 읽기 전용이고, macOS 앱에서 고른 폴더에서 동작해요. 마크다운과 PNG/JPEG 이미지를 보여 줘요. [기획](docs/FEATURES.md)
- Git의 보내기 전용 동작은 새 파일 변경을 커밋하지 않아요. 폴더나 브랜치의 상태가 달라졌다면 다시 확인할 수 있어요. 받아오기는 저장소 전체의 파일을 바꿀 수 있어요. [Git](docs/features/git.md)
- 폴더를 연결하기 전에도 앱은 자료실, 기획, 에이전트, 브리핑을 열어 둬요. [기능 목록](docs/FEATURES.md)

## 빠른 시작

1. **설치**: [다운로드 페이지](https://ontologyatlas.com/ko/download/)에서 앱을 받거나 [브라우저 버전](https://ontologyatlas.com/ko/topology/)을 여세요.
2. **폴더 열기**: Atlas는 폴더 안의 마크다운을 그 자리에서 읽거나 저장소에 `atlas/` 폴더를 새로 만들고, 무엇이든 쓰기 전에 경로를 먼저 보여 줘요.
3. **에이전트 연결**: **에이전트 › MCP**에서 쓰는 도구의 **연결**을 누르고, 에이전트를 다시 시작한 뒤 다음 작업에 대해 물어보세요.

macOS(Apple Silicon)용 앱은 서명과 공증을 거쳤고, 앱 안에 MCP 서버가 들어 있어요. Windows x64는 서명하지 않은 베타예요. Linux에서는 브라우저 버전을 쓰거나, [소스 체크아웃에서 CLI와 MCP 서버를 실행](cli/README.md#set-up-from-a-source-checkout)하세요. [릴리스](https://github.com/wlsdks/ontology-atlas/releases)에 버전마다 파일과 체크섬이 있어요.

## 동작 방식

```text
your-repo/
├── src/
└── atlas/                 ← 코드와 함께 클론하고, 브랜치를 따고, 리뷰해요
    ├── project.md
    ├── domains/  capabilities/  elements/
    ├── sources/           받은 그대로 보관한 문서
    └── wiki/              그 문서로 쓴 페이지, 모든 사실에 출처 표시
```

frontmatter에 `kind:`가 있는 마크다운 파일 하나가 개념 하나예요. `uid`는 바뀌지 않고,
`slug`는 지금의 주소이며, `path`는 그 개념이 설명하는 코드를 가리켜요. 지도, 문서,
자료실, 분석, Git 화면이 모두 이 파일을 읽어요.

에이전트가 폴더에 닿는 길은 둘이에요.

- **MCP:** 에이전트가 Atlas MCP 서버를 띄우고, 그 서버가 디스크의 폴더를 직접 읽고 써요. 앱이 꺼져 있어도 돼요. [에이전트 연결하기](docs/guide/connect-agent.md) · [MCP 레퍼런스](mcp/README.md)
- **ACP:** Claude Agent와 Codex는 앱 안 대화에서도 일해요. 쓰기는 내가 허락할 때까지 기다려요. [에이전트](docs/features/agents.md)

## 로컬 우선

- 백엔드, 계정, 텔레메트리가 없어요. 폴더는 내 디스크에 평범한 마크다운으로 남아요.
- 내 API key나 로컬 모델로 모델을 부르는 기능은 직접 켜야 쓸 수 있고, 호출마다 목적지가 `.ontology-atlas/llm-audit.jsonl`에 기록돼요.
- 연결한 코딩 에이전트는 내 질문과 읽은 맥락을 자기 제공자에게 보낼 수 있어요. 이 전송은 Atlas의 기록에 들어가지 않아요.

[신뢰에 관하여](docs/guide/trust.md) · [보안](SECURITY.md)

## 현재 상태

Atlas는 아직 초기 단계예요. 우리 벤치마크에서는 Atlas를 썼을 때 더 나은 답을 아직
확인하지 못했고, Atlas 쪽이 더 느렸어요([정정 기록](docs/benchmark/README.md#current-measurement-status)).
구축 실험과 그 실패, 한계는 [구축 측정](docs/benchmark/CONSTRUCTION.md)에 있어요.

## 문서

[Atlas란?](docs/guide/what-is-atlas.md) · [첫 5분](docs/guide/first-five-minutes.md) · [무엇이 개념이 되나](docs/guide/what-becomes-a-node.md) · [관계](docs/guide/relations.md) · [명세](docs/ONTOLOGY-ATLAS-SPEC.md) · [기능](docs/FEATURES.md) · [CLI](cli/README.md) · [아키텍처](docs/ARCHITECTURE.md)

## 기여하기

먼저 [CONTRIBUTING.md](CONTRIBUTING.md)를 읽어 주세요. 외부 PR은 포크에서 보내요.
사람과 에이전트가 함께 따르는 규칙은 [AGENTS.md](AGENTS.md)에 있어요.

```bash
pnpm install
pnpm dev
pnpm checks:changed -- --run
```

`pnpm pr:land <number>`는 리뷰를 마친 PR을 머지하고 원래 커밋을 그대로 남겨요.
전체 검사 안내는 [개발 검사](docs/DEVELOPMENT-CHECKS.md)에 있어요. 저장소 명령 표는
영어 README의 [Contributing](README.md#contributing)에 있어요.

## Moru

모루는 아틀라스의 픽셀 물개 캐릭터이고, 나침반은 앱을 나타내는 심볼이에요. [동작 70개·포즈 16개와 원본](assets/brand/moru/README.md)을 프로젝트에 담았어요. [로컬 모션 스튜디오](assets/brand/moru/preview.html)를 열면 재생·정지와 프레임별 확인을 할 수 있어요.

폴더 선택 화면에서는 모루가 인사하고 작은 폴더를 보여주며 기다리고, 폴더를 여는 동안에는 장난스러운 동작을 멈추고 기존 대기 화면으로 넘어갑니다. 다운로드 페이지에서는 별도의 환영 동작을 보여줍니다. 이동은 발이 공중에 뜬 짧은 점프 구간에만 일어납니다. 커서를 올리면 뛰던 동작을 착지까지 마친 뒤 기다립니다. 모루를 누르면 수줍어하기·박수·춤·생각하기·고민하기·하트·웃음·지느러미 춤으로 짧게 반응하며, 우클릭 또는 Shift+F10 메뉴에서 일시정지할 수 있습니다. 캐릭터 옆에는 재생 버튼이 표시되지 않습니다. 동작 줄이기에서는 정지된 표정으로 반응합니다.

새로운 32포즈 동작으로 인사·하이파이브·모자 인사를 더했고, 다운로드 환영 화면에서는 물고기 마술도 볼 수 있습니다. 클릭하면 작은 말풍선에 하트·음표·반짝임이 나오고, 혼자 돌아오는 점프에서도 가끔 음표를 띄웁니다. 작업 대기 중에는 조용히 기다립니다. 까꿍·빨개지는 얼굴·비눗방울 놀이는 모션 스튜디오에서 볼 수 있습니다.

모루는 작은 고개 인사에서도 둥근 몸을 유지합니다. 평소에는 서로 다른 세 가지 동작 흐름과 쉼을 이어가고, 클릭 반응은 최근 두 동작을 피해서 골고루 보여줍니다. 작업 대기 중에는 조용히 제자리에서 기다립니다.

<img src="assets/brand/moru/moru-poses-showcase.png" width="400" height="400" alt="Moru" />

<details>
<summary>모루의 움직임 보기</summary>

<img src="assets/brand/moru/animated/gif/authored/moru-wave.gif" width="128" height="128" alt="인사하는 모루" />
<img src="assets/brand/moru/animated/gif/authored/moru-source-read.gif" width="128" height="128" alt="자료를 읽는 모루" />
<img src="assets/brand/moru/animated/gif/authored/moru-await-permission.gif" width="128" height="128" alt="사람의 결정을 기다리는 모루" />
<img src="assets/brand/moru/animated/gif/authored/moru-clap.gif" width="128" height="128" alt="확인된 완료를 반기는 모루" />
<img src="assets/brand/moru/animated/gif/authored/moru-sing.gif" width="128" alt="노래하는 모루" />
<img src="assets/brand/moru/animated/gif/authored/moru-fish-play.gif" width="128" alt="물고기와 노는 모루" />
<img src="assets/brand/moru/animated/gif/authored/moru-dance.gif" width="128" alt="춤추는 모루" />
<img src="assets/brand/moru/animated/gif/authored/moru-chorus.gif" width="128" alt="모루들의 합동 춤" />
<img src="assets/brand/moru/animated/gif/authored/moru-shy.gif" width="128" alt="수줍게 웃는 모루" />
<img src="assets/brand/moru/animated/gif/authored/moru-friend-play.gif" width="128" alt="친구와 공놀이하는 모루" />
<img src="assets/brand/moru/animated/gif/authored/moru-pup-cuddle.gif" width="128" alt="새끼 모루 셋과 안기는 모루" />
<img src="assets/brand/moru/animated/gif/authored/moru-rainy-day.gif" width="128" alt="비 오는 날 우산 쓴 모루" />
<img src="assets/brand/moru/animated/gif/authored/moru-snow-day.gif" width="128" alt="눈송이를 바라보는 모루" />
<img src="assets/brand/moru/animated/gif/authored/moru-breeze.gif" width="128" alt="산들바람을 느끼는 모루" />
<img src="assets/brand/moru/animated/gif/authored/moru-somersault.gif" width="128" height="128" alt="공중제비 도는 모루" />
<img src="assets/brand/moru/animated/gif/authored/moru-toy-fishing.gif" width="128" height="128" alt="낚싯줄 물고기 장난감을 갖고 노는 모루" />
<img src="assets/brand/moru/animated/gif/authored/moru-laptop-code.gif" width="128" height="128" alt="노트북으로 코딩하는 모루" />
<img src="assets/brand/moru/animated/gif/authored/moru-thinking.gif" width="128" height="128" alt="생각하는 모루" />
<img src="assets/brand/moru/animated/gif/authored/moru-pondering.gif" width="128" height="128" alt="고민하는 모루" />
<img src="assets/brand/moru/animated/gif/authored/moru-hearts.gif" width="128" height="128" alt="작은 하트를 보내는 모루" />
<img src="assets/brand/moru/animated/gif/authored/moru-laugh.gif" width="128" height="128" alt="깔깔 웃는 모루" />
<img src="assets/brand/moru/animated/gif/authored/moru-frown.gif" width="128" height="128" alt="살짝 찡그리는 모루" />
<img src="assets/brand/moru/animated/gif/authored/moru-grumpy.gif" width="128" height="128" alt="귀엽게 화내는 모루" />
<img src="assets/brand/moru/animated/gif/authored/moru-flipper-groove.gif" width="128" height="128" alt="지느러미로 춤추는 모루" />
<img src="assets/brand/moru/animated/gif/authored/moru-ontology-orbit.gif" width="128" height="128" alt="떠오르는 온톨로지 모형을 보는 모루" />
<img src="assets/brand/moru/animated/gif/authored/moru-ontology-dance.gif" width="128" height="128" alt="온톨로지 모형과 함께 춤추는 모루" />
<img src="assets/brand/moru/animated/gif/authored/moru-soft-bow.gif" width="128" height="128" alt="살짝 고개 숙여 인사하는 모루" />
<img src="assets/brand/moru/animated/gif/authored/moru-hat-tip.gif" width="128" height="128" alt="작은 모자로 인사하는 모루" />
<img src="assets/brand/moru/animated/gif/authored/moru-magic-fish.gif" width="128" height="128" alt="마술로 물고기를 보여주는 모루" />
<img src="assets/brand/moru/animated/gif/authored/moru-peekaboo.gif" width="128" height="128" alt="까꿍 놀이하는 모루" />
<img src="assets/brand/moru/animated/gif/authored/moru-warm-temper.gif" width="128" height="128" alt="얼굴이 빨개졌다 진정하는 모루" />
<img src="assets/brand/moru/animated/gif/authored/moru-flipper-five.gif" width="128" height="128" alt="하이파이브 하는 모루" />
<img src="assets/brand/moru/animated/gif/authored/moru-folder-peek.gif" width="128" height="128" alt="폴더를 들여다보는 모루" />
<img src="assets/brand/moru/animated/gif/authored/moru-bubble-chase.gif" width="128" height="128" alt="비눗방울을 따라가는 모루" />


</details>

## 라이선스

[MIT](LICENSE). 서드파티 고지는 [NOTICE.md](NOTICE.md)에, 라이선스 전문은 [public/third-party-licenses.txt](public/third-party-licenses.txt)에 있어요. 픽셀 마스코트와 그 출처는 [브랜드](docs/design/brand.md)에 설명돼 있어요.
