---
id: 3498db1b-bec9-45e0-8d26-10b9012c2781
date: 2026-09-30
kind: tool-efficiency
status: reported
harness_area: source-navigation
---
**Observed**: targeted reads of src/views/library/lib/use-library-model.ts and src/features/library/model/build-library-model.ts failed because these files do not exist. Current locations are src/features/library/model/use-library-model.ts and src/entities/docs-vault/lib/vault-library.ts.
**Cost**: multiple failed reads; elapsed cost unknown.
**Suspected cause**: historical paths and an inferred helper name were treated as current source locations.
**Proposed change**: none; resolve current paths with rg --files and read the importer before opening inferred helper files.
