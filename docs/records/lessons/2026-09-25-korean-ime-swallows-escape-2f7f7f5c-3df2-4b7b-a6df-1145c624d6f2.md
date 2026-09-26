---
id: 2f7f7f5c-3df2-4b7b-a6df-1145c624d6f2
date: 2026-09-25
kind: mistake
status: reported
harness_area: computer-use
---
**Observed**: Escape did not reach the installed app's WKWebView while the Korean 2-Set input source was active, except in password fields.
**Cost**: A native Escape monitor and a page stand-in were built and shipped in #1863 (bundle #1874).
**Suspected cause**: The Korean input method consumes Escape before WebKit sees it.
**Proposed change**: script: a native Escape monitor that dispatches a stand-in Escape to the page.
