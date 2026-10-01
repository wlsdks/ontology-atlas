---
id: 409a237a-9f12-4fbc-8f35-d2f0957e798c
date: 2026-09-30
kind: tool-efficiency
status: reported
harness_area: performance
---
**Observed**: The initial CPU-profile enrichment attempted `Debugger.getScriptSource` without enabling the Debugger domain and swallowed the resulting lookup failures, leaving function snippets empty in `library-commits-before.json`. Reading the exact locally built chunk named by each profile URL supplied the missing snippets and located the dominant renderer/label work.
**Cost**: One extra local bundle inspection; elapsed time was not measured separately.
**Suspected cause**: The profile and debugger source-lookup setup were treated as interchangeable, and the catch handler discarded useful diagnostic context.
**Proposed change**: none; enable source lookup explicitly or read the exact build chunk while it still matches the profile, and retain lookup failures in future scratch probes rather than silently suppressing them.
