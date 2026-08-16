# 실행기 마크 — 어디서 왔고 무엇을 고쳤나

이 폴더의 SVG 38장은 **남의 제품 마크**다. 「이게 그 도구다」를 말하는 식별
표시로만 쓰고, 그 벤더의 디자인을 흉내 내는 데는 쓰지 않는다.

## 그림 (38장 전부)

| | |
|---|---|
| 출처 | [ACP 레지스트리](https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json) — 프로토콜 조직이 **클라이언트 UI 를 위해** 공개한 자산이다 |
| 받는 시점 | 빌드 때 한 번(`pnpm acp:registry`). 앱은 실행 중에 이미지를 받으러 나가지 않는다 — 신뢰 헌장 ①(인터넷 없이 돌아간다) ②(사용자가 켜지 않은 통신 0) |
| 수정 | 없음. 받은 파일 그대로 커밋한다 |
| 거르는 것 | `<script>` 나 외부 `href` 가 든 SVG 는 저장하지 않는다(`scripts/build-acp-registry.mjs`) |
| 그리는 방식 | **마스크**로 쓴다(`VendorMark`). SVG 안의 내용은 화면에 그려지지 않고 실루엣만 남으므로, 남의 파일이 우리 화면에서 할 수 있는 일이 없다 |

레지스트리는 등록 규칙으로 **색 박은 SVG 를 거부한다** — 38장이 전부
`fill="currentColor"` 단색이다. 그래서 색은 아래에서 따로 온다.

## 색 (11개만)

| | |
|---|---|
| 출처 | [simple-icons](https://github.com/simple-icons/simple-icons) `data/simple-icons.json` (CC0-1.0) 의 `hex` 값 |
| 우리가 쓰는 것 | **색 값 하나뿐**이다. 경로 데이터는 안 쓴다 — 그림은 위 레지스트리의 그 벤더 자신의 마크다 |
| 짝짓기 | `scripts/build-acp-registry.mjs` 의 `BRAND_MARK` — **사람이 하나씩 확인한 것만** 둔다 |
| 없으면 | 무채색(`--color-vendor-mark-ink`)으로 그린다 |

### 왜 자동으로 짝짓지 않나

이름으로 자동 매칭했더니 **엉뚱한 브랜드 색**이 붙었다(실측 2건):

- `amp-acp`(Sourcegraph Amp) → 구글 AMP 의 파랑 `#005AF0`
- `pi-acp` → 라즈베리파이

**색이 없는 것보다 틀린 색이 나쁘다.** 없으면 화면이 무채색으로 떨어질 뿐이지만,
틀리면 남의 브랜드를 잘못 표시하는 것이다. 그래서 자동 매칭을 안 쓴다.

### 지금 색이 있는 11개

| 실행기 | simple-icons 제목 |
|---|---|
| `claude-acp` | Claude Code |
| `gemini` | Google Gemini |
| `mistral-vibe` | Mistral AI |
| `qwen-code` | QWen |
| `codebuddy-code` | CodeBuddy |
| `glm-acp-agent` | Z.ai |
| `cursor` | Cursor |
| `github-copilot-cli` | GitHub Copilot |
| `opencode` | OpenCode |
| `kimi` | Kimi |
| `cline` | Cline |

### OpenAI(Codex)는 일부러 비어 있다

OpenAI 마크는 벤더 요청으로 simple-icons v16 에서 **빠졌다.** 그림은 ACP
레지스트리가 클라이언트 UI 용으로 공개한 것을 쓰되 **색은 넣지 않는다.**
같은 이유로 Buzz 도 OpenAI 마크를 번들하지 않는다(`block/buzz` 의
`desktop/public/harness-logos/CREDITS.md`).

## 판을 밝게 까는 이유

이 앱은 어두운 화면 하나인데, 여기 놓이는 마크는 우리 것이 아니라 그 벤더의
것이고 대부분 밝은 바탕 기준으로 그려져 있다 — 색을 확인한 11개 중 **6개가
검정~`#2D2D2D`** 다. 어두운 판 위에 그대로 올리면 검은 판에 검은 그림이 된다
(2026-08-16 에 실제로 그렇게 나갔다). Buzz 도 어두운 마크에는 흰 판을 따로
깔아 준다.

판·테두리·기본 잉크는 전부 무채색 토큰이고
(`--color-vendor-plate` · `-edge` · `--color-vendor-mark-ink`), **32px 타일
안에서만** 산다. 게이트: `tests/contract/vendor-mark-plate.contract.test.ts`.

## 마크를 더할 때

1. 그림은 레지스트리에서 자동으로 온다 — 손으로 넣지 않는다.
2. 색을 붙이려면 `BRAND_MARK` 에 **확인한 짝**을 적고 위 표에 한 줄 더한다.
3. 벤더가 재배포를 금지한 마크는 넣지 않는다. 색 없이 무채색으로 두는 것이
   기본값이고, 그건 정상 동작이지 미완성이 아니다.
