---
id: 6d571e98-14d0-4c07-83ba-6bce3cf8115e
date: 2026-10-05
kind: tool-efficiency
status: reported
harness_area: tool-discovery
---
**Observed**: Discovering Atlas tools with `text(ALL_TOOLS.filter(...))` printed full descriptions that repeat the construction and lifecycle manual. The initial tool result reported 56,124 output tokens and was truncated, although the task needed only tool names and two argument schemas.
**Cost**: 56,124 generated output tokens; elapsed cost unknown.
**Suspected cause**: Tool descriptions contain full usage guides before their declaration. Printing entire discovery metadata repeated the guide for every matching tool.
**Proposed change**: none. In subsequent discovery, print names first and extract only the `exec tool declaration:` suffix for the selected tool; read the construction guide through `connection_info` only when its topic is needed.
