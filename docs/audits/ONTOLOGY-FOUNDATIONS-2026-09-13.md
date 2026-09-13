# Ontology foundations and construction evidence — 13 September 2026

This is an initial audit and research snapshot, not a completed field trial.
Baseline: `9f1198f331d70ebc5e00be9e41eb4bd4ea57b417`, branch
`audit/ontology-foundations-2026-09`, Node 24.16.0, pnpm 10.18.0.
The connected MCP identified this checkout and its `docs/ontology` vault,
server version 0.13.0, with 38 tools. Installed-app behavior and host prompt
consumption were not measured. Sources were checked on 13 September 2026;
this does not claim coverage of the remainder of September or an exhaustive
literature review.

## Assessment

Atlas has a coherent basis for a lightweight codebase ontology: explicit
concept definitions, typed relationship claims, evidence, uncertainty, stable
identity, and human review. Its canonical contract explicitly distinguishes
that model from RDF serialization and OWL reasoning. Those are deliberate
expressiveness boundaries, not evidence that the product is a fake ontology.
The public authority remains [the specification, sections 2 and 5](../ONTOLOGY-ATLAS-SPEC.md).

The present evidence does **not** establish reliable construction on arbitrary
unfamiliar repositories. The graph is structurally clean, but meaning receipts
are behind source, a sampled domain description omits responsibilities that
its current members claim, and the small candidate benchmark cannot assess a
complete ontology. The next substantive work should measure and repair those
meaning failures, rather than increase node counts or add a reasoner without a
use case that requires it. This recommendation is an audit inference.

## What ontology means here

In knowledge engineering, an ontology makes the concepts, distinctions,
relationships, and constraints of a chosen subject explicit so that people and
software can use the vocabulary consistently. Gruber's author-hosted account
allows a range of expressive strength; OWL is one formal encoding, not the
definition of every ontology. A taxonomy emphasizes classification; a knowledge
graph records connected claims and may instantiate a vocabulary. These terms
overlap in practice, so evaluate the declared commitments rather than the name.
[Gruber, *Ontology*, 2009](https://tomgruber.org/writing/definition-of-ontology/).

An illustrative distinction: “payment depends on validation” needs a defined
payment capability, a defined validation responsibility, the direction and
meaning of dependency, supporting evidence, and a boundary on the impact being
claimed. An import can support a source dependency; by itself it does not prove
a business responsibility or every runtime consequence. This is an explanation
of Atlas's existing evidence boundary, not a proposed vault assertion.

Start with purpose and questions the ontology must answer, then choose the
necessary detail, reuse appropriate existing concepts, and iterate definitions
and relationships against those questions. This remains a useful foundation
from Noy and McGuinness's Stanford guide; it does not prescribe one universal
class hierarchy. [*Ontology Development 101*, 2001, especially sections 3–5](https://protege.stanford.edu/publications/ontology_development/ontology101.pdf).

## Public sources and reuse status

All sources below were publicly readable without an account. Public access is
not a blanket permission to copy or redistribute text, figures, data, or code.
This report summarizes and links; it imports no external article, figure,
dataset, or implementation. License labels describe the examined version, not
every associated artifact. Check each artifact's own license before reuse.

| Source and date/status | Contribution to this audit | Observed reuse boundary |
|---|---|---|
| [Gruber, *Ontology*](https://tomgruber.org/writing/definition-of-ontology/), 2009 encyclopedia entry on the author's site | Foundational definition and expressive spectrum | Public author text; no broad reuse license established here |
| [Noy and McGuinness, *Ontology Development 101*](https://protege.stanford.edu/publications/ontology_development/ontology101.pdf), 2001 Stanford guide | Purpose, competency questions, reuse, and class/instance distinctions | Public university PDF; no broad reuse license established here |
| [OWL 2 Overview](https://www.w3.org/TR/owl2-overview/), W3C Recommendation, 11 December 2012 | Formal classes, properties, individuals, and semantics | W3C document terms linked by that edition; no claim that Atlas implements it |
| [SKOS Reference](https://www.w3.org/TR/skos-reference/), W3C Recommendation, 18 August 2009 | Concept schemes and direct versus transitive broader relations | W3C document terms linked by that edition; SKOS is not interchangeable with OWL subclassing |
| [RDF 1.2 Concepts](https://www.w3.org/TR/2026/CR-rdf12-concepts-20260407/), Candidate Recommendation Snapshot, 7 April 2026 | Triple terms and statement-oriented representation are relevant to future provenance interoperability | Links the [W3C Software and Document License 2023](https://www.w3.org/copyright/software-license-2023/); retain required notices when reusing |
| [SHACL 1.2 Core](https://www.w3.org/TR/2026/WD-shacl12-core-20260828/), Working Draft, 28 August 2026 | Graph constraints remain separate from ontology entailment | Same permissive W3C license linked by the draft; not a final Recommendation |
| [Li, Garijo, Poveda-Villalón, systematic literature review](https://journals.sagepub.com/doi/10.1177/22104968261465514), journal article, 13 July 2026 | 36 papers / 49 task studies; heterogeneous evaluation and incomplete reproducibility | CC BY-NC 4.0; not unrestricted commercial redistribution |
| [Watkiss-Leek et al., IDEA2](https://arxiv.org/html/2604.01344v1), 1 April 2026 preprint | Expert review and revision of CQs with provenance | CC BY 4.0 on this version; attribution required; peer-review status not established here |
| [Alharbi et al., cross-domain CQ study](https://arxiv.org/html/2604.16258v1), 17 April 2026 preprint | Readability, relevance, complexity, diversity, and coverage vary by model/domain | CC BY 4.0 on this version; attribution required; peer-review status not established here |
| [Lippolis et al., *Large Language Models Assisting Ontology Evaluation*](https://arxiv.org/html/2507.14552v1), 19 July 2025 preprint with related publication DOI | 1,393 CQs and a 19-person study; wrong suggestions can reduce human accuracy | CC BY-NC-SA 4.0; noncommercial and share-alike conditions apply |
| [Lippolis et al., *Ontology Generation using Large Language Models*](https://arxiv.org/html/2503.05388v1), 7 March 2025 preprint | Useful generated OWL drafts still exhibit mistakes and variability | arXiv non-exclusive distribution license; no blanket downstream reuse permission |
| [Google AudioSet download documentation](https://research.google.com/audioset/download.html), undated live reference | Concrete company-published ontology with explicit reuse terms | Ontology CC BY-SA 4.0; dataset CC BY 4.0; these are different artifacts |
| [Palantir, *The Ontology system*](https://www.palantir.com/docs/foundry/architecture-center/ontology-system), undated live reference | Company-specific operational model connects decisions, data, logic, and actions | Public product documentation; no broad reuse license established here; not a neutral ontology standard |

The two April 2026 CC BY papers and the W3C draft documents provide the clearest
explicit permissions in the research set for reuse under their stated terms.
The foundational author/university texts and vendor documentation remain useful
references without treating their public availability as a permissive license.

## What is current in 2026

The July 2026 systematic review covers peer-reviewed papers published through
**May 2025**. Its publication date must not be mistaken for a September 2026
research cutoff. It reports uneven task definitions, datasets, metrics, and
released evaluation protocols, supporting separate judgments of construction,
evaluation, and maintenance. [Review, introduction and abstract](https://journals.sagepub.com/doi/10.1177/22104968261465514).

The April 2026 studies add recent work on the quality of the requirements
themselves: IDEA2 retains expert feedback and CQ revision history, while the
cross-domain study measures multiple properties of generated questions. Neither
demonstrates Atlas quality. Their implication for Atlas is to freeze useful
questions before judging a candidate, preserve revisions and disagreements,
and test domain diversity instead of treating fluent generated questions as
correct requirements. [IDEA2](https://arxiv.org/html/2604.01344v1),
[cross-domain study](https://arxiv.org/html/2604.16258v1).

RDF 1.2 Concepts is still a Candidate Recommendation Snapshot and SHACL 1.2 Core
is still a Working Draft in the retrieved versions. RDF triple terms may help
represent statements about statements; this is relevant to evidence/provenance,
but is not an automatic truth or trust mechanism. These developments extend
representation and validation rather than replace the basic meaning of
ontology. [RDF snapshot](https://www.w3.org/TR/2026/CR-rdf12-concepts-20260407/),
[SHACL draft](https://www.w3.org/TR/2026/WD-shacl12-core-20260828/).

## System prompt inspection

The [architecture inventory](../ARCHITECTURE.md#agent-instruction-ownership)
names four instruction channels and their source wiring. The vault conversation
prompt requires definitions, boundaries, relation reasons, read-before-propose,
mtime protection, uncertainty, and proposal review. It forbids source-backed
competency-answer authoring by the vault-only agent. The local Compile prompt
instead governs document-to-wiki proposals; ACP augments a coding agent; MCP
publishes instructions to a host.

Observed limits:

- The in-app conversation supports an optional owner-text argument, but the
  current panel passes `null`. A named instructions file in the prompt is not
  evidence of a functioning loader.
- MCP initialization delivery does not prove that every host places the text in
  a system message. The old source comment overstated that guarantee and was
  corrected. Host support and model compliance need their own runtime evidence.
  [MCP project guidance](https://blog.modelcontextprotocol.io/posts/2025-11-03-using-server-instructions/)
  explicitly distinguishes instructions from deterministic enforcement.
- The shared meta-model and construction guidance passed 40 existing contract
  tests in two files. This establishes those tested source contracts, including
  prompt parity; it is not a live model-compliance evaluation.

## Live vault and evaluator baseline

Read-only `validate_vault` scanned 104 Markdown files and found no schema or
reference problems. Of these, the compiled graph contains 103 nodes, including
the reserved README node. All 250 compiled relation declarations resolve;
these are not a deduplicated count of the app's rendered edges. There are no
dependency cycles. All 94 checked frontmatter source paths exist.

`health` is `needs_attention`: the project meaning assessment is
`review_required (source_changed)`. All 132 recorded witness paths still
resolve at the baseline commit. This is an outdated measurement receipt,
not evidence of 132 broken paths. Reconnecting source and finalizing a receipt
cannot substitute for rejudging the meaning.

Summary freshness nominates four domains for inspection: design-system,
project-portfolio, local-vault-management, and onboarding-and-shell. A timestamp
signal alone does not prove their prose wrong. Full-body reads of
`domains/project-portfolio` and `capabilities/construction-review` exposed one
specific gap: the parent definition/inclusions cover listing, viewing, editing,
and sharing, while the current child describes construction qualification and
source-hidden review. Parent relation notes describe that responsibility, but
the parent body does not. Its confidence section explicitly admits indirect,
mainly folder-based evidence. This supports a focused parent-body review, not
an automatic domain split. The other three bodies remain unassessed here.

`pnpm eval:meaning-extraction` passed three fixtures, matching 13 of 13 expected
candidate concepts. Its actual candidate representation contains slug, evidence,
and fixed confidence, with no definitions and an empty competency-answer map.
`scripts/evaluate-meaning-corpus.mjs` sets candidate definition, citation-recall,
and competency-coverage thresholds to zero. The oracle constructs a proposal
from golden expected data. Therefore neither result measures independent
ontology construction. This is a coverage limitation, not proof that the
separate qualified construction workflow fails.

Reproduce with `node scripts/evaluate-meaning-corpus.mjs --json`; inspect
`candidateCoverage.metrics`, `thresholds`, and `oracleContract` separately.
The existing [31 August metric correction](../benchmark/FINDINGS-2026-08-31-metric-split.md)
also explains why Atlas-only vocabulary scores cannot establish a fair quality
advantage. It was read as historical evidence and was not rerun in this audit.

## Improvements made and remaining proof

This branch corrects the SHACL draft date, removes the MCP comment's universal
system-prompt guarantee, documents instruction ownership and the unconnected
owner-instructions argument, and exposes the candidate/oracle evaluation limit
in [the quality authority map](../ONTOLOGY-QUALITY.md). It also corrects that
map's obsolete instruction to edit the frozen decision ledger. No ontology
definition, accepted relation, writer, prompt body, or evaluation threshold was
changed. The standing 9 August meta-model decision remains in force; its
source-hidden falsifier was not exercised here.

Recommended next probes, with separate outcomes:

1. **Domain meaning maintenance:** read each flagged parent and its actual
   members, verify source-backed responsibility claims, and prepare exact body
   corrections. Preserve UID and classify ambiguity explicitly. Pass only when
   the owner can explain every included responsibility and its exclusion.
2. **Construction quality:** use the existing field-trial protocol on a fresh,
   unfamiliar, permissively licensed repository outside this checkout. Freeze
   owner-reviewed scope, responsibility, capability, evidence, impact, and
   omitted-behavior questions before construction. Keep builder, source-hidden
   evaluator, and source-aware citation auditor distinct. Measure candidate and
   persisted-vault answers separately, including negative cases and deliberate
   claim/evidence mutations. No such trial was run in this initial audit.
3. **Maintenance and transfer:** after a controlled source change, test whether
   stale claims remain visible, an exact correction preserves unaffected
   meaning, and a successor with only the accepted vault can explain the result.
4. **Prompt effectiveness:** capture actual model inputs for each supported
   runtime and test unsupported inference, duplicate proposals, source access,
   and conflicting document instructions. Source wiring and prompt text alone
   do not settle these behaviors.

These are proposed measurements, not newly imposed gates or completed results.
General construction reliability remains unproven until those bounded trials
provide evidence. A useful lightweight ontology is feasible in this architecture;
claiming uniformly correct autonomous construction is not justified by this audit.

## Product pass

Actor/moment: the owner judging whether a clean graph and successful evaluation
actually establish durable codebase understanding. Outcome: `judge`.
Evidence: observed source wiring, live health, and candidate evaluation output.
Change: `rollback-cheap`; truth, transfer, agent-write, and human-correction
boundaries all unchanged. Router: two-way, solo, no risk reviewers.
Prior: 9 August 2026 meta-model boundary decision, retained.
Recovery proof: from the authority map and this dated audit, a reviewer can
locate each prompt owner and distinguish candidate retrieval, structural
validation, semantic currentness, and unmeasured construction; fail if a PASS or
prompt's existence is presented as semantic reliability. The document/source
cross-check is complete; independent human comprehension is not measured.
