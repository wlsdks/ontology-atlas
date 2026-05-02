# X / Twitter — launch thread draft

X 의 언어는 **짧고 시각적**. 5–7 트윗 짜리 thread 가 sweet spot. 각
트윗 280 chars 안. 1 트윗 = 1 idea.

## Tweet 1 (hook + visual)

```
shipped: oh-my-ontology — your codebase's mental model lives as
markdown frontmatter. humans + AI agents author the same vault.

`npx oh-my-ontology init` ⤵️ 30 second start
oh-my-ontology.web.app · MIT
[demo gif: 8s loop of editing frontmatter → graph updates]
```

## Tweet 2 (the problem)

```
every "AI in your codebase" tool today ingests source files into a
context window and prays the LLM remembers your architecture.

the mental model of *what owns what / depends on what / why this exists*
lives in a vendor's memory silo. or nobody's.
```

## Tweet 3 (the alternative)

```
what if the mental model lived in your git repo?

domains/auth.md ─┐
                ├─ capabilities/login.md ─ elements/jwt-token.md
                └─ capabilities/signup.md

each .md = a node. frontmatter = the graph.

```yaml
---
kind: capability
domain: domains/auth
depends_on: [capabilities/signup]
---
```
```

## Tweet 4 (AI fits in)

```
AI agents (Claude Code, Cursor, etc.) read it via MCP — 11 tools:
list_concepts, find_path, find_orphans, add_concept, patch_concept …

ask "what breaks if I refactor auth/login?" → agent calls find_backlinks
and gives a real answer. the dependency graph is in the repo, not a silo.
[screenshot: claude code calling find_path → answer]
```

## Tweet 5 (visual layer)

```
3 views over the same vault:
- topology (Sigma WebGL)
- tree (drill-down)
- ERD builder (xyflow)

all 3 read+write the same .md files. local-first by default. firebase
JS doesn't even load on the static export's first paint (CI guard
verifies).
[screenshot: 3-up of the views]
```

## Tweet 6 (non-dev angle)

```
the part I care about most: PMs, designers, domain experts can
*read and edit the same markdown*.

they don't need to learn the codebase. they contribute to its mental
model. their edits become input the AI uses when planning the next feature.

ontology authoring as a team sport.
```

## Tweet 7 (CTA)

```
try it:
- npx oh-my-ontology init my-vault
- demo: oh-my-ontology.web.app
- repo: github.com/wlsdks/oh-my-ontology

solo project, MIT, korean+english docs. would love criticism — what
breaks for you in 5 minutes?
```

## Posting tips

- Post the thread in one go (drafts feature)
- Pin tweet 1 to profile
- Quote-tweet your HN submission link in a separate post a few hours later
- Tag relevant accounts only if you've actually used their work — no
  cold @ to influencers
- Don't auto-DM new followers
- Reply to every reply for first 24 hours
