# TECH STACK — 기술 스택 결정 기록 (2026-07-17)

> 2026-07-17 기준 전 레이어 조사(웹 프론트·데스크톱·CLI/MCP·LLM/Layer 2 인프라 4건) 후 확정한 판정.
> 판정 원칙: **검증된 스택은 유지가 기본값** (전면 재작성 반려 판정과 동일 논리 — 교체는 측정된 이득이 마이그레이션 비용을 명확히 넘을 때만). 다음 전면 재검토: 2027-01 또는 갈림길 조건 발화 시.
> 일부 조사는 세션 검색 예산 소진으로 학습 데이터+공식 문서 fetch 기반 — `⚠` 표기 항목은 실행 전 재검증.

## 웹 프론트

| 레이어 | 현재 | 판정 | 근거 |
|---|---|---|---|
| Next.js | 16.2.x static export | **KEEP** | static export 완숙. Astro/React Router 전환은 local-first 재설계 비용 > 이득 |
| React | 19.2.x | **KEEP** | React Compiler는 Slice 2(topology-map-v2)에서 성능 측정 후 활성화 판단 |
| TypeScript | 5.x | **UPGRADE → 7.0 (소유자 지시)** | **TS 7.0 정식 릴리스 확인 (2026-07-08, Go 네이티브 10x).** 공식 경로: 6.0 (`stableTypeOrdering`) 경유 → 7.0, tsconfig 기본값 변경 대응 (strict 기본 on·baseUrl 제거·rootDir 기본 `./`). 리스크: Next.js는 TS 7 지원 미발표 (16.3, 6/29) — `next build` 타입체크가 프로그래매틱 API 의존 시 공식 폴백 `@typescript/typescript6` 별칭 병행. 브랜치에서 시도 → 게이트 통과 여부로 확정 |
| Tailwind | 4.2.x | **KEEP** | @theme CSS 토큰 안정, 디자인 시스템 정합 |
| ESLint | 9 flat | **KEEP (확정)** | Biome 2.5는 eslint-plugin-boundaries(FSD 가드) 미지원 — 아키텍처 강제가 걸린 한 ESLint 유일 선택지 |
| pnpm | 10.x | **KEEP** | Bun은 Anthropic 인수 후 로드맵 미공표 + Next static export 호환 미성숙 — watch만 |
| next-intl | 4.11 | **KEEP** | App Router i18n 표준 유지 |

## 데스크톱

| 레이어 | 현재 | 판정 | 근거 |
|---|---|---|---|
| Tauri | v2.11.x | **KEEP (단기)** | 버벅임 원인은 WebView가 아니라 React 오케스트레이션으로 기판정. Electron 전환은 4~6주 + 번들 3배로 반려 |
| 저알파 합성 버그 | 소유자 머신 재현 | **격리 + upstream 보고** | Wry/Tauri 이슈 트래커에 공개 리포트 0건 — 재현 케이스(`rgba` dim 테스트) 작성해 보고. 제품 방어는 기존 불변식 유지: dim = hidden 또는 불투명 토큰, 저알파 금지 (단위 테스트 강제) |
| 갈림길 (Q4 2026) | — | **조건 명시** | Verso(Servo) beta + Sigma 테스트 통과 → Tauri 지속 / Verso 침묵 지속 + WebGL 문제 재발 → Electron 재평가 / FSA API 전 브라우저 안정 → PWA 재평가 (Safari 15.2+ FSA 지원 확인됨 ⚠) |

## CLI · MCP · 테스트

| 레이어 | 현재 | 판정 | 근거 |
|---|---|---|---|
| 모듈 형식 | 평문 .mjs ESM | **KEEP + JSDoc 강화** | TS 전환은 빌드 파이프라인 비용 > 이득. 경로: JSDoc → (선택) `tsc --emit-declaration-only`로 .d.ts 배포 |
| Node engines | `>=20` | **UPGRADE `>=22`** | v20은 2026-04 maintenance 전환, v24 Krypton이 Active LTS. 최소 요구는 22, CI는 24에서 실행 |
| arg 파싱 | 수동 (cli-args.mjs) | **KEEP** | flat 45 명령·저복잡 플래그엔 충분. citty 등 채택은 이득이 --help 자동화 수준 — 반려 |
| MCP SDK | 1.29.x | **KEEP + watch** | stdio transport만 사용 중이라 안정. N2(레지스트리 등재) 시점에 공식 registry 요구사항·tool schema 변경 확인 ⚠ |
| Vitest / Playwright | 4.x / 1.59.x | **KEEP** | 안정. 메이저 업그레이드는 release note 검토 후 기회적으로 |
| npm 발행 준비 (N1) | — | **체크리스트 확정** | provenance(`publishConfig.provenance: true`) + GitHub Actions OIDC trusted publishing + `exports` 필드 명시. 발행 자체는 소유자 명시 승인 후 (publish 가드 유지) |

## LLM · Layer 2 (예약 결정 — 해당 게이트 발화 시 구현)

| 용도 | 결정 | 시점 | 근거 |
|---|---|---|---|
| 앱 내 Q&A SDK | **Vercel AI SDK 5** (provider-agnostic BYOK) | Slice 3 게이트 통과 시 | static export 호환, provider 전환 자유 — 크레딧 번들 금지 원칙 정합 |
| 로컬 모델 | Ollama·LM Studio **localhost 직결** | Slice 3 | OpenAI-compat, CORS 문제 없음 |
| 클라우드 CORS | **Tauri sidecar 프록시** | Slice 3 | Anthropic/OpenAI API 브라우저 직결 불가 추정 ⚠ — 키는 OS keychain (Tauri v2 API 명칭 재검증 ⚠) |
| 좌표 서버 | **Cloudflare Workers + Durable Objects** (1순위 후보) | N3 (Sync 수요 게이트) | 솔로 운영 최소·감사 가능. 자체 바이너리(Rust/Go)는 후속 전환 옵션 |
| E2E 암호화 | **age** (rage/Typage) | Sync 2단계 | git-native·다중 수신자·post-quantum 하이브리드. 신뢰 헌장 #6 (구현 공개) 전제 |
| 결제 | **없음 (소유자 결정 2026-07-17)** | — | 판매 목적 아님 — 순수 오픈소스, 로컬 실행(셀프호스트) 모델. 후원은 GitHub Sponsors 정도만 선택적. Team Sync가 만들어지더라도 셀프호스트 가능한 오픈소스로 |

## 하지 않기로 한 것 (반려 기록)

- Biome/oxlint 전환 (FSD boundary 가드 상실) · Electron 전환 (비용 > 이득, 원인 오진) · Astro/React Router 재플랫폼 · CLI 프레임워크 도입 · TS 전환(cli/mcp) · Bun 채택 (로드맵 미공표) · D3/Cosmograph/G6 시각화 교체 (기판정 유지 — Sigma v3).

## 즉시 액션 (이번 사이클)

1. `package.json` engines `>=22` 업데이트 (cli·mcp·root) — 30분.
2. Wry 저알파 재현 케이스 작성 → upstream 이슈 보고 — Slice 2 전.
3. N1 npm 발행 체크리스트를 GitHub Actions workflow 초안으로 — N1 시점.
4. TS 6.0 업그레이드 티켓 — Slice 1 통과 후.
