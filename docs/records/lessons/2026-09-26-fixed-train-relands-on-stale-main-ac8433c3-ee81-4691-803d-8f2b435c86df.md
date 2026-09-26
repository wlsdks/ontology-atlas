---
id: ac8433c3-ee81-4691-803d-8f2b435c86df
date: 2026-09-26
lesson: e55a1b49-d7ab-47da-9c4c-dc79790f4e98
status: fixed
parents: 32d1dddc-3815-4045-b9e3-f623a657f43c
---
**Evidence**: #1901 keeps the merge sha, waits for origin/main to reach it, and never re-queues a carried component; tests in scripts/pr-land.test.mjs.
