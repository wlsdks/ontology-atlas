---
title: "What is an ontology?"
doc_type: guide
status: current
area: product
---

# What is an ontology?

An ontology is a shared, written description of the things in a field and how
they relate: which concepts exist, what kind each one is, which relations can
connect them, and what each of those words means. Below, you find the idea in
general, how it differs from a taxonomy, a schema and a knowledge graph, and
the ontology Ontology Atlas uses to describe a codebase.

## The idea in general

Every team already has an ontology, usually an unwritten one. When people say
"order", "payment" and "refund", they assume they mean the same things. They
also know that a refund belongs to an order and that checkout depends on
payment. Problems start when two people use the same word for different things,
or when nobody remembers why two parts are connected.

A written ontology makes those agreements explicit. It has four parts:

- **Concepts**: the named things, such as "Orders" or "Check out a cart".
- **Kinds**: the type of each concept. A kind tells you what sort of thing a
  concept is and what questions it should answer.
- **Relations**: typed links between concepts, such as "belongs to", "depends
  on" or "describes". A relation has a direction and a meaning, so "A depends on
  B" says something different from "A is related to B".
- **Agreed meaning**: short definitions, so that people and programs read each
  concept and each relation the same way.

## How it differs from similar terms

These words overlap, and people use them loosely. In this guide they mean the
following.

- A **taxonomy** is a hierarchy of categories, where each item sits under a
  broader one. It has essentially one relation: "is a kind of". An ontology can
  contain a taxonomy, but it also has other relations, such as dependency.
- A **schema** defines the shape of data: which fields a record has and what
  type each field is. It says how to store a thing, not what the thing means in
  your domain. Atlas has a schema too, for the fields in each file, but the
  schema is not the ontology.
- A **knowledge graph** is a set of concrete things connected by relations.
  An ontology usually supplies the vocabulary a knowledge graph uses: the kinds
  and the relation types. In Atlas, the kinds and relation types are that
  vocabulary, and the files in your folder are the graph you build with it.

Formal ontology languages such as OWL and RDF add logic that a program can use
to infer new facts. Atlas does not do that. It stores only what a person or an
agent wrote, and it never infers a relation that nobody wrote.

## Why a codebase needs one

Code shows how something is built. It rarely shows what the parts are for,
which rules matter, or why two modules must change together. That knowledge
usually lives in people's heads and in old documents.

Coding agents make this gap wider. An agent can change dozens of files in a
few minutes, faster than a person can read them. Without a shared description
of the system, each agent session starts from zero, and each review starts from
a list of changed files. An ontology of the codebase gives both sides the same
starting point. Before a task, the agent reads which concepts it touches. After
the change, the person checks which concepts it affects.

## The ontology Atlas uses

Atlas stores the ontology in a folder of Markdown files, the ontology folder.
It is usually an `atlas/` folder inside your repository. One concept is one
file. The frontmatter at the top of the file holds the concept's identity, kind
and relations. The body below explains it in plain prose.

There are five kinds:

| Kind | What it is | Example |
|---|---|---|
| `project` | The product or system the folder describes | "A web shop for small retailers" |
| `domain` | A lasting area of responsibility that would survive a rewrite | Orders, Identity, Billing |
| `capability` | Something the system can do, stated without naming the code | Check out a cart |
| `element` | A concrete implementation part with a source path | Checkout service, `src/orders/checkout.ts` |
| `document` | A text that explains or decides something about other concepts | An architecture decision record |

The relations are written as frontmatter keys:

- `domains`, `capabilities` and `elements` list what a project, domain or
  capability contains, and `domain` names the domain a capability or element
  belongs to.
- `dependencies` says that one concept needs another (**Depends on** on the
  map). It has a direction. The reverse is read from the other side, not
  written twice.
- `relates` is a loose association, with no direction and no cause implied.
- `describes` links a document to the concepts it explains.
- `broader` says that a concept is a narrower case of another concept of the
  same kind. The map labels its line **Broader concept**.
- `relation_notes` holds one sentence per relation that says why it holds.

Every concept also has a `uid` and a `slug`. The `uid` is a permanent
identifier that never changes. The `slug` is the concept's current readable
address, such as `capabilities/checkout`, and it changes when you rename the
concept.

## An example file

Here is a capability file from an online store, as it appears in the folder:

```markdown
---
uid: 3f6c2a9e-8b41-4d7a-9c25-6e0f1b7d4a12
slug: capabilities/checkout
kind: capability
title: Check out a cart
description: Turn a cart into an order after one payment authorization.
domain: domains/orders
elements: [elements/checkout-service]
path: src/orders/checkout.ts
dependencies: [capabilities/payment-authorization]
relation_notes: { capabilities/payment-authorization: "An order is created only after the payment provider authorizes the amount." }
---

# Check out a cart

Turns the current cart into an order. It does not handle refunds.
```

On the map, this file becomes one concept inside the Orders domain. One line
leads to the checkout service that implements it, and another to the payment
authorization it depends on. Click that line and a small panel shows the
reason written in `relation_notes`.

## What an Atlas ontology does not claim

A relation in the folder is a declared claim, not proof. It says that someone
wrote "checkout depends on payment authorization", not that the program was
traced at runtime. A missing relation means "unknown", not "no connection".
This keeps the map honest: it shows what was written down, and where nobody has
written anything yet.

## Read next

- [Getting started](/guide/first-five-minutes): open or create your own
  ontology folder.
- [Choosing concepts](/guide/what-becomes-a-node): how to choose between a
  domain, a capability and an element.
- [Relations between concepts](/guide/relations): every relation type in
  detail.
- The full specification:
  [ONTOLOGY-ATLAS-SPEC.md](https://github.com/wlsdks/ontology-atlas/blob/main/docs/ONTOLOGY-ATLAS-SPEC.md).
