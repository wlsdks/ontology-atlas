---
id: e2087a4d-8820-4313-a13b-4ef6c8627861
date: 2026-11-25
---
## 2026-11-25 — Auto-approve passes every Atlas read and map-build write in the opened folder; deleting and merging concepts still ask

**Why**: The owner needed 30+ presses to analyse one codebase with Auto-approve on, enough to stop using it: the 2026-11-16 falsifier fired. A recorded build stopped at 10 of 17 calls in both adapters, mostly Atlas scans naming the project folder.
**Prior**: Widens docs/records/decisions/2026-11-16-acp-auto-approve-standing-scope-15443720-35ad-47da-8f03-6ec2ae4a36be.md; its edit rule, `allow_once` only and plan or investigation exclusions stand. docs/records/decisions/2026-11-16-acp-auto-approve-kept-per-folder-04edab8a-8a56-4047-91dc-7bbea87fd962.md stands: the new scope asks once more. 2026-09-29 stands: no round reads it.
**Decision**: Also answered: an Atlas read whose path arguments are relative or in an opened folder (the vault, and the project of an Atlas-made `<project>/atlas`) with no `..` or dot segment; `remove_relation`, any `patch_concept`, `finalize_project_meaning`, `git_snapshot`, `disconnect_project_source`; `connect_project_source` that only proposes or names an opened folder exactly; `absorb_document` of a file in an opened folder without `allowOutsideRepo`. Still asking: `delete_concept`, `merge_concepts`, a rename with `overwrite`, unlisted tools, paths outside the opened folders, dot paths, instruction-file edits, shell commands. Receipts still say auto-approved.
**Dissent**: A prompt-injected agent can now unlink, blank, rebind or commit without a card, and absorb rewrites an instruction file; only Git history and the folder boundary limit it (security lens). Read-only shell commands stay asking: a safe allowlist needs link-resolved paths, and git or rg can run configured programs.
**Falsifier**: A card during an auto-approved map build that only reads, adds, patches, binds its own project and finalizes; or an auto-approved request outside the opened folders, on a dot path, deleting or merging, or in a round.
**Owner**: the repository owner.
