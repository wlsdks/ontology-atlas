---
id: 60e30c65-8213-4aa1-b91e-fb720b454c55
date: 2026-10-03
lesson: f5ad0966-4c12-40bb-b412-f1de3733775d
status: verified
parents: f5ad0966-4c12-40bb-b412-f1de3733775d
---
**Evidence**: The source-cache performance comparison passed at 61.809 ms uncached versus 0.019667 ms cached for 100 repetitions at 3,000 nodes. `/Users/jinan/scratch/atlas-map-family-2026-10-03/perf-measured.log` records `pnpm test:perf src/widgets/ontology-map/ui/frame-cache/structure.perf.test.ts --disableConsoleIntercept --reporter=verbose`. Correction to the original lesson: --silent=false alone did not expose the captured output; disabling console interception did. The esbuild dependency assumption and its MODULE_NOT_FOUND failure remain confirmed. No dependency or gate configuration was added.
