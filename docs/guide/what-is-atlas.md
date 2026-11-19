---
title: "What is Ontology Atlas?"
doc_type: guide
status: current
area: product
---

# What is Ontology Atlas?

Ontology Atlas is an open-source app that keeps a map of what your codebase
builds and why. The map is an ontology: a set of named concepts and the typed
relations between them, stored as Markdown files in your repository. You see it
as a map on screen. Coding agents such as Claude Code, Codex, Cursor and
Antigravity read and update the same files over MCP (Model Context Protocol).

This guide explains what that means, how to start, and how to keep the map
accurate while agents change the code.

## The problem it solves

Coding agents change code faster than a team can read it. After a few weeks of
handing work to agents, simple questions get hard to answer. Which part of the
product does this file serve? What depends on it? What did the last change
touch? The agent's own summary of its work is a claim, not independent evidence.

Atlas keeps the answers next to the code:

- **What each part is for.** A domain such as "Orders", a capability such as
  "Check out a cart", and the implementation elements that realize it.
- **Where it lives.** A concept can name the source path that implements it.
- **What depends on what.** Relations are written down, with a one-line reason
  where it matters.
- **What nobody knows yet.** A missing relation is shown as unknown, never as
  "safe".

## What you see

One concept is one Markdown file. At the top of the file is a short info
block, called frontmatter: a few lines of YAML with the concept's `kind`,
`title` and relations. The concept becomes a point on the map, and its relations
become lines. Select a concept and the map lights up what it depends on and what
uses it, and a panel names each one.

The map shows the same concepts in several views: **Flat**, **Hex**, **Domain
structure**, **3D** and **Neural**. Other screens in the app read the same
folder, among them **Library** (source documents and wiki pages),
**Planning**, **Projects**, **Harness** (what an agent reads in your repository
and what checks its work), **Changes** and **Git**.

## Who uses it

- **You**, to understand the system, check the evidence behind a concept, and
  correct or reject what an agent wrote. Every change is a Markdown diff you
  review in Git like code.
- **Your coding agent**, to read the concepts, code paths and open questions a
  task touches before it starts, and to propose updates after it changes the
  code. The agent starts the Atlas MCP server on your computer, so the app does
  not need to be open.

## Where it runs

- **macOS app** (Apple Silicon): signed and notarized, with the MCP server
  inside the app.
- **Windows x64 beta**: unsigned, with the same folder and MCP features.
- **Browser**: Chrome or Edge can open a folder from your disk and show the map.
  The browser cannot register an agent, has no agent chat and does not store API
  keys. Without a folder, it shows a sample map.
- **Linux**: use the browser, or run the CLI and MCP server from a source
  checkout ([The CLI](/guide/cli)).

There is no account, no Atlas server and no telemetry. Your folder stays plain
Markdown on your disk ([Data, privacy and safety](/guide/trust)).

## When it helps, and when it does not

It helps when the codebase is too large to hold in your head, when you paste the
same background into every agent session, or when you need to see what a change
may affect before you accept it.

It adds little to a project of a few files, or when you only need code
structure: search and a language server answer that faster. A line on the map
is a declared relation, not proof of runtime behavior. And Atlas is early: its
own benchmark has not yet shown that agents give better answers with it
([the measurement](https://github.com/wlsdks/ontology-atlas/blob/main/docs/benchmark/README.md#current-measurement-status)).

## Read next

1. [What is an ontology?](/guide/what-is-an-ontology): the idea behind the map,
   in general and for a codebase.
2. [Getting started](/guide/first-five-minutes): download the app or try the
   browser, then open or create your ontology folder.
3. [Connect a coding agent](/guide/connect-agent): let Claude Code, Codex or
   Cursor read the map over MCP.
4. [Build the first map from your code](/guide/from-your-repo): let the agent
   draft the first concepts, and review them.
