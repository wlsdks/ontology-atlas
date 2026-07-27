# Hacker News — Show HN draft

Submission type: **Show HN**
Category: open source / dev tool

## Title (30 char range, < 80 max)

```
Show HN: ontology-atlas – Markdown frontmatter as a codebase ontology, for humans + AI agents
```

(80 chars exactly — under HN's 80 char limit. If too long, fallback:
`Show HN: ontology-atlas – frontmatter is the graph; AI agents read it via MCP`)

## URL

`https://github.com/wlsdks/ontology-atlas`

## Text (optional, but encouraged for Show HN)

```
Hi HN. I built this because every "AI in your codebase" tool today
ingests source files into an LLM context window and hopes the model
remembers your architecture. The mental model — "what owns what, what
depends on what, why this exists" — lives in the AI vendor's memory
silo, or in nobody's.

ontology-atlas takes the opposite path. The mental model is a folder of
markdown files. Frontmatter is the graph: `kind: capability`, `domain:
auth`, `depends_on: [...]`. Humans edit it in any markdown editor. AI
agents read and write it via a local MCP server (32 tools — list,
get, validate_vault, compile_ontology, query_ontology,
analyze_repo_structure, infer_imports, add_concept, add_concepts,
patch_concept, rename_concept, ...).

A canvas map over the same vault, plus a workshop surface for filling in
a concept's missing relations. Local-first by default — no backend, no
auth, no cloud SDK anywhere in the bundle.

The distribution decision I'd defend hardest: the macOS app carries the
compiled MCP server inside its own bundle. One download installs both
the surface a person reads and the server their agent talks to. Open a
vault folder, press "Connect agent", and the app writes .mcp.json (Claude
Code/Cursor) or .codex/config.toml (Codex) with the real absolute paths
already filled in — then spawns the server and round-trips a get_concept
call to prove it before showing you a green light. It shows you the file
it is about to write first; you approve, and it lands as plain text you
can read in a git diff. No terminal, no Node, no install step, and
nothing published to a registry you have to trust.

If you'd rather stay in a terminal, a source checkout gives you the same
CLI and MCP server directly.

Hosted demo (read-only, our own dogfood vault — 97 nodes, no install):
https://wlsdks.github.io/ontology-atlas/

What I'd love feedback on:

1. Is "vault frontmatter as the canonical graph" a useful framing for
   you? Or does it feel like just glorified Obsidian?
2. The MCP integration — does this fit how you're using Claude Code /
   Cursor / Continue today? What tool would you add?
3. Non-developer angle — would your PMs, designers, domain experts
   actually open these markdown files? What would make that easier?
4. Shipping the MCP server inside the app instead of publishing it to a
   registry — does that read as convenient or as a lock-in smell? The
   vault stays plain markdown either way, so I think it's the former,
   but I'd rather hear it now.

The desktop app is macOS-only today (Windows in preparation). The CLI,
the MCP server, and the browser workbench run anywhere Node 24 does.

Built solo over the past few months. MIT licensed. Korean + English
docs (mixed). Critique welcome.
```

(Word count: ~380. HN expects substantive Show HN posts, not one-liners;
it also tolerates this length when the post is answering "how does it
actually reach my machine".)

## Posting tips

- **Best time**: Tue/Wed 8–10am ET (HN peak)
- **First comment** (you, OP): Add 1–2 sentence thank-you to early
  commenters and a *concrete* answer to the most upvoted question
- **Don't ask for upvotes**. HN explicitly disallows.
- **Respond fast** to the first 5 comments — they shape the thread
- **Link to specific code paths** in your replies to demonstrate depth
- If 4-hour mark and you're still on front page: post the demo gif as
  a follow-up reply (don't edit OP)
