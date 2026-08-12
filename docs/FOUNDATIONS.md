# FOUNDATIONS — what grounds ontology-atlas

> 이 문서는 제품을 *느낌*이 아니라 **공개·인용 가능한 학술/표준/craft 레퍼런스**에 묶어 둔다.
> "온톨로지가 뭔지도 모르면서 만드는" 것을 막기 위한 근거 모음 — 무엇이 이미 있고, 우리가 그 위에서
> *우리만의 것*을 어디서 어떻게 다르게 만드는지.
>
> **인용 규율:** 여기 실린 레퍼런스는 전부 공개 논문 / W3C 표준 / 공개 서적 / 공개 블로그다.
> 최초 세트는 2026-06-01, ontology-construction 보강 세트는 2026-08-09에 원문·공식 메타데이터를
> 다시 열어 확인했다. 링크/인용은 하되 본문을 베끼지 않는다. 새 레퍼런스를 추가할 때도
> 공개·인용 가능·직접 확인을 지키며, 검색 결과만 보고 읽지 않은 자료를 인용하지 않는다.

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
  codebase. The exact Atlas application model — five authorable kinds, one reserved reader kind,
  relation support layers, `is_a` test, and inference boundary — lives only in
  [`ONTOLOGY-ATLAS-SPEC.md` §2](ONTOLOGY-ATLAS-SPEC.md#2-the-five-authorable-node-kinds-and-reserved-reader-kind).
  The name is earned by that shared meaning model, not by pretending the files implement a standard
  they do not.
- **Studer, Benjamins & Fensel (1998)** sharpened it to the canonical four-part definition:
  *"a **formal, explicit specification** of a **shared conceptualization**."* Word by word:
  *conceptualization* = an abstract model of phenomena; *explicit* = concept types and constraints
  are defined, not implied; *formal* requires a representation with defined semantics, not merely text
  that a parser can read; *shared* = held in common rather than private.
  → Atlas is explicit, shared, and machine-parseable. Its current Markdown schema does **not** claim
  model-theoretic semantics, logical completeness, or a DL reasoner, so “machine-readable = formal” is
  not our claim. This distinction is a trust boundary, not a downgrade.
- **Noy & McGuinness, "Ontology Development 101" (Stanford, 2001)** is the practical methodology:
  define classes + a hierarchy, define properties (slots) + constraints (facets), then instances —
  and crucially, *"ontology development is iterative, there is no single correct ontology, and the
  right design depends on the intended application and anticipated extensions."*
  → This is our **grow-the-vault-each-session, agent-maintained, no-one-true-model** stance, verbatim.

### The formality spectrum — and where we deliberately sit

The W3C Semantic Web stack is the standard reference frame:

- **RDF 1.1 (2014 Recommendation)** — RDF graphs are sets of subject-predicate-object triples whose
  terms are IRIs, blank nodes, or datatyped literals. RDF 1.2 reached Candidate Recommendation Snapshot
  on 2026-04-07; that work-in-progress status is not an endorsement or an Atlas compatibility claim.
  An Atlas edge can be *mapped* to a triple-like statement, but the vault itself is not an RDF
  serialization and does not inherit RDF identity or entailment semantics.
- **OWL 2 (2012)** — the **heavyweight** end: classes/properties/individuals with **description-logic
  reasoning** (consistency checking, classification, inference) under an open-world assumption. Atlas
  does not adopt OWL vocabulary, class/individual semantics, or inference. Missing Atlas evidence is
  `unknown`/a visible gap according to our application contract, not an OWL entailment result.
- **SKOS (2009)** — the **lightweight** end: `skos:Concept` + `broader`/`narrower`/`related`.
  `skos:broader` names a direct broader link and is not itself transitive; Atlas borrows that caution,
  not SKOS semantics or conformance.
- **SHACL 1.0 (2017 Recommendation)** — validates an RDF data graph against a separate shapes graph
  and returns a validation report; it does not make OWL a closed-world schema language. SHACL 1.2 Core
  was still a Working Draft on 2026-08-03. Atlas's validator plays an analogous product role over
  Markdown, but it is an Atlas schema validator, not a SHACL processor.

> **Our position on the spectrum:** a lightweight, application-specific ontology and executable
> meaning model — more structured than tags, deliberately less expressive than RDF/OWL. Human-and-agent
> readable Markdown, typed application relations, deterministic validation/query, no reasoner, no
> backend. “Graph-shaped” describes the implementation; it does not assert standards conformance.

### Construction is a requirements-and-tests lifecycle, not noun extraction

The literature converges on one discipline Atlas adopts: **start from the decisions the ontology must
support, not from a directory tree or a list of nouns.** Grüninger & Fox make competency questions
requirements and benchmarks; NeOn and LOT put requirements, reuse, implementation, publication, and
maintenance in one lifecycle; SAMOD turns a motivating scenario, CQs, a glossary, exemplar data, and
queries into a regression-carrying test case.

Atlas translates that lineage into an eight-stage, local-first construction contract:

1. **Purpose and authority** — name the product outcome, intended users/decisions, scope, non-goals,
   domain-language owners, and sources before proposing concepts.
2. **Requirements as competency questions** — derive CQs from motivating scenarios; give each an
   audience, expected answer shape, required witness kinds, explicit unknown/refusal behavior, and
   owner approval. An LLM may draft a CQ, but may not approve its own requirement.
3. **Evidence inventory and reuse** — separate direct, triangulated, structural, conflicting, and
   absent evidence; search the existing vault before minting a term. A folder name is not a domain and
   an import edge is not automatically a business dependency.
4. **Small conceptual slice** — propose the smallest project→domain→capability→element slice that
   answers a coherent CQ set. Give every concept an intensional definition, includes/excludes, examples,
   counterexamples, and uncertainty. Do not expand the schema to fill a template.
5. **Semantic and structural tests** — reject circular definitions, duplicate siblings, category
   mistakes, dangling references, predicate-direction mistakes, and unsupported `is_a`. Same domain,
   naming similarity, or folder nesting alone never proves subsumption.
6. **Functional and pragmatic tests** — replay CQs against exemplar facts and expected answers, then
   test whether a source-hidden person/agent can make the intended decision with bounded calls and
   supported claims. A valid file is not necessarily a useful ontology.
7. **Human acceptance and provenance** — persist only the accepted write plan; keep source spans,
   graph/source digests, rejected/partial CQs, and the responsible human decision visible. Receipts are
   provenance, not truth certificates.
8. **Regression and evolution** — after each accepted change, rerun prior CQs, graph/schema validation,
   source currentness, impact, and handoff checks. Git records change; the ontology still has to explain
   why the meaning changed and which requirement authorized it.

Recent LLM evidence makes the human-sovereign boundary stronger, not weaker. LLM-generated ontology
drafts can outperform novices in bounded studies, but quality remains variable; one 2025 CQ pipeline
reported only about a quarter of outputs passing scope/relevance and fewer than half as unproblematic.
The 2026 IDEA2 workflow therefore separates LLM elicitation from domain-expert validation and records
the full CQ revision provenance. Atlas follows that separation: **agents accelerate elicitation,
construction, and repair; people own meaning and accepted requirements; an independent evaluator owns
qualification.**

### Quality is a vector; no green total may hide a red dimension

OQuaRE treats an ontology both as a software artifact and as a tool that must be useful. Atlas keeps
that separation and does not reduce construction quality to node count, fan-out, compiler health, or a
single confidence score.

| Dimension | Atlas question | Required evidence | Fail-closed result |
|---|---|---|---|
| Semantic correctness | Are kind, boundary, and predicate meanings defensible? | definitions, includes/excludes, examples/counterexamples, relation rationale | reject or `review_required` |
| Structural conformance | Does the Markdown graph satisfy its declared schema? | parser/compiler/validator results, resolved references | block invalid writes/finalization |
| Functional adequacy | Can it answer the approved CQs? | expected answer + quantified witness coverage | `partial` / `visible-gap` |
| Evidence and provenance | Can each business claim be traced to current sources and an authority? | citations, source spans/digests, approval and receipt lineage | unsupported / stale |
| Pragmatic usefulness | Can each audience make the intended decision without hidden source access? | source-hidden task result, claim ledger, time/calls | unknown / not-qualified |
| Maintainability | Can a change be reviewed and prior meaning retested? | git diff, impact path, CQ regression, source-currentness check | maintenance action required |
| Interoperability honesty | Are exports and standards claims limited to what is implemented? | declared format/profile and round-trip contract | no RDF/OWL/SHACL conformance claim |

Structural metrics and automated judges are diagnostic signals, not acceptance authorities. OOPS! and
OntoClean can expose modeling pitfalls; LLM graph judges can help triage noisy extraction; none replaces
domain requirements, exact witnesses, counterexamples, or independent task-level evaluation.

The re-executable evaluator packet, categorical verdict, privacy boundary, and representative fixture
are specified in [Ontology Construction Qualification v1](ONTOLOGY-CONSTRUCTION-QUALIFICATION.md).

For Atlas, the conservative direct-subsumption test is executable prose, not a reasoner claim: both
endpoints have the same `domain`/`capability`/`element` kind, every valid narrower example satisfies the
broader definition, the distinction is not synonymy or membership/part/dependency/sequence, and no known
accepted concept fits between them. The normative rule and current `broader` write boundary live in the
same [meta-model contract](ONTOLOGY-ATLAS-SPEC.md#22-direct-is_a--broader-test).

---

## 2. Agent memory & LLM × knowledge-graph (the live field, 2023–2026)

Our wedge — *"the AI agent forgets the codebase every session; this is git-native ontology memory it
maintains and queries"* — sits inside an active, recognized research lineage. We are **not** inventing
the category; we are taking a specific, opinionated position in it.

**The "LLM forgets; give it external memory" premise:**

- **MemGPT (Packer et al., 2023)** — "virtual context management": the model pages information between
  a fixed context window (fast memory) and external stores (slow memory) via self-issued function
  calls, simulating unbounded context. → We are the **codebase-specific, structured & human-readable
  version of MemGPT's "slow memory"**: the agent pages the repo's mental model in/out through a runtime-advertised MCP surface
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
  precisely what we offer an agent via focused MCP graph queries (`find_path`, `find_backlinks`, …)
  instead of
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
- **Edward Tufte, *The Visual Display of Quantitative Information*** — **graphical integrity**
  (representation proportional to the quantities) and **direct labelling** (a legend means the mark
  cannot explain itself). → Grounds honest, proportional rendering of relations so agent and developer
  read the *same true* model.
  ⚠️ **The data-ink ratio is cited here as an aesthetic, not as our judgment rule** — it has been
  tested and did not survive as one. Inbar, Tractinsky & Meyer (ECCE 2007) had 87 participants rate a
  standard bar graph against its Tufte-minimalist twin and found a clear preference for the
  non-minimalist version; Bateman et al. (CHI 2010) found embellished charts were described no less
  accurately than plain ones and were recalled *significantly better* after two to three weeks.
  Neither study touches graphical integrity, which is why that half stands. When a seat needs to
  reject a mark, the rule it must cite is Mackinlay's expressiveness, below — "this ink is not data"
  is an assertion those two papers can be pointed at, while "this mark encodes no typed fact" is not.
- **Jock D. Mackinlay, "Automating the Design of Graphical Presentations of Relational Information"
  (ACM TOG 5(2), 1986)** — **expressiveness** (a graphical language must encode the facts in the set,
  *and no additional facts*) and **effectiveness** (given several expressive encodings, prefer the one
  the human visual system reads best, ranking channels after Cleveland & McGill). → **This is the rule
  the design bench actually runs**, and it is what the 「도해」 seat's mark → typed-fact table is: a
  mark that maps to no fact fails expressiveness, and a mark that asserts a fact the data does not
  contain (a decorative rail implying a category) fails it in the other direction. Effectiveness is
  why `.claude/rules/design.md` sends bar identity to position/length/order/label rather than hue, and
  why hue-only separation is a defect rather than a preference.
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

1. **Agent-maintained** — the AI coding agent reads *and writes* the graph directly through the MCP server's runtime-advertised inventory,
   not a human-only ontology editor (Protégé) and not a machine-only fact generator (Glean/CodeQL).
2. **Git-native, markdown-IS-the-graph** — the frontmatter is the source of truth, reviewable as a
   diff, versioned by git, no backend / no DB. (Zep/Graphiti = graph DB; GraphRAG = generated store;
   mem0 = service. We = files in your repo.)
3. **Live topology as the surface** — the same graph is the *human comprehension surface*: you watch it
   grow as the agent edits, and you edit it back. (Mackinlay expressiveness + Linear's craft, applied to a KG.)
4. **Codebase-scoped meaning layer** — not conversation memory (Zep/mem0) and not structural code facts
   (tree-sitter/Glean), but the *why/owns/impacts* layer **on top of** structure, curated by developer +
   agent.
5. **Evidence-bound meaning receipts** — an agent can finalize five competency
   answers, but the receipt is provenance, not an oracle. Every fresh project
   brief rechecks the current graph, typed witnesses, and source receipt, and
   keeps structural readiness, competency coverage, and source currentness as
   separate categorical dimensions. This follows the same inspectability
   principle as the vault itself: no combined confidence percentage can hide a
   stale source or an unresolved witness.

**The honest framing:** *agent memory = a maintained knowledge graph* (Zep, Pan et al., the memory
survey all agree). We take the most **inspectable, lowest-infrastructure** position in that space — an
application-specific, graph-shaped meaning model that lives as Markdown in the repo, maintained by the
agent and judged by the human. It is informed by ontology engineering and Semantic Web standards
without claiming RDF/OWL/SKOS conformance. That is the thing to make excellent.

---

## References (public sources; initial set 2026-06-01, construction set 2026-08-09)

**Ontology theory & standards**
- Gruber, T. R. (1993). *A Translation Approach to Portable Ontology Specifications.* Knowledge Acquisition 5(2). DOI 10.1006/knac.1993.1008 · https://tomgruber.org/writing/ontolingua-kaj-1993.pdf — *peer-reviewed*
- Studer, R., Benjamins, V. R., & Fensel, D. (1998). *Knowledge Engineering: Principles and Methods.* Data & Knowledge Engineering 25(1-2). DOI 10.1016/S0169-023X(97)00056-6 — *peer-reviewed*
- Noy, N. F., & McGuinness, D. L. (2001). *Ontology Development 101.* Stanford KSL-01-05 / SMI-2001-0880 · https://protege.stanford.edu/publications/ontology_development/ontology101.pdf — *tech report*
- W3C (2014). *RDF 1.1 Concepts and Abstract Syntax.* https://www.w3.org/TR/rdf11-concepts/ — *W3C Recommendation*
- W3C (2026). *RDF 1.2 Concepts and Abstract Syntax.* https://www.w3.org/TR/rdf12-concepts/ — *Candidate Recommendation Snapshot, 2026-04-07; work in progress*
- W3C (2012). *OWL 2 Document Overview (2nd ed.).* https://www.w3.org/TR/owl2-overview/ — *W3C Recommendation*
- W3C (2009). *SKOS Reference.* https://www.w3.org/TR/skos-reference/ — *W3C Recommendation*
- Grüninger, M., & Fox, M. S. (1995). *Methodology for the Design and Evaluation of Ontologies.* IJCAI-95 Workshop on Basic Ontological Issues in Knowledge Sharing · https://eil.utoronto.ca/wp-content/uploads/enterprise-modelling/papers/gruninger-ijcai95.pdf — *peer-reviewed workshop paper*
- Grüninger, M., & Fox, M. S. (1995). *The Role of Competency Questions in Enterprise Engineering.* DOI 10.1007/978-0-387-34847-6_3 — *peer-reviewed book chapter*
- Guarino, N., & Welty, C. A. (2002). *Evaluating Ontological Decisions with OntoClean.* Communications of the ACM 45(2). DOI 10.1145/503124.503150 — *peer-reviewed*
- Duque-Ramos, A., Fernández-Breis, J. T., Stevens, R., & Aussenac-Gilles, N. (2011). *OQuaRE: A SQuaRE-based Approach for Evaluating the Quality of Ontologies.* JRPIT 43(2) · https://www.cs.man.ac.uk/~stevensr/papers/OQuareProof.pdf — *peer-reviewed*
- Poveda-Villalón, M., Gómez-Pérez, A., & Suárez-Figueroa, M. C. (2014). *OOPS! (OntOlogy Pitfall Scanner!): An On-line Tool for Ontology Evaluation.* IJSWIS 10(2). DOI 10.4018/IJSWIS.2014040102 — *peer-reviewed*
- Peroni, S. (2016). *A Simplified Agile Methodology for Ontology Development.* OWLED-ORE 2016 · https://www.w3.org/community/owled/files/2016/11/OWLED-ORE-2016_paper_6.pdf — *peer-reviewed workshop paper*
- Suárez-Figueroa, M. C., Gómez-Pérez, A., Motta, E., & Gangemi, A. (eds., 2012). *Ontology Engineering in a Networked World.* Springer · https://link.springer.com/book/10.1007/978-3-642-24794-1 — *peer-reviewed edited volume; NeOn methodology*
- Poveda-Villalón, M., Fernández-Izquierdo, A., Fernández-López, M., & García-Castro, R. (2022). *LOT: An industrial oriented ontology engineering framework.* Engineering Applications of Artificial Intelligence 111. DOI 10.1016/j.engappai.2022.104755 — *peer-reviewed, open access*
- W3C (2017). *Shapes Constraint Language (SHACL).* https://www.w3.org/TR/shacl/ — *W3C Recommendation*
- W3C (2026). *Shapes Constraint Language (SHACL) 1.2 Core.* https://www.w3.org/TR/shacl12-core/ — *Working Draft, 2026-08-03; work in progress*
- W3C (2013). *PROV-O: The PROV Ontology.* https://www.w3.org/TR/prov-o/ — *W3C Recommendation*

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
- Lippolis, A. S., et al. (2025). *Ontology Generation using Large Language Models.* arXiv:2503.05388 — *preprint; expert and structural evaluation*
- Mahlaza, Z., Keet, C. M., Chahinian, N., & Haydar, B. (2025). *On the Feasibility of LLM-based Automated Generation and Filtering of Competency Questions for Ontologies.* LDK 2025 · https://aclanthology.org/2025.ldk-1.15/ — *peer-reviewed*
- Huang, H., Chen, C., Sheng, Z., Li, Y., & Zhang, W. (2025). *Can LLMs be Good Graph Judge for Knowledge Graph Construction?* EMNLP 2025 · https://aclanthology.org/2025.emnlp-main.554/ — *peer-reviewed*
- Watkiss-Leek, E., et al. (2026). *IDEA2: Expert-in-the-loop competency question elicitation for collaborative ontology engineering.* arXiv:2604.01344 — *preprint; two real-world scenarios*

**Code knowledge graphs**
- Yamaguchi, F., Golde, N., Arp, D., & Rieck, K. (2014). *Modeling and Discovering Vulnerabilities with Code Property Graphs.* IEEE S&P. https://ieeexplore.ieee.org/document/6956589/ — *peer-reviewed*
- Meta Engineering (2024). *Indexing code at scale with Glean.* https://engineering.fb.com/2024/12/19/developer-tools/glean-open-source-code-indexing/ — *official blog / OSS*
- Sourcegraph (2022). *SCIP — Code Intelligence Protocol.* https://scip-code.org/ — *open protocol*
- GitHub. *About CodeQL.* https://codeql.github.com/docs/codeql-overview/about-codeql/ — *official docs*
- Brunsfeld, M., et al. *Tree-sitter.* https://tree-sitter.github.io/tree-sitter/ — *OSS docs*

**Design**
- Rams, D. *Ten Principles for Good Design.* Vitsœ. https://www.vitsoe.com/us/about/good-design — *public*
- Tufte, E. R. (1983/2001). *The Visual Display of Quantitative Information.* Graphics Press. https://www.edwardtufte.com/book/the-visual-display-of-quantitative-information/ — *book*
- Mackinlay, J. D. (1986). *Automating the design of graphical presentations of relational information.* ACM Transactions on Graphics 5(2), 110–141. https://dl.acm.org/doi/10.1145/22949.22950 — *peer-reviewed*
- Inbar, O., Tractinsky, N., & Meyer, J. (2007). *Minimalism in information visualization: attitudes towards maximizing the data-ink ratio.* ECCE 2007, 185–188. https://dl.acm.org/doi/10.1145/1362550.1362587 — *peer-reviewed* (data-ink preference did not replicate)
- Bateman, S., Mandryk, R. L., Gutwin, C., Genest, A., McDine, D., & Brooks, C. (2010). *Useful junk? The effects of visual embellishment on comprehension and memorability of charts.* CHI 2010, 2573–2582. https://dl.acm.org/doi/10.1145/1753326.1753716 — *peer-reviewed* (embellishment: equal accuracy, better long-term recall)
- Purchase, H. C. (1997). *Which aesthetic has the greatest effect on human understanding?* Graph Drawing 1997, LNCS 1353, 248–261. https://link.springer.com/chapter/10.1007/3-540-63938-1_67 — *peer-reviewed* (edge crossings dominate; angular resolution and orthogonality not significant)
- Wathan, A., & Schoger, S. (2018). *Refactoring UI.* https://www.refactoringui.com/ — *book*
- Maeda, J. (2006). *The Laws of Simplicity.* MIT Press. https://mitpress.mit.edu/9780262539470/the-laws-of-simplicity/ — *book*
- Saarinen, K. (2025). *Why is quality so rare?* Linear. https://linear.app/now/why-is-quality-so-rare — *public blog*
- Freiberg, R. *Craft.* https://rauno.me/craft — *public*
- Kowalski, E. *Great animations.* https://emilkowal.ski/ui/great-animations — *public*
- Vercel. *Geist — Introduction.* https://vercel.com/geist/introduction — *public docs*
- Radix UI. *Primitives — Introduction.* https://www.radix-ui.com/primitives/docs/overview/introduction — *public docs*
