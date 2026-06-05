# FOUNDATIONS — what grounds ontology-atlas

> 이 문서는 제품을 *느낌*이 아니라 **공개·인용 가능한 학술/표준/craft 레퍼런스**에 묶어 둔다.
> "온톨로지가 뭔지도 모르면서 만드는" 것을 막기 위한 근거 모음 — 무엇이 이미 있고, 우리가 그 위에서
> *우리만의 것*을 어디서 어떻게 다르게 만드는지.
>
> **인용 규율:** 여기 실린 레퍼런스는 전부 공개 논문 / W3C 표준 / 공개 서적 / 공개 블로그이며,
> 2026-06-01 자동 리서치 워크플로(6 facet × research→adversarial fact-check)에서 **각 출처의
> 제목·저자·URL 을 독립 웹 확인(25/25 verified)** 한 것만 실었다. 링크/인용은 하되 본문을 베끼지 않는다.
> 새 레퍼런스를 추가할 땐 같은 규율(공개·인용가능·웹확인)을 지킨다.

This is a living document. When we make a design or feature decision, we should be able to point
at *which* of these it descends from — or argue explicitly why we diverge.

---

## 1. What an ontology actually is

The word is older than software (Aristotle's *categories of being*), but our usage is the
**information-science / knowledge-representation** one.

- **Gruber (1993)** gave the most-cited definition: *"an ontology is an explicit specification of a
  conceptualization"* — a representational vocabulary (classes, relations, functions, objects) for a
  shared domain, designed so knowledge can be **shared and reused** across AI systems.
  → Our vault's markdown frontmatter *is* "an explicit specification of a conceptualization" of a
  codebase; `project / domain / capability / element` + typed relations (`contains` / `depends_on` /
  `evidence`) are exactly Gruber's classes-and-relations vocabulary. The name is earned, not marketing.
- **Studer, Benjamins & Fensel (1998)** sharpened it to the canonical four-part definition:
  *"a **formal, explicit specification** of a **shared conceptualization**."* Word by word:
  *conceptualization* = an abstract model of phenomena; *explicit* = concept types and constraints
  are defined, not implied; *formal* = machine-readable (excludes free prose); *shared* = consensual,
  not private.
  → This is the single most precise sentence for our framing. *Formal/explicit* = machine-parseable
  frontmatter the MCP server reads; *shared* = the vault is the **shared memory between the developer
  and their AI coding agent**. Each word maps to a property we actually have.
- **Noy & McGuinness, "Ontology Development 101" (Stanford, 2001)** is the practical methodology:
  define classes + a hierarchy, define properties (slots) + constraints (facets), then instances —
  and crucially, *"ontology development is iterative, there is no single correct ontology, and the
  right design depends on the intended application and anticipated extensions."*
  → This is our **grow-the-vault-each-session, agent-maintained, no-one-true-model** stance, verbatim.

### The formality spectrum — and where we deliberately sit

The W3C Semantic Web stack is the standard reference frame:

- **RDF (2014)** — knowledge as **subject-predicate-object triples** over a graph. Our every typed
  relation (`A contains B`, `A depends_on B`) *is* a triple. We are a lightweight, git-native instance
  of this well-established graph-data model, not an ad-hoc format.
- **OWL 2 (2012)** — the **heavyweight** end: classes/properties/individuals with **description-logic
  reasoning** (consistency checking, classification, inference). We adopt its vocabulary and graph
  semantics but **deliberately do not** require a DL reasoner.
- **SKOS (2009)** — the **lightweight** end: `skos:Concept` + `broader`/`narrower`/`related`, a
  "concept scheme over strict logic." This is the closest precedent to our posture.

> **Our position on the spectrum:** a pragmatic middle ground — *more structured than a flat tag list,
> lighter than OWL.* Human-and-agent-readable markdown, no reasoner, no backend. SKOS-like in spirit,
> RDF-shaped in data, Gruber/Studer in definition.

---

## 2. Agent memory & LLM × knowledge-graph (the live field, 2023–2026)

Our wedge — *"the AI agent forgets the codebase every session; this is git-native ontology memory it
maintains and queries"* — sits inside an active, recognized research lineage. We are **not** inventing
the category; we are taking a specific, opinionated position in it.

**The "LLM forgets; give it external memory" premise:**

- **MemGPT (Packer et al., 2023)** — "virtual context management": the model pages information between
  a fixed context window (fast memory) and external stores (slow memory) via self-issued function
  calls, simulating unbounded context. → We are the **codebase-specific, structured & human-readable
  version of MemGPT's "slow memory"**: the agent pages the repo's mental model in/out via 23 MCP tools
  instead of opaque archival storage.
- **"A Survey on the Memory Mechanism of LLM-based Agents" (Zhang et al., ACM TOIS, 2024)** — the
  peer-reviewed taxonomy of memory *sources / forms / operations* and *evaluation*. → Lets us name our
  choices precisely: **structured (KG) over textual** memory, **write-on-task-completion** operations,
  **human-readable + git-versioned** storage, **codebase** domain. Safest single category-overview citation.

**Memory as a maintained knowledge graph (the closest analogues):**

- **Zep / Graphiti (Rasmussen et al., 2025)** — agent memory as a **temporal knowledge graph** with a
  bi-temporal model (event time + ingestion time). The single closest published analogue to us: both
  treat long-term agent memory as an explicit, maintained graph of typed entities + relations, not a
  vector blob. → **Where we differ:** we get temporality *for free* from **git history + markdown
  diffs** rather than a dual-timeline DB; our domain is the **codebase**, not conversation; our store
  is **plain files in the repo**, not a graph DB.
- **Mem0 (Chhikara et al., ECAI 2025)** — production memory with a plain-extraction mode *and* a
  graph mode (`Mem0g`); emphasizes token-cost / latency savings from retrieving a small relevant slice
  instead of full context. → Mirrors our choice to make **the graph the primary artifact** (markdown
  frontmatter *is* the graph), and supplies our pragmatic argument: a maintained ontology lets the
  agent fetch a small relevant subgraph instead of re-reading the whole repo each session.

**LLM × KG more broadly:**

- **Pan et al., "Unifying LLMs and Knowledge Graphs: A Roadmap" (IEEE TKDE, 2024)** — the canonical
  framing of three patterns: KG-enhanced LLMs, **LLM-augmented KGs** (the LLM does construction /
  completion / QA), and **synergized** LLM+KG as equals. KGs are positioned as *explicit, interpretable,
  editable* stores that compensate for the LLM black box. → This *is* our core thesis. Our vault loop is
  "LLM-augmented KG + synergized": the agent both **queries** the graph for grounding and
  **maintains/extends** it.
- **GraphRAG (Edge et al., Microsoft, 2024; + `microsoft/graphrag`)** — an LLM derives an entity graph
  from documents, pre-summarizes communities, and answers *global* questions flat vector-RAG can't.
  → The flagship example of an LLM **building and querying a graph as a memory/index layer**; we apply
  the same pattern to a **codebase**. **Where we differ:** GraphRAG produces a generated artifact store;
  our graph is a **human-editable, diff-reviewable markdown vault** that is the source of truth.
- **"LLMs on Graphs: A Comprehensive Survey" (Jin et al., TKDE, 2023/2024)** — vocabulary for what we
  are: a **text-attributed graph** (frontmatter nodes + typed edges) an LLM reasons over (as
  predictor / encoder / aligner). Grounds the claim that LLMs *can* reason over typed-edge graphs, not
  only prose.
- **"LLM-empowered Knowledge Graph Construction: A Survey" (Bian, 2025, preprint)** — schema-based vs
  schema-free KG construction, and explicitly names **"dynamic memory for agentic systems"** as a
  direction. → Our per-kind normalized frontmatter schema is the schema-based pole; "dynamic memory for
  agentic systems" is our exact positioning.
- **"Towards Agentic RAG with Deep Reasoning: A Survey" (2025, preprint)** — "agentic RAG": an agent
  loops over an external store to ground multi-step reasoning. → Frames our loop in current terms:
  RAG-*enhanced reasoning* over a maintained graph, not one-shot retrieval.

---

## 3. The codebase side — code knowledge graphs

The other half of our lineage: representing **code** as a queryable graph rather than re-parsing it
each time. The premise that a codebase's meaning is best captured as a graph of typed nodes + typed
edges is well-established academic and industrial prior art.

- **Code Property Graphs (Yamaguchi et al., IEEE S&P 2014)** — fuse AST + control-flow + program-
  dependence into one queryable graph; express patterns as graph traversals (found 18 unknown Linux
  vulnerabilities). → The foundational academic precedent for "**a codebase's meaning is a unified
  graph you traverse, not re-derive.**" We fuse `project/domain/capability/element` + edges into one
  vault the same way.
- **Glean (Meta, open-source, 2024)** — schema-defined **typed facts** about code in a queryable fact
  DB, interrogated with a Datalog-style language; powers navigation across a monorepo. → The closest
  *industrial* analogue. **Contrast:** Glean = machine-*generated* facts; we = **human + agent-maintained,
  git-native, markdown-as-source-of-truth.**
- **SCIP (Sourcegraph, 2022)** — a portable, **human-readable**, language-agnostic code-index protocol
  with stable string symbol IDs. → Validates our choice of a **portable, human-readable, on-disk**
  representation (markdown frontmatter; slug-keyed nodes) over an opaque binary index.
- **CodeQL (GitHub/Semmle)** — "**treat code as data**": extract a relational DB of facts, query it to
  find patterns/variants. → The mainstream embodiment of "**query your codebase like a database**" —
  precisely what we offer an agent via 23 MCP query tools (`find_path`, `find_backlinks`, …) instead of
  re-reading files.
- **tree-sitter (Brunsfeld et al.)** — incremental parsing → concrete syntax trees with an
  S-expression query system; the substrate beneath most code indexers (and our own CodeGraph index).
  → The **structural** layer ("what symbols exist, how they nest"). We layer the **meaning** layer
  (domains, capabilities, evidence, impact) *on top* — that separation is the point.

> **The gap we fill:** CPG / Glean / CodeQL / tree-sitter answer *structural* questions
> (what calls what, what's defined where) — machine-derived, exhaustive, regenerated. We hold the
> **human-and-agent-meaningful** layer: *why* this exists, *which capability* it serves, *what breaks*
> if it changes — curated (not exhaustive), maintained by the developer + agent together, in git.

---

## 4. Design lineage — restraint as craft, cited

Our "Linear-restrained" design language (`docs/DESIGN-SYSTEM.md`, `.claude/rules/design.md`) is an
applied reading of public, citable design thinking — not arbitrary taste.

- **Dieter Rams, "Ten Principles for Good Design" (Vitsœ)** — *unobtrusive, honest, long-lasting,
  thorough to the last detail,* and *"as little design as possible"* ("Less, but better").
  → The rationale for neutral greys + a single indigo and the bans on glow/neon/gradients/glassmorphism.
  Our whole forbidden-pattern list is applied Rams.
- **Edward Tufte, *The Visual Display of Quantitative Information*** — the **data-ink ratio** (erase
  non-data ink / chartjunk) and **graphical integrity** (representation proportional to the quantities).
  → Grounds the live topology + insights surfaces: maximal signal, minimal chrome; honest, proportional
  rendering of relations so agent and developer read the *same true* model.
- **Wathan & Schoger, *Refactoring UI*** (also the Tailwind authors) — establish hierarchy by
  **de-emphasizing**, use a constrained spacing/type scale, **limit the palette deliberately**.
  → The concrete how-to behind our `@theme` token scale, the per-screen gutter/spacing consistency
  work, and the "no second coloring system" rule.
- **John Maeda, *The Laws of Simplicity*** — *Reduce* and *Organize* ("make a system of many appear
  fewer"); *"subtract the obvious, add the meaningful."* → Justifies the kind hierarchy + typed
  relations as the organizing device, and the agent's job of maintaining a **lean, high-signal** memory
  graph rather than dumping everything.
- **Karri Saarinen / Linear, "Why is quality so rare?"** — quality is a deliberate daily choice and a
  strategic advantage; it spreads by advocacy, not ads; craft = believing it matters + skill to
  recognize it + care for the user. → The canonical public statement of the philosophy our design
  descends from — restraint as a *quality* decision that wins against louder AI-generated-UI clichés.
- **Rauno Freiberg, "Craft" (rauno.me)** — exceptional UI is *invisible details* (microinteractions,
  states, motion, polish) you feel, not flashy moments. → Our bar for hover/focus states, transitions,
  and the topology's feel — *without* the forbidden flashy patterns.
- **Emil Kowalski, "Great animations" (emilkowal.ski)** — natural physics-based motion; sub-300ms
  ease-out; **purposeful** (convey state, not decorate); 60fps via transform/opacity only;
  interruptible; respect `prefers-reduced-motion`. → Concrete, citable rules behind our motion budget
  (`transition-colors`/opacity, sub-200ms, minimal transform). Justifies how the live topology animates
  as the agent grows the vault: **state-conveying, not glow/pulse decoration.**
- **Vercel Geist** & **Radix Primitives** — public reference points for the developer-tool aesthetic
  (high-contrast accessible color, mono for code/diagrams) and the **"unstyled accessible primitive +
  our own theming"** split we follow (inspector, forms, palette; the recent a11y label-association work).

---

## 5. Our own thing — what's genuinely ours

Everything above already exists. Our contribution is a **specific combination** none of the prior art
holds all of at once:

1. **Agent-maintained** — the AI coding agent reads *and writes* the graph directly via MCP (24 tools),
   not a human-only ontology editor (Protégé) and not a machine-only fact generator (Glean/CodeQL).
2. **Git-native, markdown-IS-the-graph** — the frontmatter is the source of truth, reviewable as a
   diff, versioned by git, no backend / no DB. (Zep/Graphiti = graph DB; GraphRAG = generated store;
   mem0 = service. We = files in your repo.)
3. **Live topology as the surface** — the same graph is the *human comprehension surface*: you watch it
   grow as the agent edits, and you edit it back. (Tufte's data-ink + Linear's craft applied to a KG.)
4. **Codebase-scoped meaning layer** — not conversation memory (Zep/mem0) and not structural code facts
   (tree-sitter/Glean), but the *why/owns/impacts* layer **on top of** structure, curated by developer +
   agent.

**The honest framing:** *agent memory = a maintained knowledge graph* (Zep, Pan et al., the memory
survey all agree). We take the most **inspectable, lowest-infrastructure** position in that space — a
SKOS-light, RDF-shaped, Gruber-defined ontology that lives as markdown in the repo, maintained by the
agent, read by the human as a live map. That is the thing to make excellent.

---

## References (all web-verified 2026-06-01 · 25/25)

**Ontology theory & standards**
- Gruber, T. R. (1993). *A Translation Approach to Portable Ontology Specifications.* Knowledge Acquisition 5(2). DOI 10.1006/knac.1993.1008 · https://tomgruber.org/writing/ontolingua-kaj-1993.pdf — *peer-reviewed*
- Studer, R., Benjamins, V. R., & Fensel, D. (1998). *Knowledge Engineering: Principles and Methods.* Data & Knowledge Engineering 25(1-2). DOI 10.1016/S0169-023X(97)00056-6 — *peer-reviewed*
- Noy, N. F., & McGuinness, D. L. (2001). *Ontology Development 101.* Stanford KSL-01-05 / SMI-2001-0880 · https://protege.stanford.edu/publications/ontology_development/ontology101.pdf — *tech report*
- W3C (2014). *RDF 1.1 Concepts and Abstract Syntax.* https://www.w3.org/TR/rdf11-concepts/ — *W3C Recommendation*
- W3C (2012). *OWL 2 Document Overview (2nd ed.).* https://www.w3.org/TR/owl2-overview/ — *W3C Recommendation*
- W3C (2009). *SKOS Reference.* https://www.w3.org/TR/skos-reference/ — *W3C Recommendation*

**Agent memory & LLM × KG**
- Packer, C., et al. (2023). *MemGPT: Towards LLMs as Operating Systems.* arXiv:2310.08560 — *preprint*
- Zhang, Z., et al. (2024). *A Survey on the Memory Mechanism of LLM-based Agents.* ACM TOIS. DOI 10.1145/3748302 · arXiv:2404.13501 — *peer-reviewed*
- Rasmussen, P., et al. (2025). *Zep: A Temporal Knowledge Graph Architecture for Agent Memory.* arXiv:2501.13956 — *preprint* · Graphiti (OSS): https://github.com/getzep/graphiti
- Chhikara, P., et al. (2025). *Mem0: Production-Ready AI Agents with Scalable Long-Term Memory.* arXiv:2504.19413 (ECAI 2025) — *peer-reviewed (reported)*
- Pan, S., et al. (2024). *Unifying LLMs and Knowledge Graphs: A Roadmap.* IEEE TKDE 36(7) · arXiv:2306.08302 — *peer-reviewed*
- Edge, D., et al. (2024). *From Local to Global: A Graph RAG Approach.* arXiv:2404.16130 — *preprint* · `microsoft/graphrag` (MIT): https://github.com/microsoft/graphrag
- Jin, B., et al. (2023/2024). *Large Language Models on Graphs: A Comprehensive Survey.* IEEE TKDE · arXiv:2312.02783 — *peer-reviewed*
- Bian, H. (2025). *LLM-empowered Knowledge Graph Construction: A Survey.* arXiv:2510.20345 — *preprint*
- (2025). *Towards Agentic RAG with Deep Reasoning: A Survey of RAG-Reasoning Systems.* arXiv:2507.09477 — *preprint*

**Code knowledge graphs**
- Yamaguchi, F., Golde, N., Arp, D., & Rieck, K. (2014). *Modeling and Discovering Vulnerabilities with Code Property Graphs.* IEEE S&P. https://ieeexplore.ieee.org/document/6956589/ — *peer-reviewed*
- Meta Engineering (2024). *Indexing code at scale with Glean.* https://engineering.fb.com/2024/12/19/developer-tools/glean-open-source-code-indexing/ — *official blog / OSS*
- Sourcegraph (2022). *SCIP — Code Intelligence Protocol.* https://scip-code.org/ — *open protocol*
- GitHub. *About CodeQL.* https://codeql.github.com/docs/codeql-overview/about-codeql/ — *official docs*
- Brunsfeld, M., et al. *Tree-sitter.* https://tree-sitter.github.io/tree-sitter/ — *OSS docs*

**Design**
- Rams, D. *Ten Principles for Good Design.* Vitsœ. https://www.vitsoe.com/us/about/good-design — *public*
- Tufte, E. R. (1983/2001). *The Visual Display of Quantitative Information.* Graphics Press. https://www.edwardtufte.com/book/the-visual-display-of-quantitative-information/ — *book*
- Wathan, A., & Schoger, S. (2018). *Refactoring UI.* https://www.refactoringui.com/ — *book*
- Maeda, J. (2006). *The Laws of Simplicity.* MIT Press. https://mitpress.mit.edu/9780262539470/the-laws-of-simplicity/ — *book*
- Saarinen, K. (2025). *Why is quality so rare?* Linear. https://linear.app/now/why-is-quality-so-rare — *public blog*
- Freiberg, R. *Craft.* https://rauno.me/craft — *public*
- Kowalski, E. *Great animations.* https://emilkowal.ski/ui/great-animations — *public*
- Vercel. *Geist — Introduction.* https://vercel.com/geist/introduction — *public docs*
- Radix UI. *Primitives — Introduction.* https://www.radix-ui.com/primitives/docs/overview/introduction — *public docs*
