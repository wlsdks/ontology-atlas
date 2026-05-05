---
slug: domains/onboarding-ux
kind: domain
title: Onboarding & UX (theme · toast · a11y · mobile · CLI)
capabilities:
  - cli-developer-entry
elements:
  - src/features/theme-toggle
  - src/shared/ui/toast.tsx
  - src/shared/ui/live-announcer.tsx
  - src/widgets/bottom-tab-bar
  - src/widgets/gesture-hint
relates:
  - domains/views
---

# Onboarding & UX

cross-cutting. 라이트/다크 토글 (`html[data-theme="light"]`), Sonner-기반 toast, aria-live
스크린리더 announce, 모바일 BottomTabBar + gesture hint, ⌘K · ⇧⌘K · ? · F · N · Esc 단축키,
`prefers-reduced-motion` 자동 존중. 자세한 디자인 룰: `docs/DESIGN-SYSTEM.md`.
