---
id: beae5a1c-33ac-4b0c-acb3-67218c326e3b
date: 2026-10-03
kind: tool-efficiency
status: reported
harness_area: motion
---
**Observed**: An external config spreading the repository Playwright config failed before tests with Cannot find module ./tests/e2e/global-setup.ts because Playwright resolves the inherited relative path against the external config directory. Setting the external config globalSetup to the exact absolute repository helper restored execution.
**Cost**: One failed launch; exact elapsed cost unknown.
**Suspected cause**: Relative configuration paths are re-rooted at the final config location.
**Proposed change**: skill, when copying a Playwright config outside the repository for read-only diagnostics, make inherited helper paths absolute and keep test outputs outside the repository.
