---
slug: elements/app-settings-menu
kind: element
title: App Settings Menu
domain: onboarding-ux
relates: [elements/app-nav-rail, elements/locale-switch]
---

# App Settings Menu

`src/widgets/app-settings-menu/ui/AppSettingsMenu.tsx` is the app-wide settings
surface. It has changed shape twice: the five-tab workbench collapsed into one
centered sheet (2026-07), and that sheet moved to a **right-anchored, non-modal
dock with an LNB** (2026-07-29).

## Why a dock, not a modal

Two of its sections — background and footprint — promise that a change lands on
the map immediately. A centered modal covered the very thing it was changing, so
the user could not see the result while turning the dial. The dock is anchored
to the right edge at a fixed 760×560, the overlay layer is
`pointer-events-none`, and there is no scrim: the map stays live and draggable
while the dock is open.

Consequence: **backdrop click does not close it.** A dock is a surface you stay
in; Escape and the close control are the exits.

## LNB — two groups, five sections

- **Look** — screen (language, view mode, INDEX defaults) · background · footprint
- **Connect** — workspace (vault state, open/change, Library) · AI agent

The hosted-vs-installed workspace branch stays explicit: hosted browser users go
to `/download/`, the installed app opens `/docs/?intent=local`.

## Non-modal costs three couplings

Dropping modality is not a styling change — three contracts move with it, and
all three were live defects until wired:

1. **No `aria-modal`.** The outside is operable; telling assistive technology to
   ignore it would be false.
2. **No Tab trap** — `useDialogFocusTrap({ trapTab: false })`. Trapping focus
   while the outside stays clickable locks out *only* keyboard users. See
   `elements/accessible-dialog-focus-contract`.
3. **Guide auto-start guard** reads `data-surface-role="settings-dock"` instead
   of `aria-modal`, or first-run guidance would open on top of the dock.

The hook still owns initial focus; the widget keeps close-time focus
restoration so Command-K can hand focus to the palette instead of having
cleanup steal it back.

## Entry points and locale handoff

One surface, three responsive triggers — `rail-tile` (large-screen nav rail),
`chrome-tile` (compact topology chrome), `header-pill` (page headers) — sharing
one dialog, vault routing, copy, and AI-agent contract. Locale navigation
remounts the localized shell and closes the dock; a short-lived focus intent
carries the target locale and the exact trigger variant so the matching trigger
in the new locale receives focus while staying closed. Stale intents expire
after 10 seconds.

## AI-agent drill-in

Linked to `capabilities/agent-config-onboarding`: actual config readiness,
repair actions, copyable proof packets, MCP/CLI fallbacks, and verification
gates, shown only after the user asks for that detail. Entering focuses the
translated Back control; Back or the first Escape restores the AI-agent root
row, a second Escape closes the dock.

## Gates

`AppSettingsMenu.test.tsx` guards the LNB hierarchy, the **inverted** modality
contract (no `aria-modal`, overlay `pointer-events-none`, panel
`pointer-events-auto`, no scrim token), hosted/installed vault route,
controlled-open behavior, the Escape ladder, locale focus return, and exact
responsive trigger match.
