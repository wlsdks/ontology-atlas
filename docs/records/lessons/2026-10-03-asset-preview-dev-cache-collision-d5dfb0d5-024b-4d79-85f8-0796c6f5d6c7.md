---
id: d5dfb0d5-024b-4d79-85f8-0796c6f5d6c7
date: 2026-10-03
kind: tool-efficiency
status: reported
harness_area: browser-proof
---
**Observed**: A character preview ran with `pnpm dev --hostname 127.0.0.1 --port 4486`. Later `pnpm checks:changed -- --run` started its own Next dev server for web smoke. The preview logged `The directory at .../.next/dev was deleted` and restarted, because the second `pnpm dev` executes the shared-cache predev cleanup. Dev web smoke reported 13 passed and 4 missing-starter failures; the same folder-pick case passed in the fresh static export (2.2s). The cache collision is observed; whether it caused every failure is unknown.
**Cost**: One failed 17-case dev run and one static reproduction. The dev report measured 54.2 minutes, but active execution time is unknown because native-window capture also became unavailable during the run.
**Suspected cause**: Preview and verification shared writable Next dev state despite using different ports. A different port does not isolate `.next/dev` or the predev cleanup.
**Proposed change**: rule — before focused checks that launch Playwright, stop the task-owned dev preview or point verification at its existing server; use the built static export for asset-family verification. Preserve unrelated servers.
