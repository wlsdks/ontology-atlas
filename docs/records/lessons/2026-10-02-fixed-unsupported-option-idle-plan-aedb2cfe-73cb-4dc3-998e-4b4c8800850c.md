---
id: aedb2cfe-73cb-4dc3-998e-4b4c8800850c
date: 2026-10-02
lesson: 6199d37e-e1e7-4095-abb7-ba5167c89ae5
status: fixed
parents: 60772785-b993-4c31-a503-b7103a9d8bd5
---
**Evidence**: Commit `612a9f913` rejects unsupported options before file planning or command execution. The actual CLI now exits 2 for `--json`; the 139 focused Node cases and all 14 recommended checks pass. Supported help/run options and a relative dash-prefixed filename remain covered.
