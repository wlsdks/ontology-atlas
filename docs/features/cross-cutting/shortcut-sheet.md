---
title: ShortcutSheet
doc_type: feature
status: current
area: design-system
routes: []
---

# ShortcutSheet

### `ShortcutSheet` (`?` to open)
- 8 sections grouped: navigation · topology · search palette · hub rail · workspace palette · workspace graph · workspace files · workspace actions
- 2-column grid on sm+, focus trap, `Esc` closes
- Opens with `?` on every screen the rail stands on (2026-09-26): the map keeps its own, and the shell draws it everywhere else (`ShellKeyboardSurfaces`, with screens that answer a key themselves claiming it through `shared/lib/shell-key-claims.ts`). It does not open over another dialog. Navigation — the section every tab shows — lists only keys every screen answers; `D` moved to the map's section.
