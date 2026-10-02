---
id: 43a22b18-f2dd-4208-84b6-85099c1052f3
date: 2026-10-02
kind: mistake
status: reported
harness_area: acp-probes
---
**Observed**: Train2271 Windows run36960194237/job110691973231 failed `acp::probe_output::tests::an_inherited_stdout_pipe_does_not_escape_the_deadline`: `run(command, Duration::from_millis(300)).is_none()` returned false;344other tests passed. The fixture used `unref()` without detachment. Independent read-only diagnosis traced Node24's Windows job lifetime: non-detached descendants die at parent exit, closing the pipe. Primary sources: https://nodejs.org/download/release/v24.16.0/docs/api/child_process.html#optionsdetached and https://github.com/nodejs/node/blob/v24.16.0/deps/uv/src/win/process.c#L1016.

**Cost**: One red Windows CI job (2m36s); its speculative successor train was discarded. Additional total cost is unknown.

**Suspected cause**: The fixture assumed Unix process lifetime on Windows. `unref()` releases an event-loop reference; it does not escape Windows's parent-owned job.

**Proposed change**: none beyond the fixture repair. Set `detached: process.platform === 'win32'` on the finite worker, keep Unix group ownership, preserve the300ms deadline and assertion, and include the returned result in future assertion diagnostics. Require the exact Windows CI case to pass; do not waive it or increase the timeout. Distinguish local/installed macOS evidence from Windows execution.
