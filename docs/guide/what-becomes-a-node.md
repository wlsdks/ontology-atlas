# What Becomes a Node?

When building a vault, you inevitably stop at this question.

> Is this a domain or a capability? Should I create one node per file? Is it wrong to have thirty children under one node?

The answer is here. And **most of the answer is "don't count"**.

The definitive rules for inclusion/exclusion/examples by `kind` and `is_a` determination are in the [Atlas Metamodel Specification](https://github.com/wlsdks/ontology-atlas/blob/main/docs/ONTOLOGY-ATLAS-SPEC.md#2-the-five-authorable-node-kinds-and-reserved-reader-kind). This chapter does not redefine those rules but explains practical pitfalls like file mirroring and fan-out.

## 1. The Four-Stage Reading Chain and How `document` Differs in Question

Grouping by "how big" causes constant confusion. Group by **what question it answers** instead.

| kind | Question answered | Example |
|---|---|---|
| `project` | What are we delivering? | `auth-platform` |
| `domain` | Where do concerns split within it? | `auth` · `billing` |
| `capability` | What can this system do? | `token-issue` |
| `element` | How is that action realized? | `jwt-signer` |
| `document` | What decisions/policies/explanations are recorded? | `ADR: local-first persistence` |

This table shows exploration order, not a copy of discrimination rules. When wavering at boundaries, apply both the positive test and counterexample for each specification. Specifically, having a verb in a sentence does not make it a `capability`, nor does having a noun make it an `element`. Folders, packages, teams, workflows, and README headings are merely evidence first; they do not self-promote to meaning kinds.

## 2. One node per file is a trap

The most common failure is this: open a directory, and create one node per file.

This repository actually did that. Under one capability, there were **92** items in `elements:`, and the list matched the byte count of the `ls` output. Instead of 92 concepts emerging, it was merely a **directory list transcribed into the meaning position**.

**Paths are evidence of concepts, not concepts themselves.** Where a file lives is location; what role it plays is the concept. Therefore:

- `title` describes the **role**. e.g., `jwt-token`, `session-store`.
- Location goes in `path:`.
- If `title` looks like `src/lib/auth/jwt.ts` or ends with a source extension, that is evidence, not a concept name. The tool will detect this and warn you.

**The same applies to slugs.** They must be flat under the kind folder (e.g., `elements/<name>`). Path-like slugs such as `elements/src/views/home` are **rejected**. This is not a matter of taste. The moment two files share a filename, different nodes quietly collapse into one (in this repository, 3 nodes visually became 1, and 4 relationships silently vanished).

## 3. Having many children is not a defect in itself

You might want to impose an upper limit like "children up to 12." There is **no such rule**. It was discarded for two reasons.

**First, the number is the wrong target.** `schema.org`'s `CreativeWork` has dozens of direct subtypes and has been maintained by the committee for 15 years. What separates a healthy 39 from a sick 92 is not the count. It is **whether siblings are interchangeable**. Article/Book/Recipe/Movie cannot be swapped, but "another subcommand" ×92 can.

**Second, the upper limit is bypassed.** If you say "split when it exceeds 12," you can pass by creating two empty baskets named "Group A" and "Group B" and moving half into each. No information is added, yet the metric turns green. **Rules that can be satisfied without understanding are worse than no rules at all**; they create a false sense of confidence.

### So, what is the signal?

The number is a **trigger**, not a limit. Vault's initial range when young is as follows:

| Parent → Child | Initial Trigger |
|---|---|
| domain → capability | ~8 |
| capability → element | ~6 |

Exceeding this number is not a defect, nor does it block writing. **It simply means you should ask one question.** And as Vault matures and the parent of that type exceeds ten, the tool discards this externally imported number and uses **Vault's own distribution**. A mature Vault knows its own shape better than anyone else.

## 4. The Only Test: One Sentence

When you exceed the trigger, there is only one question to ask:

> **Can you write in a single non-circular sentence why this child cannot be swapped with its siblings?**

"Non-circular" is important. Saying "This handles A, so it differs from A" says nothing.

- If you can write it → **leave it as is.** It is normal even if the child has thirty.
- If you cannot write it → Do not create a new node; instead, fix the body of an existing sibling.

Having the same prefix is just a hint, not a test. Measuring in this repository shows that siblings with the same prefix are usually justified, while the actual 92 broken ones **did not even share a prefix.**

## 5. If Three or More Cannot Be Used: Bridge Node

If three or more children cannot write a single sentence, the layer is missing one level.
Insert a node between the parent and its children. Name this node **the behavior they share**.

Create a bridge node only when all four conditions are met.

1. **Use the behavior as the name.** "Group A," "Others," and "Part 2" only divide piles; they add no meaning. Those are just named empty baskets, not bridges.
2. **The behavior must be expressible in one sentence.** If you can't write a sentence, you haven't found a grouping yet.
3. **The bridge itself cannot replace its siblings.** A bridge that can replace an existing node is redundancy, not a layer.
4. **Actually move the children under it.** An empty bridge is just the empty basket you intended to block with; nothing passes through it. Nodes that bind nothing are reported for cleanup.

If even one condition is not met, **create nothing.** Count alone is not evidence of a problem.

## 6. Attach the same evidence to capabilities

When creating a capability, **the unfamiliar agent must first enter one implementation entry point** in the same task into `path:`.

```markdown
---
uid: 71890f3e-7b5d-4c0a-8f14-123456789abc
kind: capability
slug: capabilities/token-issue
title: Token Issuance
domain: domains/auth
path: src/lib/auth/jwt-signer.ts
elements: []                     # Only the slugs of actual implementation role nodes go here
---
```

The path is evidence, not a node. Even if there are multiple files, do not create file-level element nodes if you cannot distinguish each file's role in one sentence. Conversely, if there truly is an independent implementation role, make that role an element and put only its slug in `elements:`.

A capability without evidence is **a claim no one can open.** The agent holding this vault can explain the capability but cannot navigate to it. Thus, such capabilities remain in the cleanup queue (`maintenance`) as `capability_without_evidence`, constantly asking for something to point to until they do.

## 7. It blocks nothing

The above specification **does not reject writes.** Skipping saves successfully, but instead attaches a warning to the response or adds a row to the cleanup queue.

This is not due to laxity but is a calculated choice. Blocking makes the vault feel adversarial, and agents will **find ways to bypass the tool.** A bypassed gate is no gate at all. Therefore, the gate reports, and humans and queues make the judgment.

There is one exception. **Path-based slugs are hard errors.** This is a matter of structural validity, not semantic judgment (like duplicate slugs). Fixing them at creation time costs only the effort of choosing a name; fixing them later incurs the cost of renaming cascades.

## Summary

- Choose layers based on **the question being answered**, not size.
- Determine the exact kind in **a single meta-model specification**.
- **Paths are evidence; roles are concepts.** `title` indicates role, and position is defined by `path:`.
- **There is no upper limit on count.** Numbers serve only as triggers to ask questions.
- The test is simple: **Can you explain in one sentence why it cannot be swapped with a sibling?**
- Use **bridge nodes** only if three or more cannot be used, and only when all four conditions are met.
- Attach **evidence to the same hand as capability**. The path alone is sufficient.

This specification applies not just to humans. AI agents connected via MCP also read the same sentences before acting. This ensures that nodes created by humans and those created by agents have the same structure.

The repository analyzer also has a separate processing limit on the number of candidates shown at once. This is a mechanism to keep the **evidence packet bounded** for both LLMs and humans, not a rule governing node count or direct connection counts in this section. Check the [Ontology Quality Authority Map](https://github.com/wlsdks/ontology-atlas/blob/main/docs/ONTOLOGY-QUALITY.md) for current values per language and verification ownership locations.

Next is [How Relations Are Formed](/guide/relations). Once nodes are defined, it is time to connect them.
