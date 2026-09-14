export const MIXED_LIBRARY_VAULT: Record<string, string> = {
  'README.md': `---
kind: vault-readme
title: Vault instructions
---
# Vault instructions
Instructions are not an ontology node.
`,
  'architecture/review.md': `---
architecture_schema: architecture-profile/v1
title: Architecture profile
---
# Architecture profile
A reviewed profile is not an ontology node.
`,
  'capabilities/settlement.md': `---
uid: 5b125f7f-1208-4f69-8dc5-92482a23170e
kind: capability
title: Settlement
domain: domains/payments
---
# Settlement
Schedules funds after capture.

## Related writing
[[wiki/settlement-note|Ordinary wiki note]]
[[README|Vault instructions]]
[[docs/ontology/plain-note|Plain note in ontology folder]]
`,
  'docs/ontology/plain-note.md': `---
title: Plain note in ontology folder
---
# Plain note in ontology folder
Its directory must not make it an ontology node.
`,
  'domains/payments.md': `---
uid: f9c418e8-2a1c-4ed3-af9d-e094a29ad7cf
kind: domain
title: Payments
---
# Payments
The responsibility for settlement policy.
`,
  'elements/settlement-worker.md': `---
uid: c3b3d1c5-dab1-43c9-bbd0-e7a4f6fc0a85
kind: element
title: Settlement worker
domain: domains/payments
---
# Settlement worker
Runs settlement jobs.
`,
  'notes/describes-only.md': `---
title: Describes-only note
describes: [capabilities/settlement]
---
# Describes-only note
A reference alone must not make this a typed node.
`,
  'project.md': `---
uid: 160ec3cb-2715-4499-9b7b-c06b2a078904
slug: ontology-boundary-fixture
kind: project
title: Ontology boundary fixture
domains: [domains/payments]
---
# Ontology boundary fixture
A disposable mixed vault for verifying separate Library collections.
`,
  'settlement-decision.md': `---
uid: fca16b98-3a14-4472-a1af-f681b9e67159
kind: document
title: Settlement decision
describes: [capabilities/settlement]
---
# Settlement decision
An explicitly authored ontology document node.
`,
  'sources/policy.md': `# Settlement policy
Funds settle after capture.
`,
  'wiki/settlement-note.md': `---
title: Ordinary wiki note
sources: [sources/policy.md]
---
# Ordinary wiki note
General knowledge must stay outside the Ontology tab.
`,
};

export const WIKI_ONLY_LIBRARY_VAULT: Record<string, string> = {
  'README.md': MIXED_LIBRARY_VAULT['README.md'],
  'sources/policy.md': MIXED_LIBRARY_VAULT['sources/policy.md'],
  'wiki/settlement-note.md': MIXED_LIBRARY_VAULT['wiki/settlement-note.md'],
};
