---
id: de3a156a-95f3-432f-b964-84a36718aabc
date: 2026-10-01
kind: tool-efficiency
status: reported
harness_area: native-verification
---
**Observed**: A connection verifier was started while `desktop:deploy:app` was still running its own installed-app verifier. `curl-installed-normal.log` recorded: "another desktop app verification is already running for this app (pid=47163); run desktop:verify-app commands sequentially so --kill-existing cannot terminate a sibling verifier". The lock correctly refused the overlapping command.
**Cost**: One failed local verification invocation; elapsed time unknown. No CI round.
**Suspected cause**: The deployment log had reached post-copy evidence, but the deployment process had not completed. That milestone was mistaken for the end of the whole operation.
**Proposed change**: none. Await the deployment process handle's terminal result before starting another verifier for the same app. A log milestone does not release the application's verification lock.
