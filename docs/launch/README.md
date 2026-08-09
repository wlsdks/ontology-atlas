# Launch playbook

오픈소스 launch 단계의 publication 초안 모음. 메인테이너가 시점에 맞춰
직접 publish.

> **배포 채널 (2026-07-27 확정, `docs/DECISIONS.md`)**: npm 발행 계획은
> 폐기됐다. 공개 채널은 **서명·공증된 macOS DMG** 하나이고, 앱이 컴파일된
> MCP 서버를 자기 번들에 싣고 다닌다 — 다운로드 1회가 사람 표면과 에이전트
> 표면을 동시에 설치한다. 터미널을 쓰는 사람에게는 **소스 체크아웃**이
> 두 번째 길이다. 아래 초안에 `npx` 를 다시 넣지 말 것 — 실행하면 404 다.

## 단계별 권장 순서

1. **사전 준비**
   - [ ] 서명·공증된 macOS DMG 를 [GitHub Releases](https://github.com/wlsdks/ontology-atlas/releases) 에 업로드 — 초안의 모든 CTA 가 이 자산 하나를 가리킨다
   - [ ] 설치 앱에서 「에이전트 연결」 버튼이 `.mcp.json` / `.codex/config.toml` 을 실제로 쓰고 자가 검증까지 초록인지 실측
   - [ ] 정적 호스팅 (GitHub Pages / Vercel / Netlify / Cloudflare Pages 등) 배포 — `pnpm build` → `out/` 업로드. 자세한 가이드는 `docs/DEPLOYMENT.md`.
   - [ ] hosted demo URL 이 README + 초안 문구와 일치하는지 재확인
   - [ ] 30s demo gif 녹화 + `docs/launch/demo.gif` 로 commit (storyboard: `docs/launch/DEMO-GIF-STORYBOARD.md`)
   - [x] GitHub Discussions 활성화 + 카테고리 setup (이 PR 에서 자동 활성화됨)

2. **launch day**
   - [ ] X thread 게시 (`docs/launch/X-THREAD.md`)
   - [ ] HN Show HN 게시 (`docs/launch/HN-POST.md`) — 화요/수요 8-10am ET
   - [ ] HN front page 떠 있으면 X 에 quote 트윗

3. **launch week**
   - [ ] r/programming 게시 — HN 후 24~48시간 텀 (`docs/launch/REDDIT-POSTS.md`)
   - [ ] r/ChatGPTCoding 게시 — 다른 날
   - [ ] r/LocalLLaMA 게시 — 다른 날

4. **post-launch**
   - [ ] Discussions 의 첫 5 개 thread 메인테이너가 모두 응답
   - [ ] 첫 주 동안 발견된 onboarding friction 우선순위로 fix → release v0.2

## 게시 안 할 곳

- 한국 커뮤니티 (geeknews / 디스콰이엇 / 클리앙) — 한국어 README 가 second-class 라 친화도 낮음. 영문 audience 가 1차 타겟.
- LinkedIn — dev tool 채택 패턴 약함
- Product Hunt — early-stage 코드 도구는 PH 와 misfit (PH 는 SaaS 친화)

## 응답 템플릿

자주 들어올 질문에 대한 templated 답 — 빠르고 일관된 응답이 community building 에 핵심.

### "Obsidian 과 뭐가 다른가요?"

> Obsidian 은 markdown 노트의 link / backlink / canvas 를 잘 한다. 우리는 markdown 의 frontmatter 를 *codebase 아키텍처의 schema* 로 한정해 사용한다 — `kind: capability`, `domain: ...`, `depends_on: [...]` 같은 키를 합의된 vocabulary 로 박는다. 그래야 AI agent (MCP) 가 그래프 의미를 모호함 없이 query 할 수 있다.
>
> Obsidian 본문은 사람이 읽는 글, 우리는 frontmatter 가 일급 데이터다. 둘은 서로 잘 어울린다 — Obsidian 으로 오히려 더 잘 편집된다.

### "왜 GraphQL/Neo4j 같은 진짜 그래프 DB 가 아닌가요?"

> mission v2 의 1원리: 진실원이 사용자 디스크의 markdown 이어야 한다. DB 를 두면 (a) 사용자 git workflow 와 정렬 안 됨 (b) 비개발자가 못 읽음 (c) 호스팅 비용. frontmatter 는 grep + sed 도 가능하다.

### "MCP 가 뭐예요?"

> Model Context Protocol: AI agent 도구 호출 표준. JSON-RPC over stdio. Claude Code / Cursor / Codex 등이 지원. 우리 서버는 실행 시 광고하는 현재 읽기·쓰기 도구로 vault read/write, vault-scoped Git history/checkpoint, Builder handoff와 프로젝트 의미 영수증 확정을 제공한다. 정확한 목록은 `tools/list`, 연결 증명은 `mcp-verify`가 맡는다.

### "백엔드는 뭘 쓰나요?"

> 0. 사용자 디스크의 markdown 폴더가 진실원. 인증 / 데이터베이스 /
> 서버 런타임 모두 없음. 빌드 결과물은 순수 정적 export — 어디든 배포 가능.
> 다중 디바이스 동기화는 git 으로 (사용자가 폴더를 git repo 로 관리하면
> 자연스럽게 됨).

## 측정 지표 (1주 후 자가 회고)

- [ ] HN 게시 결과 (front page 도달 여부, point 수)
- [ ] Reddit upvote / comment 수
- [ ] GitHub stars (launch 전 baseline 대비 delta)
- [ ] DMG 다운로드 수 (GitHub Releases asset download count)
- [ ] hosted demo 방문자 (GitHub Pages traffic — Insights → Traffic)
- [ ] Issues + Discussions 새로 열린 수 + 외부 PR 수

이 6 개 지표로 1차 launch 성공 여부 판단. 별 1000 + 외부 contributor 1 명 이상이면 traction 시작.
