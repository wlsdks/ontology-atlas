import {
  BUSINESS_EVIDENCE_ROW_SCHEMA,
  EXTRACTION_CONTRACT_OUTPUT_SCHEMA,
  IMPORT_RECONCILIATION_SUMMARY_SCHEMA,
  IMPORT_SCAN_COVERAGE_OUTPUT_SCHEMA,
  IMPORT_STALE_EDGE_FOLLOW_UP_SCHEMA,
  MEANING_GATE_EVIDENCE_ROW_LIMIT,
  MEANING_GATE_REVIEW_ROW_LIMIT,
  NON_BLANK_STRING_SCHEMA,
  PROPOSED_BUSINESS_CONCEPT_ROW_SCHEMA,
  REVIEW_REQUIRED_CAPABILITY_ROW_SCHEMA,
  RUST_FEATURE_CONFIGURATION_EVIDENCE_OUTPUT_SCHEMA,
  SEMANTIC_EVIDENCE_ROW_SCHEMA,
} from '../tool-schemas.mjs';

export const INDEX_PROJECT_TOOL = {
  name: 'index_project',
  description:
    'Project ontology indexing plan — run analyze_repo_structure + infer_imports + validate_vault in one read-only call. ' +
    'Use for large or already-existing projects where the agent needs a resumable ontology indexing checkpoint before writing. ' +
    'Its extractionContract treats source facts as observed evidence, README/folder meanings as proposals, and only persisted ontology meanings as shared; it also returns competency questions, uncertainty, approval gates, and whether active-vault validation actually applies to the analyzed project. ' +
    'The plan distinguishes raw candidates into existing, ambiguous-alias review, and genuinely new buckets, then returns exact reviewCalls for retrieving full rows. ' +
    'side effect 0: this tool never writes markdown. CLI `index --apply` may write analyzer-proposed concepts and containment, but inferred imports remain review-only and are never auto-promoted to depends_on.',
  inputSchema: {
    type: 'object',
    properties: {
      rootPath: {
        ...NON_BLANK_STRING_SCHEMA,
        description: 'Repository root to index. Defaults to the active resolved repository root from connection_info.',
      },
      maxDepth: {
        type: 'integer',
        minimum: 0,
        maximum: 10,
        description: 'Forwarded to analyze_repo_structure, which ignores it, so no value changes the analysis. When given, it must be an integer from 0 to 10.',
      },
      maxFiles: {
        type: 'integer',
        minimum: 1,
        maximum: 50000,
        description: 'File cap forwarded to infer_imports (default 5000, max 50000).',
      },
      threshold: {
        type: 'integer',
        minimum: 1,
        description: 'Optional module-edge count threshold for the returned import relation plan.',
      },
      skipImports: {
        type: 'boolean',
        description: 'When true, skip infer_imports and return an analyze + validate plan only.',
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
          cliApply: NON_BLANK_STRING_SCHEMA,
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
        required: ['applyTool', 'cliApply', 'review', 'reviewCalls'],
        additionalProperties: false,
      },
    },
    required: ['mode', 'sideEffect', 'rootPath', 'vaultRoot', 'analyze', 'imports', 'plan', 'validation', 'meaningGate', 'extractionContract', 'semanticEvidence', 'configurationEvidence', 'next'],
    additionalProperties: false,
  },
};
