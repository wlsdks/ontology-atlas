import { CONSTRUCTION_QUALIFICATION_INPUT_SCHEMA } from '../../construction-qualification.mjs';
import { IGNORE_ARRAY_MAX_ITEMS } from '../tool-schemas/array-limits.mjs';
import { NON_BLANK_STRING_SCHEMA } from '../tool-schemas/field-primitives.mjs';
import {
  EXTRACTION_CONTRACT_OUTPUT_SCHEMA,
  MEANING_PROPOSAL_INPUT_SCHEMA,
  MEANING_PROPOSAL_VALIDATION_OUTPUT_SCHEMA,
} from '../tool-schemas/meaning-construction.mjs';
import {
  PROPOSED_BUSINESS_CONCEPT_ROW_SCHEMA,
  RUST_FEATURE_CONFIGURATION_EVIDENCE_OUTPUT_SCHEMA,
  SEMANTIC_EVIDENCE_ROW_SCHEMA,
} from '../tool-schemas/repository-evidence.mjs';

export const ANALYZE_REPO_STRUCTURE_TOOL = {
  name: 'analyze_repo_structure',
  description:
    'R16 (autonomous ingest base) — analyze a code repository and propose ontology node candidates. ' +
    'side effect 0 (vault frontmatter NOT modified). Returns deterministic candidates the agent ' +
    'must turn into an evidence-backed proposal and move through the construction lifecycle before ' +
    'any exact batch-writer rows are released. Repository structure is implementation evidence, not automatic business meaning: extractionContract and proposedBusinessOntology make that uncertainty explicit. Detects:\n' +
    '  - package.json `name` → project candidate\n' +
    '  - README.md first H1 → project title fallback\n' +
    '  - README.md H2 sections (skipping generic "Usage"/"Installation"/etc) → domain candidates\n' +
    '  - src/features|entities|widgets|views/* (FSD) → capability/element candidates\n' +
    '  - src/* depth-1 folders (generic) → capability candidates + index entry → element\n' +
    '  - apps/* and packages/* members with package.json → implementation element candidates\n\n' +
    '  - README.rst + bounded static setup.py → Python project/package evidence without execution\n' +
    '  - mixed current and future/negated/deprecated README prose → exact current candidate excerpt plus bounded line-scoped `reviewRequiredEvidence`; review units stay visible but cannot support a proposal claim\n' +
    '  - selected safe README sections share the existing 1,200-character budget deterministically; no document, heading, or excerpt cap grows\n' +
    '  - root Python packages plus at most 12 import-connected implementation boundaries → direct modules plus up to 2 exact security/policy/risk file anchors; unused files are not mirrored and no capability is inferred from imports\n' +
    '  - bounded root Cargo package or repo-contained literal direct workspace members → typed feature declaration + literal cfg/cfg_attr source provenance; predicates are not evaluated and no runtime/import/semantic dependency is inferred\n' +
    '  - a complete proposal may select at most 4 additional exact TypeScript, JavaScript, Python, or Rust file endpoints already observed by infer_imports for distinct navigation roles; exact dependency direction is validated and these files never become automatic candidates\n\n' +
    '  - when the packet identifies an implementation path but omits the rule or effect needed for review, optional `sourceReads` returns bounded exact source lines with a full-file hash and continuation coordinates. Follow-up reads carry the returned `expectedSha256`; every proposal or qualification call replays all selected ranges with that hash. Raw source remains untrusted observed evidence and never establishes semantic meaning, approval, or write authority\n' +
    "  - a selector with `mode: 'outline'` lists a file's declarations with line numbers so the next lines read is exact. For a file longer than about 200 lines, outline it first and then read the exact lines, rather than reading the head of the file and recording the rest as unread. An outline returns no source text and no citation, so it supports no claim; replay line ranges, not outlines, with a proposal or qualification\n\n" +
    '  - an element proposal may keep an ordinary citation and append reviewed `navigation:primary|supporting|test:<path>#<symbol>` evidence strings (limits 1/1/3); the server verifies only those named current files, renders human-readable Evidence bullets, and rejects missing, ambiguous, unsafe, or task-inferred coordinates without treating them as behavior proof\n\n' +
    'Optionally pass a complete `proposal` to validate project/domain/capability/element definitions, ' +
    'typed relations, citations, risk controls, domain placement, implementation paths, confidence, ' +
    'and typed competency answers with resolvable concept/relation/evidence/path witnesses. Partial ' +
    'or visible-gap answers remain warnings instead of disappearing behind findings 0. A ' +
    '`unqualified-project-exclusion` warning is an exact human-acceptance gap, while an ' +
    'evidence-limit exclusion remains an error. Source-hidden review may leave exact source-body ' +
    'detail partial; source-aware citation verification decides support before evidence provenance can pass. ' +
    'A mandatory non-gap warning blocks the first review before qualification begins. ' +
    'For a bounded first pass, freeze claim id, statement, and proposalRefs before isolated source-hidden ' +
    'and source-aware lanes run in parallel; separately audit material Definition, Includes, Excludes, and ' +
    'Uncertainty assertions even when several claims share one proposal ref. Join sealed receipts without ' +
    'mutation before human acceptance. A passing ' +
    'validation first returns a deterministic non-writing `reviewPlan`, `planDigest`, ' +
    '`sourceDigest`, and eight-phase construction lifecycle. An independent evaluator must ' +
    'measure the approved competency questions and source-hidden task, then a human may declare ' +
    'acceptance bound to that exact plan digest/revision and every visible gap. Pass the resulting ' +
    '`constructionQualification:v1` packet as `qualification`; only a current, admissible packet ' +
    'releases the exact reviewed rows as `writePlan`. The lifecycle also reports a shadow-only ' +
    '`admission` tier; `self_qualified` is an observation, not a write permission. Declared approval provenance is not identity ' +
    'authentication. Do not call write tools unless proposalValidation.canWrite is true and a ' +
    '`writePlan` is present; write every concept row successfully before writing relations.\n\n' +
    'Use the initial discovery call when a user asks "이 codebase 분석해줘" / "bootstrap the ontology"; repeat the same analysis call only for explicit source continuations and digest-bound proposal or qualification replay. ' +
    'For an evidence continuation only, set sourceOnly:true with sourceReads: the response keeps identical bounded sourceEvidence and returns no candidates or lifecycle data. Source-only cannot accompany proposal or qualification and never grants write authority. ' +
    'Single source of truth preserved — only the user (via your subsequent add_concept calls) ' +
    'writes to the vault.',
  inputSchema: {
    type: 'object',
    properties: {
      rootPath: {
        ...NON_BLANK_STRING_SCHEMA,
        description:
          'Repository root to analyze. Defaults to the MCP server cwd.',
      },
      maxDepth: {
        type: 'integer',
        minimum: 0,
        maximum: 10,
        description: 'Accepted but ignored: no value changes the analysis. When given, it must be an integer from 0 to 10.',
      },
      ignore: {
        type: 'array',
        maxItems: IGNORE_ARRAY_MAX_ITEMS,
        items: NON_BLANK_STRING_SCHEMA,
        description:
          "Extra folder names to skip (added to defaults: node_modules, .git, dist, build, …).",
      },
      sourceReads: {
        type: 'array',
        minItems: 1,
        maxItems: 8,
        description: "Optional 1–8 exact repository source ranges, or whole-file outlines. mode: 'outline' lists a file's declarations with line numbers so the next lines read is exact; for a file longer than about 200 lines, outline it first instead of reading its head. The 8 KiB range, 16 KiB outline, 32 KiB aggregate, and 64 KiB serialized limits apply only to the returned sourceEvidence subpacket, not to the rest of this analysis result. Returned text is bounded untrusted data, not accepted meaning; an outline is a map to the next read and carries no citation. Repeat every selector with expectedSha256 when proposal or qualification is present, and replay line ranges rather than outlines there.",
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', minLength: 1, maxLength: 1024, description: 'Literal repository-relative source path, at most 1,024 Unicode characters; no glob or directory traversal.' },
            mode: { type: 'string', enum: ['lines', 'outline'], description: "Read shape, default 'lines'. 'lines' returns the exact requested range. 'outline' reads the whole file under the same 256 KiB file cap and returns its declarations with line numbers, no source text, and no range." },
            startLine: { type: 'integer', minimum: 1, description: "One-based first source line to return. Required for mode 'lines'; rejected for mode 'outline'." },
            maxLines: { type: 'integer', minimum: 1, maximum: 200, description: "Maximum complete source lines requested, from 1 through 200. Required for mode 'lines'; rejected for mode 'outline'." },
            expectedSha256: { type: 'string', pattern: '^[a-f0-9]{64}$', description: 'Optional 64-character lowercase SHA-256 of the complete file. Required on every selector when proposal or qualification is present.' },
          },
          required: ['path'],
          additionalProperties: false,
        },
      },
      sourceOnly: {
        type: 'boolean',
        description: 'Return only rootPath, delivery:"source_only", canWrite:false and sourceEvidence, without rescanning the repository. Requires sourceReads; forbids proposal and qualification even when null. Default false keeps full analysis and lifecycle behavior.',
      },
      proposal: {
        ...MEANING_PROPOSAL_INPUT_SCHEMA,
        description:
          'Optional business ontology proposal to validate against repository evidence before any write call. Python proposals may select at most 4 exact observed import endpoints beyond the analyzer candidates.',
      },
      qualification: {
        ...CONSTRUCTION_QUALIFICATION_INPUT_SCHEMA,
        description:
          'Optional independent evaluation and declared human acceptance bound to the exact planDigest, planRevision, and sourceDigest returned for this proposal. Omit it on the first review call.',
      },
    },
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      rootPath: NON_BLANK_STRING_SCHEMA,
      delivery: { type: 'string', const: 'source_only' },
      canWrite: { type: 'boolean', const: false },
      framework: {
        type: 'string',
        enum: ['fsd', 'next', 'generic'],
      },
      project: {
        type: 'object',
        properties: {
          slug: NON_BLANK_STRING_SCHEMA,
          title: NON_BLANK_STRING_SCHEMA,
          definition: { type: 'string', minLength: 1, maxLength: 1200 },
          evidence: { type: 'array', maxItems: 6, items: NON_BLANK_STRING_SCHEMA },
          includes: { type: 'array', maxItems: 12, items: NON_BLANK_STRING_SCHEMA },
          excludes: { type: 'array', maxItems: 12, items: NON_BLANK_STRING_SCHEMA },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          uncertainty: NON_BLANK_STRING_SCHEMA,
        },
        required: ['slug', 'title'],
        additionalProperties: false,
      },
      domains: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            slug: NON_BLANK_STRING_SCHEMA,
            title: NON_BLANK_STRING_SCHEMA,
            evidence: {
              type: 'object',
              properties: {
                source: NON_BLANK_STRING_SCHEMA,
                line: { type: 'integer', minimum: 1 },
              },
              required: ['source'],
              additionalProperties: false,
            },
          },
          required: ['slug', 'title', 'evidence'],
          additionalProperties: false,
        },
      },
      capabilities: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            slug: NON_BLANK_STRING_SCHEMA,
            title: NON_BLANK_STRING_SCHEMA,
            domain: { type: 'string' },
            evidence: {
              type: 'object',
              properties: {
                source: NON_BLANK_STRING_SCHEMA,
              },
              required: ['source'],
              additionalProperties: false,
            },
          },
          required: ['slug', 'title', 'evidence'],
          additionalProperties: false,
        },
      },
      elements: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            slug: NON_BLANK_STRING_SCHEMA,
            title: NON_BLANK_STRING_SCHEMA,
            domain: { type: 'string' },
            path: NON_BLANK_STRING_SCHEMA,
            evidence: {
              type: 'object',
              properties: {
                source: NON_BLANK_STRING_SCHEMA,
              },
              required: ['source'],
              additionalProperties: false,
            },
          },
          required: ['slug', 'title', 'path', 'evidence'],
          additionalProperties: false,
        },
      },
      suggestedRelations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            from: NON_BLANK_STRING_SCHEMA,
            to: NON_BLANK_STRING_SCHEMA,
            type: NON_BLANK_STRING_SCHEMA,
            why: { type: 'string', minLength: 1, maxLength: 600 },
            evidence: { type: 'array', maxItems: 4, items: NON_BLANK_STRING_SCHEMA },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            uncertainty: NON_BLANK_STRING_SCHEMA,
          },
          required: ['from', 'to', 'type'],
          additionalProperties: false,
        },
      },
      meaningGate: {
        type: 'object',
        properties: {
          policy: NON_BLANK_STRING_SCHEMA,
          sourceStructureRole: NON_BLANK_STRING_SCHEMA,
          businessOntology: {
            type: 'object',
            properties: {
              domains: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
              capabilities: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
              evidence: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    slug: NON_BLANK_STRING_SCHEMA,
                    kind: {
                      type: 'string',
                      enum: ['domain', 'capability'],
                    },
                    source: NON_BLANK_STRING_SCHEMA,
                  },
                  required: ['slug', 'kind', 'source'],
                  additionalProperties: false,
                },
              },
            },
            required: ['domains', 'capabilities', 'evidence'],
            additionalProperties: false,
          },
          proposedBusinessOntology: {
            type: 'object',
            properties: {
              domains: {
                type: 'array',
                items: PROPOSED_BUSINESS_CONCEPT_ROW_SCHEMA,
              },
              capabilities: {
                type: 'array',
                items: PROPOSED_BUSINESS_CONCEPT_ROW_SCHEMA,
              },
            },
            required: ['domains', 'capabilities'],
            additionalProperties: false,
          },
          implementationEvidence: {
            type: 'object',
            properties: {
              elements: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
              reviewRequiredCapabilities: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    slug: NON_BLANK_STRING_SCHEMA,
                    reason: NON_BLANK_STRING_SCHEMA,
                    evidence: {
                      type: 'object',
                      properties: {
                        source: NON_BLANK_STRING_SCHEMA,
                      },
                      required: ['source'],
                      additionalProperties: false,
                    },
                  },
                  required: ['slug', 'reason', 'evidence'],
                  additionalProperties: false,
                },
              },
            },
            required: ['elements', 'reviewRequiredCapabilities'],
            additionalProperties: false,
          },
          reviewQuestions: {
            type: 'array',
            items: NON_BLANK_STRING_SCHEMA,
          },
        },
        required: [
          'policy',
          'sourceStructureRole',
          'businessOntology',
          'proposedBusinessOntology',
          'implementationEvidence',
          'reviewQuestions',
        ],
        additionalProperties: false,
      },
      extractionContract: EXTRACTION_CONTRACT_OUTPUT_SCHEMA,
      semanticEvidence: {
        type: 'array',
        items: SEMANTIC_EVIDENCE_ROW_SCHEMA,
      },
      configurationEvidence: RUST_FEATURE_CONFIGURATION_EVIDENCE_OUTPUT_SCHEMA,
      sourceEvidence: {
        type: 'object',
        description: 'Bounded sourceEvidence:v1 subpacket. Its byte and row ceilings cover this subpacket only; they do not describe or truncate the complete analyze_repo_structure response.',
        properties: {
          contract: { type: 'string', enum: ['sourceEvidence:v1'] },
          trust: { type: 'string', enum: ['untrusted-source-data'] },
          limits: { type: 'object', additionalProperties: { type: 'integer', minimum: 1 } },
          coverage: { type: 'string', enum: ['requested-ranges-only'] },
          repositoryComplete: { type: 'boolean', enum: [false] },
          rows: {
            type: 'array', minItems: 1, maxItems: 8,
            items: {
              type: 'object',
              properties: {
                status: { type: 'string', enum: ['read', 'outlined', 'refused', 'omitted'] }, path: NON_BLANK_STRING_SCHEMA,
                mode: { type: 'string', enum: ['outline'] },
                sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
                language: NON_BLANK_STRING_SCHEMA,
                declarationCount: { type: 'integer', minimum: 0 },
                declarations: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      line: { type: 'integer', minimum: 1 },
                      kind: { type: 'string', enum: ['function', 'method', 'class', 'type', 'interface', 'struct', 'enum', 'const', 'export', 'section'] },
                      name: NON_BLANK_STRING_SCHEMA,
                      signature: { type: 'string' },
                    },
                    required: ['line', 'kind', 'name', 'signature'], additionalProperties: false,
                  },
                },
                fullFileSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' }, fileBytes: { type: 'integer', minimum: 0 }, fileLines: { type: 'integer', minimum: 0 },
                requestedRange: { anyOf: [{ type: 'null' }, { type: 'object', properties: { startLine: { type: 'integer', minimum: 1 }, maxLines: { type: 'integer', minimum: 1, maximum: 200 } }, required: ['startLine', 'maxLines'], additionalProperties: false }] },
                actualRange: { type: 'object', properties: { startLine: { type: 'integer', minimum: 1 }, endLine: { type: 'integer', minimum: 1 } }, required: ['startLine', 'endLine'], additionalProperties: false },
                text: { type: 'string' }, returnedBytes: { type: 'integer', minimum: 0 }, truncated: { type: 'boolean' }, requestComplete: { type: 'boolean' }, fileComplete: { type: 'boolean' }, citation: NON_BLANK_STRING_SCHEMA, reason: NON_BLANK_STRING_SCHEMA,
                next: { anyOf: [{ type: 'null' }, { type: 'object', properties: { path: NON_BLANK_STRING_SCHEMA, startLine: { type: 'integer', minimum: 1 }, maxLines: { type: 'integer', minimum: 1, maximum: 200 }, expectedSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' } }, required: ['path', 'startLine', 'maxLines', 'expectedSha256'], additionalProperties: false }] },
              },
              required: ['status', 'path', 'requestedRange', 'requestComplete', 'next'], additionalProperties: false,
              oneOf: [
                {
                  properties: { status: { const: 'read' } },
                  required: ['actualRange', 'text', 'citation', 'fullFileSha256', 'fileBytes', 'fileLines', 'returnedBytes', 'truncated', 'fileComplete'],
                },
                {
                  properties: { status: { const: 'outlined' } },
                  required: ['mode', 'sha256', 'language', 'declarationCount', 'declarations', 'fileBytes', 'fileLines', 'returnedBytes', 'truncated'],
                  not: { anyOf: [{ required: ['text'] }, { required: ['citation'] }] },
                },
                {
                  properties: { status: { enum: ['refused', 'omitted'] } },
                  required: ['reason'],
                  not: { anyOf: [{ required: ['text'] }, { required: ['citation'] }] },
                },
              ],
            },
          },
          totalReturnedBytes: { type: 'integer', minimum: 0, maximum: 32768 }, serializedBytes: { type: 'integer', minimum: 0, maximum: 65536 },
        },
        required: ['contract', 'trust', 'limits', 'coverage', 'repositoryComplete', 'rows', 'totalReturnedBytes', 'serializedBytes'], additionalProperties: false,
      },
      proposalValidation: MEANING_PROPOSAL_VALIDATION_OUTPUT_SCHEMA,
      skipped: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: NON_BLANK_STRING_SCHEMA,
            reason: NON_BLANK_STRING_SCHEMA,
          },
          required: ['path', 'reason'],
          additionalProperties: false,
        },
      },
    },
    required: ['rootPath'],
    oneOf: [
      {
        required: ['delivery', 'canWrite', 'sourceEvidence'],
        not: { anyOf: ['project', 'framework', 'domains', 'capabilities', 'elements',
          'meaningGate', 'extractionContract', 'semanticEvidence', 'configurationEvidence',
          'proposalValidation', 'suggestedRelations', 'skipped'].map((key) => ({ required: [key] })) },
      },
      {
        required: ['framework', 'domains', 'capabilities', 'elements', 'meaningGate',
          'extractionContract', 'semanticEvidence', 'configurationEvidence',
          'proposalValidation', 'suggestedRelations', 'skipped'],
        not: { anyOf: [{ required: ['delivery'] }, { required: ['canWrite'] }] },
      },
    ],
    additionalProperties: false,
  },
};
