---
id: 78daf781-cdf9-4826-93e5-7cd4e83884ca
date: 2026-10-11
---
## 2026-10-11 — Compare vault and bound source dates under separate grants

**Why**: Analysis refused valid separate vault/code repositories because its existing Git walk resolved both document and implementation paths in the vault repository. Removing that refusal alone would confuse relative paths and filesystem authority.
**Prior**: Preserve the 2026-08-02 single active source and private sidecar receipt decision, plus source-picker recovery 90154cfa-a838-4a23-ad93-9a09af2d9e92. Current code still separates vault grants from source grants.
**Decision**: Add a native read for one recorded project binding. Resolve document and source dates in separate maps under their existing grants, with 512 total paths (documents first) and 3,000 commits per repository. Recheck binding/receipt, canonical roots and HEADs; discard changed or late scopes. Missing grants use the existing picker, whose chosen root must match the binding before dating. Dirty, folder-only, omitted and undated evidence stays unknown; date order does not accept meaning. Web remains without local Git reads.
**Dissent**: Keeping the refusal avoids another native read contract but leaves a supported separate-folder workflow unusable. Moving the vault into source imposes unnecessary storage changes; running the vault command on source widens the wrong grant.
**Falsifier**: An ungranted or wrong source is dated, equal relative names mix roots, a changed binding or HEAD yields a reusable comparison, or incomplete evidence becomes current.
**Owner**: The owner authorized task 4 in the six-part improvement plan; the independent specification review retained source-grant compatibility and single-project scope. Implementation and installed-app proof remain separate from meaning acceptance.
