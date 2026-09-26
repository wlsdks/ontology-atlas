---
id: ebfb95ff-edfa-43ee-8b71-f8ee245001ba
date: 2026-09-26
lesson: 057a1015-7fe8-47be-974b-edb827892f27
status: fixed
parents: 6b468c74-5d85-4129-8c51-63686a870ca4
---
**Evidence**: landing moved to `pnpm pr:land` in 213eff090 (#1576), which reads `statusCheckRollup` JSON; a required context that never reported is `missing`, not green (`requiredCheckState` in `scripts/pr-land.mjs`).
