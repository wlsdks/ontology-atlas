---
id: b9468ed8-d8c5-4e2f-8b97-fced8fdc6f21
date: 2026-10-09
kind: tool-efficiency
status: reported
harness_area: analysis-fixtures
---
**Observed**: A controlled Flow browser fixture first failed validation at mcp/src/analysis-record.mts:145 because its timestamps lacked milliseconds, then at :276 because request.id did not equal origin.userEventId. The source validator rejected both before a valid baseline rendered. The corrected fixture passed serializeAnalysisRecord and only then demonstrated the existing zero-document-read/unknown result.

**Cost**: Two local setup retries; elapsed cost unknown; no CI round spent.

**Suspected cause**: The fixture was handwritten from TypeScript shapes without checking the producer and runtime validator's provenance constraints.

**Proposed change**: script: construct analysis fixtures through buildAnalysisRun or validate/serialize the complete fixture in a Node preflight before opening a browser. A syntactically typed fixture is not a usable archive record, and setup failure is not product-flow evidence.
