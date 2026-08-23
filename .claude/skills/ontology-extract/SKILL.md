---
name: ontology-extract
description: Extract a small, evidence-bound set of ontology candidates from prose, check the existing vault for duplicates, obtain user approval, and land only the approved nodes and relations.
---

# Extract ontology from prose

`/ontology-sync` follows code changes. This skill follows human prose: meeting
notes, RFCs, pull-request descriptions, chat logs, or pasted wiki paragraphs.
The vault is the Markdown folder whose files and typed frontmatter form the graph.

## Run when

- the user explicitly asks to turn supplied prose into ontology;
- an RFC, meeting note, or PR states a new codebase concept;
- a paragraph was pasted from a wiki or chat.

Skip personal notes without domain/capability/element concepts, summary-only
requests, and prose already living inside the target vault node.

## 1. Read prose and the existing vault together

```text
list_kinds
find_evidence(title)
query_ontology({ operation: "similar_nodes", candidateSlug, title })
```

Extract candidate nouns and verb phrases, then search before proposing. The most
common failure is creating “user login” beside an existing `auth-login` node.
A similarity score at or above 0.3 is a prompt to consider patching the existing
node; lower scores support a new candidate but do not decide it automatically.

## 2. Classify a small candidate set

One paragraph normally yields zero to three candidates. More than five means the
input is too broad or the extraction is too eager.

| Prose shape | Likely kind | Example |
|---|---|---|
| a new user ability | `capability` | “members can reset a password” → `capabilities/password-reset` |
| a library, file, runtime unit, or implementation role | `element` | “send an OTP” → `elements/otp-sender` |
| a stable responsibility area | `domain` | “separate billing” → `domains/billing` |
| opinion, status, or motivation only | skip | do not turn commentary into a node |

For each candidate record slug, title, parent domain where relevant, the exact
source phrase, and whether it is new or a patch candidate.

## 3. Stop before writing

Show one short numbered table and let the user choose:

```text
Candidates from the supplied prose:

1. [new]   capabilities/password-reset — domain=auth
             Source: “members can reset a forgotten password”
2. [patch] capabilities/auth-login — add the OTP flow from paragraph 4
3. [new]   elements/otp-sender — domain=auth

Choose all, one number, several numbers, or cancel.
```

The approval step is the core value. An agent that writes five plausible nodes
without consent fills the vault with hallucinated meaning.

## 4. Write only approved candidates

| Candidate | Tool |
|---|---|
| New node | `add_concept(slug, kind, title, domain?, body?)` |
| Existing node | `patch_concept(slug, body?, frontmatter?, expected_mtime)` |
| Relation only | `add_relation(from, to, type)` |

Use `add_concepts` and `add_relations` for approved batches. Cite the source in
the body so a person can verify it later.

```markdown
# Password Reset

Members reset a forgotten password with an OTP sent to their verified email.

> Extracted from RFC-2026-05-14, “Authentication flow,” section 3.
```

## 5. Verify and report

Validate the vault and report a compact change log:

```text
Read meeting notes section 3. Proposed 3 candidates; user approved 2.
+ capabilities/password-reset (domain auth)
+ elements/otp-sender (domain auth; linked to password-reset)
warnings 0; orphan count unchanged.
```

## Failure shields

- Never invent a concept absent from the prose. Point to the exact phrase.
- Classify user ability as capability, implementation role as element, and stable
  responsibility as domain.
- Similarity 0.3–0.5 is weak patch evidence. Show both “new + relation” and “patch”
  when ambiguity matters.
- Split long prose by section. Ten candidates in one pass is paraphrase inflation,
  not ontology growth.

## Related ingress paths

| Skill | Input | Outcome |
|---|---|---|
| `/ontology-bootstrap` | empty vault plus code | first trustworthy ontology |
| `/ontology-sync` | completed code change | code/vault drift repaired |
| `/ontology-extract` | user-supplied prose | approved concepts added to the vault |
