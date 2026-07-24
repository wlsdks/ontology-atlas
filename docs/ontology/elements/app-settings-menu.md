---
slug: elements/app-settings-menu
kind: element
title: App Settings Menu
domain: onboarding-ux
relates: [elements/app-nav-rail, elements/locale-switch]
---

`src/widgets/app-settings-menu/ui/AppSettingsMenu.tsx` is the app-wide settings
surface. The retired five-tab workbench was simplified in 2026-07 into one
centered, single-column sheet with three readable groups:

- Screen — language plus page-injected view mode and INDEX defaults.
- Workspace — current vault state, open/change action, and the full Library link.
- AI agent — one connection summary row leading to a focused setup/verification
  drill-in.

The same sheet is entered from responsive equivalents rather than duplicated
settings products: `rail-tile` on the persistent large-screen nav rail,
`chrome-tile` in compact topology chrome, and `header-pill` on page headers.
Each trigger uses the same dialog, vault routing, copy, and AI-agent contracts.
The hosted-vs-installed workspace branch remains explicit: hosted browser users
go to `/download/`, while the installed app opens `/docs/?intent=local`.

The dialog is centered inside a token-backed scrim, bounded to the viewport, and
owns its internal vertical scroll. Opening moves focus into the panel. Close,
backdrop, and Escape return focus to the exact trigger; the AI drill-in consumes
the first Escape to return to the root sheet. Command-K closes without returning
focus so the command palette can take ownership.

The panel uses the shared `useDialogFocusTrap` contract. Forward Tab wraps from
the final AI-agent drill-in to Close; reverse Tab wraps from Close to the final
control. `role="dialog"` and `aria-modal="true"` expose the same blocking
boundary to assistive-technology virtual navigation. The hook owns initial
focus and containment only. `AppSettingsMenu` keeps ownership of close-time
focus restoration so Command-K can still yield focus to the palette instead of
having modal cleanup steal it back.

Locale navigation remounts the localized shell and intentionally closes the
sheet. Before that transition, the menu records a short-lived focus intent with
the target locale and exact responsive trigger variant. The matching
`rail-tile`, `chrome-tile`, or `header-pill` in the new locale consumes the
intent and receives focus while remaining closed. This avoids dropping keyboard
users on the new document root or focusing the wrong hidden responsive entry.
Stale intents expire after 10 seconds.

`src/widgets/app-settings-menu/ui/AppSettingsMenu.test.tsx` guards the
single-sheet hierarchy, hosted/installed vault route, controlled-open behavior,
Escape ladder, locale focus return, and exact responsive trigger match. The
installed macOS proof covers KO → EN → KO and confirms the focused AX element is
the translated closed settings summary after each transition.

The AI-agent drill-in is linked to `capabilities/agent-config-onboarding`: it
shows actual config readiness, repair actions, copyable proof packets, MCP/CLI
fallbacks, and verification gates only after the user asks for that detail.
