---
id: 332f0078-4f8d-410f-aae0-7b8e7e89cd41
date: 2026-10-04
kind: mistake
status: reported
harness_area: design
---
**Observed**: The native review app displayed Analysis status, but clicking it focused the canvas and opened no inspector. The button sat directly under a pointer-events-none toolbar, outside SearchHint, and ChromeChip had no local pointer-events-auto. The static-export pointer hit-test failed with false instead of true despite 294 unit tests passing.

**Cost**: One native build and one failing static-export probe; aggregate time unknown.

**Suspected cause**: Hook and component tests exercised callbacks without the real painted ancestor hit-testing boundary.

**Proposed change**: none — give this toolbar action its own pointer-enabled boundary and keep a real pointer journey to a visible resulting inspector, not a CSS-string assertion. Recheck the actual installed app after the rebuilt bundle identity matches source.
