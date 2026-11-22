import {
  MEANING_GATE_EVIDENCE_ROW_LIMIT,
  MEANING_GATE_REVIEW_ROW_LIMIT,
} from '../tool-schemas/array-limits.mjs';
import { NON_BLANK_STRING_SCHEMA } from '../tool-schemas/field-primitives.mjs';
import { EXTRACTION_CONTRACT_OUTPUT_SCHEMA } from '../tool-schemas/meaning-construction.mjs';
import {
  BUSINESS_EVIDENCE_ROW_SCHEMA,
  IMPORT_RECONCILIATION_SUMMARY_SCHEMA,
  IMPORT_SCAN_COVERAGE_OUTPUT_SCHEMA,
  IMPORT_STALE_EDGE_FOLLOW_UP_SCHEMA,
  PROPOSED_BUSINESS_CONCEPT_ROW_SCHEMA,
  REVIEW_REQUIRED_CAPABILITY_ROW_SCHEMA,
  RUST_FEATURE_CONFIGURATION_EVIDENCE_OUTPUT_SCHEMA,
  SEMANTIC_EVIDENCE_ROW_SCHEMA,
} from '../tool-schemas/repository-evidence.mjs';

export const INDEX_PROJECT_TOOL = {
  name: 'index_project',
  description:
    'Build a read-only ontology indexing plan for a large or existing project: analyze_repo_structure + infer_imports + validate_vault in one call, as a resumable checkpoint before writing. side effect 0. Candidates are split into existing, ambiguous-alias and new, with exact reviewCalls. Write reviewed concepts with add_concepts; inferred imports are never auto-promoted to depends_on.',
  inputSchema: {
    type: 'object',
    properties: {
      rootPath: {
        ...NON_BLANK_STRING_SCHEMA,
        description: 'Defaults to the active repository root.',
      },
      maxDepth: {
        type: 'integer',
        minimum: 0,
        maximum: 10,
        description: 'Accepted and ignored.',
      },
      maxFiles: {
        type: 'integer',
        minimum: 1,
        maximum: 50000,
        description: 'infer_imports file cap, default 5000.',
      },
      threshold: {
        type: 'integer',
        minimum: 1,
        description: 'Minimum module-edge count for the import plan.',
      },
      skipImports: {
        type: 'boolean',
        description: 'Skip infer_imports.',
      },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['plan'] },
      sideEffect: { type: 'integer', enum: [0] },
      rootPath: NON_BLANK_STRING_SCHEMA,
      vaultRoot: NON_BLANK_STRING_SCHEMA,
      analyze: {
        type: 'object',
        properties: {
          framework: { type: 'string', enum: ['fsd', 'next', 'generic'] },
          project: { type: ['object', 'null'] },
          domains: { type: 'integer', minimum: 0 },
          capabilities: { type: 'integer', minimum: 0 },
          elements: { type: 'integer', minimum: 0 },
          suggestedRelations: { type: 'integer', minimum: 0 },
        },
        required: ['framework', 'project', 'domains', 'capabilities', 'elements', 'suggestedRelations'],
        additionalProperties: false,
      },
      imports: {
        type: ['object', 'null'],
        properties: {
          filesScanned: { type: 'integer', minimum: 0 },
          moduleEdges: { type: 'integer', minimum: 0 },
          packageImports: { type: 'integer', minimum: 0 },
          packageModuleEdges: { type: 'integer', minimum: 0 },
          coverage: IMPORT_SCAN_COVERAGE_OUTPUT_SCHEMA,
          thresholdApplied: {
            type: 'object',
            properties: {
              threshold: { type: 'integer', minimum: 1 },
              filteredOut: { type: 'integer', minimum: 0 },
            },
            required: ['threshold', 'filteredOut'],
            additionalProperties: false,
          },
          reconciliationSummary: IMPORT_RECONCILIATION_SUMMARY_SCHEMA,
          staleEdgeFollowUp: IMPORT_STALE_EDGE_FOLLOW_UP_SCHEMA,
        },
        required: ['filesScanned', 'moduleEdges', 'packageImports', 'packageModuleEdges', 'coverage'],
        additionalProperties: false,
      },
      plan: {
        type: 'object',
        properties: {
          concepts: { type: 'integer', minimum: 0 },
          conceptDelta: {
            type: 'object',
            properties: {
              candidates: { type: 'integer', minimum: 0 },
              existing: { type: 'integer', minimum: 0 },
              ambiguous: { type: 'integer', minimum: 0 },
              new: { type: 'integer', minimum: 0 },
              limited: { type: 'boolean' },
              sampleAmbiguousSlugs: {
                type: 'array',
                maxItems: 10,
                items: NON_BLANK_STRING_SCHEMA,
              },
              sampleNewSlugs: {
                type: 'array',
                maxItems: 10,
                items: NON_BLANK_STRING_SCHEMA,
              },
            },
            required: [
              'candidates',
              'existing',
              'ambiguous',
              'new',
              'limited',
              'sampleAmbiguousSlugs',
              'sampleNewSlugs',
            ],
            additionalProperties: false,
          },
          suggestedRelations: { type: 'integer', minimum: 0 },
          importRelations: { type: 'integer', minimum: 0 },
          phases: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
        },
        required: ['concepts', 'conceptDelta', 'suggestedRelations', 'importRelations', 'phases'],
        additionalProperties: false,
      },
      validation: {
        type: 'object',
        properties: {
          scanned: { type: 'integer', minimum: 0 },
          problemFiles: { type: 'integer', minimum: 0 },
          errorFiles: { type: 'integer', minimum: 0 },
          warningFiles: { type: 'integer', minimum: 0 },
          pathDrift: { type: 'integer', minimum: 0 },
          appliesToAnalyzedProject: { type: 'boolean' },
          alignment: {
            type: 'string',
            enum: ['matching-project', 'uninitialized-vault', 'mismatched-project', 'unknown'],
          },
          note: NON_BLANK_STRING_SCHEMA,
        },
        required: [
          'scanned',
          'problemFiles',
          'errorFiles',
          'warningFiles',
          'pathDrift',
          'appliesToAnalyzedProject',
          'alignment',
          'note',
        ],
        additionalProperties: false,
      },
      meaningGate: {
        type: 'object',
        properties: {
          policy: NON_BLANK_STRING_SCHEMA,
          sourceStructureRole: NON_BLANK_STRING_SCHEMA,
          businessOntology: {
            type: 'object',
            properties: {
              domains: { type: 'integer', minimum: 0 },
              capabilities: { type: 'integer', minimum: 0 },
              evidence: { type: 'integer', minimum: 0 },
              evidenceRows: {
                type: 'array',
                maxItems: MEANING_GATE_EVIDENCE_ROW_LIMIT,
                items: BUSINESS_EVIDENCE_ROW_SCHEMA,
              },
            },
            required: ['domains', 'capabilities', 'evidence', 'evidenceRows'],
            additionalProperties: false,
          },
          proposedBusinessOntology: {
            type: 'object',
            properties: {
              domains: { type: 'integer', minimum: 0 },
              capabilities: { type: 'integer', minimum: 0 },
              domainRows: {
                type: 'array',
                maxItems: MEANING_GATE_REVIEW_ROW_LIMIT,
                items: PROPOSED_BUSINESS_CONCEPT_ROW_SCHEMA,
              },
              capabilityRows: {
                type: 'array',
                maxItems: MEANING_GATE_REVIEW_ROW_LIMIT,
                items: PROPOSED_BUSINESS_CONCEPT_ROW_SCHEMA,
              },
            },
            required: ['domains', 'capabilities', 'domainRows', 'capabilityRows'],
            additionalProperties: false,
          },
          implementationEvidence: {
            type: 'object',
            properties: {
              elements: { type: 'integer', minimum: 0 },
              reviewRequiredCapabilities: { type: 'integer', minimum: 0 },
              reviewRequiredRows: {
                type: 'array',
                maxItems: MEANING_GATE_REVIEW_ROW_LIMIT,
                items: REVIEW_REQUIRED_CAPABILITY_ROW_SCHEMA,
              },
            },
            required: ['elements', 'reviewRequiredCapabilities', 'reviewRequiredRows'],
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
      next: {
        type: 'object',
        properties: {
          applyTool: NON_BLANK_STRING_SCHEMA,
          review: NON_BLANK_STRING_SCHEMA,
          reviewCalls: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                tool: {
                  type: 'string',
                  enum: ['analyze_repo_structure', 'infer_imports'],
                },
                arguments: {
                  type: 'object',
                  properties: {
                    rootPath: NON_BLANK_STRING_SCHEMA,
                    maxDepth: { type: 'integer', minimum: 0, maximum: 10 },
                    maxFiles: { type: 'integer', minimum: 1, maximum: 50000 },
                  },
                  required: ['rootPath'],
                  additionalProperties: false,
                },
              },
              required: ['tool', 'arguments'],
              additionalProperties: false,
            },
          },
        },
        required: ['applyTool', 'review', 'reviewCalls'],
        additionalProperties: false,
      },
    },
    required: ['mode', 'sideEffect', 'rootPath', 'vaultRoot', 'analyze', 'imports', 'plan', 'validation', 'meaningGate', 'extractionContract', 'semanticEvidence', 'configurationEvidence', 'next'],
    additionalProperties: false,
  },
};
