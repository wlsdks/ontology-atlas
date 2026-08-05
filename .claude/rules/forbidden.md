# Forbidden patterns — 절대 하지 말 것

> Auto-loaded. 위반은 PR 단계에서 반려된다.

## 디자인

> **정본은 `docs/DESIGN-SYSTEM.md` "Absolute rules (Don'ts)" 다.** 아래는 그
> 목록의 **의도된 부분집합** — 이 파일은 매 턴 실리므로 «파일을 열기 전에
> 내려야 하는 판단»만 고른다. 각 줄 끝에 달린 `dont:` HTML 주석으로 정본과 짝이
> 맞춰지고, 정본에 없는 열쇠를 여기 쓰면
> `tests/contract/design-donts-parity.contract.test.ts` 가 막는다.
>
> **여기 없다고 허용된 것이 아니다** — 정본에는 여섯이 더 있다(겹친 팝오버 ·
> 막지 않는 모달 · 떠 있는 상자 수프 · 일회성 토폴로지 값 · 겹침 허용 ·
> glow 링). UI 파일을 열면 `design.md` 가 실리고 거기서 정본을 가리킨다.

- **토폴로지 노드 클릭 → 풀스크린/풀블리드 상세 모달.** 클릭의 기본값은 ego
  포커스 + 노드 옆 컴팩트 팝오버이고, 전체 상세는 팝오버 안의 opt-in 이다.
  (이 한 줄이 여기 있는 이유: 나머지 금지는 값 규칙이라 lint 가 잡는데 이건
  **상호작용 설계**라 못 잡고, `design.md` 는 UI 파일을 읽을 때만 실려서 —
  새 표면을 처음부터 쓰는 경로에서는 안 실릴 수 있다. 상주가 필요하다.)
  <!--dont:node-click-fullscreen-modal-->
- 보라 → 핑크 그라디언트 <!--dont:purple-pink-gradient-->
- glassmorphism (`backdrop-blur-*`) <!--dont:glassmorphism-->
- glow pulse · neon · halo animation <!--dont:glow-pulse-neon-->
  - 사방으로 번지는 색 테두리(`boxShadow: 0 0 …` glow 링)도 같은 금지다.
    <!--dont:glow-boxshadow-ring-->
  - **명문 예외 1건 (2026-07-29): 발자국 트레일 번짐** — 지도 위에 찍히는 발자국
    자국 둘레를 흐릿하게 밝히는 것. canvas 2D 의 `ctx.shadowBlur` 로만 존재하고
    `src/shared/lib/footprint-glyph.ts` **한 파일 안에서만** 산다.
    조건: **정적**(깜빡이거나 움직이면 안 된다) · **opt-in**(설정에서 사용자가
    직접 켠다) · **기본 0**(아무도 켜지 않으면 화면에 아무것도 안 생긴다) ·
    **상한 6px**(그보다 크면 번짐이 발자국 자체보다 커져서, 결국 여기서 금지한
    그 glow 가 된다).
    소유자가 *"노란색으로 빛나게"* 라고 지시했을 때, 위 금지를 깨지 않고 들어줄
    수 있는 가장 작은 형태가 이것이다. "기본값이 0이니까 규칙을 지킨 셈"이라는
    변명은 **명시적으로 기각**됐다 — 금지된 것을 설정 뒤에 숨겨 두는 건 지킨
    게 아니므로, 이렇게 예외로 드러내 적었다.
    이 예외를 지키는 게이트(gate — 어기면 CI 가 자동으로 실패하는 검사) 둘:
    `eslint.config.mjs` 의 `shadowBlur` 셀렉터(위 한
    파일만 통과시킨다) + `tests/contract/footprint-bloom-exception.contract.test.ts`
    (기본값이 0인가 · 상한이 6인가 · 쓰는 곳이 하나뿐인가 · 이 문서에 적혀 있는가).
- 움직이는 그라디언트 배경 · 오로라 <!--dont:animated-gradient-bg-->
  - **어디까지 적용되나 (2026-07-29)**: 이 금지는 **앱 화면에 그려지는 것**에만
    적용된다. 브랜드 자산(OS 아이콘 · 파비콘 · og/마케팅 이미지)은 앱 화면 밖이라
    그라디언트를 써도 된다 — 단 **인디고 한 색만 밝기별로 늘어놓은 램프
    (`#787EF6` → `#3E4BDF`)** 까지고, 다른 색을 새로 들이거나 여러 색을 섞는
    그라디언트는 브랜드 자산에서도 금지다. 앱 **안**에 그려지는 마크(`BrandMark`)
    는 `currentColor` 단색이라 이 예외가 필요 없다.
    좌표·색을 정하는 단 하나의 파일은 `src/shared/ui/brand-mark.tsx`.
- scale 기반 hover (`hover:scale-*`) <!--dont:scale-hover-->
- 둘 이상의 채색 시스템 (인디고 외 새 brand color 추가)
  <!--dont:multi-color-system-->
- 라벨 끝의 장식 화살표 (`열기 →`, 라벨 뒤 `ArrowRight`/`ArrowUpRight` 아이콘)
  — 뜻이 있는 화살표(경로·순서·인과, 외부 링크 앞에 붙는 `↗`)는 예외.
  게이트: `tests/contract/label-decoration.contract.test.ts`
  <!--dont:decorative-trailing-arrow-->
- 같은 모양 카드를 여러 장 늘어놓을 때 카드 높이가 글자 수에 따라 제각각이 되게
  두기 (같은 줄의 카드는 높이가 같아야 한다)
  <!--dont:content-decided-card-height-->

**[폐기됨 2026-07-24] 예전의 "온톨로지 스튜디오 게임 예외"는 없어졌다.** 한때
`/ontology/studio` 의 `.studio-stage` 안에서는 `--studio-*` 토큰으로 glow/gradient/
aura/particle/rarity(gold)/shimmer 를 허용했었다. fable 의 판정 B 와 소유자 확정으로
**되돌렸다** — "게임처럼 중독되게" 는 비유였지 만들라는 사양이 아니었고, 게임 같은
겉모습은 이 화면이 내놓는 의사결정 자료를 덜 믿게 만들었다(예외를 연 것이 실수였다).
이 화면은 이제 절제된 **나침 무대(Compass Stage)** 이고, 앱의 나머지와 똑같이
무채색 + 인디고 한 색 + `--color-*` 토큰만 쓴다. **glow/rarity/particle/gem 은 여기서도
금지**다. `--studio-*` 게임 토큰 블록은 `app/globals.css` 에서 지웠다. 사람을 붙잡는
것은 반짝이는 효과가 아니라 「다음 할 일이 보인다 → 고치면 바로 반영된다 → 진전이
쌓인다」는 반복이다. 배경: `[[ontology-studio-game-direction]]`.

세부: `@.claude/rules/design.md` · `@docs/DESIGN-SYSTEM.md`.

## 라우팅

- 없앤 라우트를 되살리기 — `/admin/*`, `/login`, `/signup`, `/account`, `/reset-password`, `/settings/*`, `/knowledge/*`, `/review/*`, `/diagnostics/*` 는 R10 (로그인과 클라우드 화면을 영구히 제거한 라운드) 에서 지웠다. 새 라우트는 `/`, `/topology`, `/docs`, `/ontology`, `/projects`, `/project/[slug]` 와 나머지 5개 화면 안에서 설계한다.
- `pages/` 라우터 도입 — App Router 만 사용.
- 정적 export 와 호환 안 되는 server-only API 라우트 (dynamic API endpoints, server actions).

## 인증 / 백엔드

- 인증 surface 부활 (login / signup / account / password reset) — **Layer 1 (로컬 코어) 에서는 영구 금지.**
- Firebase / Firestore / Cloud Functions / Storage 의존 재도입 — R10 결정. Layer 1 에는 여전히 영구 금지.
- **[v9 개정, 2026-07-17]** AGENTS.md 가 "나중에"로 미뤄 뒀던 클라우드 협업 설계를 Layer 2 (Atlas Network) 라는 이름으로 앞당겨 시작했다 (`docs/plans/PRODUCT-PLAN-2026-07.md`). Layer 2 의 네트워크 기능 (Spec / Hub / Team Sync) 은 아래 **신뢰 헌장** — 사용자에게 한 약속 여섯 줄 — 을 전부 지킬 때만 만들 수 있다: ① Layer 1 은 영원히 공짜이고, 기능이 빠지지 않고, 인터넷 없이 돌아간다 ② 사용자 모르게 수집하는 것은 하나도 없고, 무엇을 보내든 사용자가 켜야 하며 무엇을 보냈는지 로컬에 기록이 남는다 ③ 로그인을 강요하지 않는다 ④ 데이터는 언제나 평범한 마크다운 파일이라 그대로 들고 나갈 수 있다 ⑤ 이미 한 약속을 나중에 뒤집지 않는다 ⑥ "안전하다"는 말은 구현을 공개하고 감사를 받겠다고 할 때만 한다. 헌장을 깨야만 되는 설계라면 그 기능을 버리는 것이 답이다.
- 위 헌장 밖의 백엔드 SDK 를 새로 들이는 것은 여전히 금지.

## 코드 / 아키텍처

- FSD import 방향 위반 (`entities` 에서 `widgets` 를 import 하는 것처럼, 아래층이 위층을 부르는 것). ESLint 가 잡지만 사람이 우회하면 반려한다.
- 같은 개념의 값을 두 곳에 두고 둘 다 정답으로 삼기 (예: vault frontmatter 와 별도 store). 값이 어긋났을 때 어느 쪽이 맞는지 정하는 곳은 하나여야 한다 — 이 저장소에서는 언제나 vault 의 마크다운이다.
- `--no-verify` 로 git hook 우회.
- `git push --force` 를 main 에.

## 명명

- 회사 codename / 인물 이름 / 다른 서비스 브랜드 (e.g. "Aslan", "Narnia", "Notion-killer") 를 식별자 / 라벨 / 주석에 박기.
- 변수 이름이 일반 단어가 아닌 내부 codename (`reactorService`, `paravelClient`).
- 한글 prefix 커밋 메시지 (`정리:`, `구조:` 등).

## 데이터 / 보안

- Service account · API key · `.env*` 파일을 commit.
- 사용자 디스크의 임의 파일을 자동 스캔 / 업로드 (local-first 원칙 위반).
- vault 외부 (Firestore / 서버) 로 사용자 데이터 silent 전송.

## 문서

- 작업 순서를 적어 둔 주석 (`audit A2`, `iter 18`, `Track D-cont-1` 처럼 그때만 뜻이 통하는 표시) 을 코드에 남기기.
- README / CLAUDE.md 의 링크가 깨진 채 두기 (파일 이름을 바꾸고 링크를 안 고침).
- AGENTS.md 와 CLAUDE.md 의 내용이 서로 어긋난 채 두기.

## 플러그인 / 확장 (2026-07-23 소유자 승인 노선)

- **남이 쓴 코드를 받아서 실행하는 플러그인은 영원히 지원하지 않는다.** 신뢰
  헌장("사용자 모르게 수집하지 않는다", "사용자 디스크를 자동으로 훑지 않는다")과
  정면으로 부딪히고, 정적 export + 로컬 우선이라는 약속 위에서 아무도 검사하지
  않은 코드를 돌릴 이유를 댈 수 없다.
- **이 제품의 확장 수단은 MCP 도구와 skills 다** — 확장하는 주체가 "vault 를
  읽고 쓰는 에이전트"이고, 그 에이전트가 도는 곳(Claude Code/Codex/Cursor)은
  사용자가 이미 믿기로 결정하고 설치한 프로그램이다.
- 허용되는 확장은 **파일에 적어 두는 형태뿐**이다: vault 안의 마크다운이나 설정
  파일로 표현되는 것(저장해 둔 검색, 템플릿, `.ontology-atlasignore` 처럼).
  코드는 한 줄도 실행하지 않고, git diff 로 무엇이 바뀌었는지 다 보여야 한다.

## 의존성

- 새 dependency 추가 시 PR 본문에 이유 명시 안 하기.
- 백엔드 SDK 도입 (Firebase / Supabase / 자체 서버 등) — R10 의 local-first 약속에 맞지 않음. 미래 cloud collab 단계에서 다시 평가.
- node_modules 에 직접 patch (use `pnpm patch` instead).

## 🚫 npm publish — 사용자 명시 승인 없이 실행 절대 금지

`npm publish`, `pnpm publish`, `yarn publish` 등 **외부 레지스트리 발행 명령**은:

- 사용자가 직접 "publish 해줘" / "npm 에 올려줘" 같이 *명시적* 지시를 하기 전엔 절대 실행하지 않는다.
- "정리하자" · "다음 뭐 할까" · "마무리하자" 같은 모호한 지시는 publish 승인이 아니다.
- `.claude/settings.json` 의 PreToolUse hook 이 1차 차단하고 있고, hook 이 비활성이어도 행동 규칙으로 금지.
- *제안* 은 가능 — "이제 publish 가능합니다, 실행할까요?" 라고 묻고 사용자 답을 기다린 다음 실행.
- `npm pack --dry-run` 같은 *읽기 전용 audit* 명령은 OK. 실제 발행 (`npm publish`, `npm pack` 의 tarball 업로드, `npm version` + 자동 publish chain) 은 금지.

**왜**: npm 패키지는 영구 발행. 잘못된 버전이 나가면 24h 이후엔 되돌릴 수 없고, 사용자 본인 계정으로 발행되므로 평판이 직접 걸린다. 자동 publish 를 막아야 사용자가 PR/diff/audit 를 거쳐 의도적으로 발행할 수 있다.

## "왜" 를 물을 것

위 룰을 어겨야 한다고 느낄 때는 PR 본문에 *왜* 를 적고, 룰 자체를 갱신하는 PR 을 먼저 올려라.
