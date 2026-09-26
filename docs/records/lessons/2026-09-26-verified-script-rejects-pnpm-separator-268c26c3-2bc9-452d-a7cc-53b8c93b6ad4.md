---
id: 268c26c3-2bc9-452d-a7cc-53b8c93b6ad4
date: 2026-09-26
lesson: cd17376c-c516-43c5-8f74-5ba03206eb62
status: verified
parents: cd17376c-c516-43c5-8f74-5ba03206eb62
---
**Evidence**: reproduced: `pnpm messages:build -- --check` exited 2 before the fix and 0 after; scripts/build-messages.test.mjs now runs the script with `-- --help`.
