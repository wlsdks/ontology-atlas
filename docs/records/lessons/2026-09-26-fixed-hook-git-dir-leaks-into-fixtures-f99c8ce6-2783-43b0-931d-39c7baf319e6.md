---
id: f99c8ce6-2783-43b0-931d-39c7baf319e6
date: 2026-09-26
lesson: 390c0c51-94ad-4fdd-843f-fa5034006585
status: fixed
parents: e3a68cb9-d170-4a83-919b-bcf44f632e85
---
**Evidence**: #1896 unsets the git location variables in .githooks/pre-push; the next push of the messages branch ran the same fixture tests and left the shared .git/config clean.
