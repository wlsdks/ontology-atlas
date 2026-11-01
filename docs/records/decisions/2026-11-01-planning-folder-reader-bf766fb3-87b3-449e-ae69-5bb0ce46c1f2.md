---
id: bf766fb3-87b3-449e-ae69-5bb0ce46c1f2
date: 2026-11-01
---
## 2026-11-01 — Planning reads a selected project folder in place
**Why**: The owner reviews planning, design images and code evidence while a CLI agent works, and asked for a dedicated destination without copying originals into a vault.
**Prior**: Retain the Library Sources, Wiki and Ontology decision c5472b7d; those workflows still own their existing files and meaning review. Project source history remains separate from vault Git history.
**Decision**: Add a Planning destination with a session-only, read-only selected-folder grant, file-name search and an in-place Markdown and raster reader. The person chooses any onward history or ontology evidence and can return; no semantic relation is inferred. Authority begins when a root directory descriptor is opened; prior substitution, external hardlink or descriptor references and secrets in content are not established. Browser access requires its own proof.
**Dissent**: A second destination adds navigation and a native trust boundary; a Library extension would reuse a familiar home. The owner chose the direct project workflow, and adoption remains unproven.
**Falsifier**: Revisit if a fresh reader confuses Planning with Library, cannot complete both review-and-return paths, or if selection confinement requires broader authority than the selected root.
**Owner**: The requesting project owner delegated implementation; a shared-context independent reviewer assessed the revised boundary.
