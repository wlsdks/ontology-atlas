---
slug: domains/onboarding-ux
kind: domain
title: Onboarding & UX (theme · toast · a11y · mobile · CLI)
capabilities:
  - cli-developer-entry
elements:
  - src/features/theme-toggle
  - src/shared/ui/live-announcer.tsx
  - src/shared/ui/toast.tsx
  - src/widgets/bottom-tab-bar
  - src/widgets/gesture-hint
relates:
  - domains/views
---

# Onboarding & UX

cross-cutting. 라이트/다크 토글 (`html[data-theme="light"]`), Sonner-기반 toast, aria-live
스크린리더 announce, 모바일 BottomTabBar + gesture hint, ⌘K · ⇧⌘K · ? · F · N · Esc 단축키,
`prefers-reduced-motion` 자동 존중. fresh vault onboarding 도 이 domain 의 일부:
CLI `init` 과 web workbench starter 가 같은 5-node vault README/setup 내용을 제공하고,
Claude Code/Cursor `.mcp.json`, Codex `.codex/config.toml`, global Codex `mcp add`
흐름을 동시에 안내한다. 2026-05-23 follow-up 으로 빈 vault CTA 에 생성 전 agent 검증
체크리스트와 copyable agent prompt 를 노출하고, starter README 에 첫 연결 검증 루프도
추가했다: agent 에게 `validate_vault` → `workspace_brief` → `agent_brief` 를 실행해 읽기
가능성과 write tool 노출 여부를 보고하게 하고, CLI 사용자는 `validate`, `workspace-brief`,
`agent-brief --prompt`, `mcp-verify --timeout-ms 15000` 로 같은 경로를 확인한다. 자세한
디자인 룰: `docs/DESIGN-SYSTEM.md`.

2026-05-09 large demo follow-up: `/docs` 에서 Topology 이동이 vault tools menu 안에만
묻혀 있던 discoverability gap 을 수정. Docs header 에 direct Topology link 를 두고,
모바일 BottomTabBar 에도 Topology 를 별도 탭으로 노출한다.
