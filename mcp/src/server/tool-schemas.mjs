/**
 * The JSON Schema fragments `tools/list` is assembled from, plus the enum
 * description strings derived from `schema.mjs`.
 *
 * Pure data: nothing here reads the disk or the environment, so the public
 * surface a client negotiates is decided by this file and `registry.mjs` alone.
 */
import {
  CONSTRUCTION_ADMISSION_CONTRACT,
  CONSTRUCTION_ADMISSION_TIERS,
  CONSTRUCTION_LIFECYCLE_CONTRACT,
  CONSTRUCTION_LIFECYCLE_PHASES,
} from '../construction-lifecycle.mjs';
import {
  IMPORT_EDGE_KIND_VALUES,
  IMPORT_SOURCE_ROLE_VALUES,
  IMPORT_USAGE_VALUES,
} from '../infer-imports.mjs';
import {
  EDGE_TARGET_KIND_VALUES,
  MAINTENANCE_KIND_VALUES,
  MAINTENANCE_PHASE_VALUES,
  MAINTENANCE_SEVERITY_VALUES,
  NODE_KIND_VALUES,
  QUERY_ONTOLOGY_OPERATIONS,
  QUERY_PLAN_TARGET_OPERATIONS,
  RELATION_TYPE_VALUES,
  WRITE_RELATION_TYPE_VALUES,
} from '../ontology-engine.mjs';
import { NODE_UID_PATTERN } from '../schema.mjs';
import { VAULT_ISSUE_CODE_VALUES } from '../validate.mjs';
import { GRAPH_ARRAY_KEYS } from '../vault.mjs';

const NON_BLANK_STRING_SCHEMA = Object.freeze({
  type: 'string',
  minLength: 1,
  pattern: '^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$',
});
const BACKLINK_REWRITE_VALUE_OUTPUT_SCHEMA = Object.freeze({
  type: ['array', 'object', 'string'],
  minLength: NON_BLANK_STRING_SCHEMA.minLength,
  minItems: 1,
  minProperties: 1,
  pattern: NON_BLANK_STRING_SCHEMA.pattern,
  items: NON_BLANK_STRING_SCHEMA,
  propertyNames: NON_BLANK_STRING_SCHEMA,
  additionalProperties: NON_BLANK_STRING_SCHEMA,
});
const GRAPH_REF_ARRAY_MAX_ITEMS = 500;

/**
 * Per-locale display-name input schema (owner decision, 2026-07-24). `title` is
 * the single source of truth for search, matching, and file identity, so it
 * never varies by locale — only render surfaces (map labels, INDEX, popovers)
 * read `display_<locale>`. Filling one side only attaches an advisory warning.
 */
const LOCALE_LABELS_SCHEMA = Object.freeze({
  type: 'object',
  description:
    'Per-locale display names, e.g. { "ko": "결제", "en": "Payments" }. Written as `display_ko` / `display_en` frontmatter keys; `title` stays the single source for search/matching. Fill BOTH locales the vault serves — a single-locale entry comes back as a warning.',
  properties: {
    ko: { type: 'string', description: 'Korean display name.' },
    en: { type: 'string', description: 'English display name.' },
  },
  additionalProperties: { type: 'string' },
});
const IGNORE_ARRAY_MAX_ITEMS = 200;
const SOURCE_FOLDER_ARRAY_MAX_ITEMS = 50;
const MEANING_GATE_EVIDENCE_ROW_LIMIT = 5;
const MEANING_GATE_REVIEW_ROW_LIMIT = 5;
const BUSINESS_EVIDENCE_ROW_SCHEMA = Object.freeze({
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
});
const REVIEW_REQUIRED_CAPABILITY_ROW_SCHEMA = Object.freeze({
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
});
const PROPOSED_BUSINESS_CONCEPT_ROW_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    slug: NON_BLANK_STRING_SCHEMA,
    reason: NON_BLANK_STRING_SCHEMA,
    title: NON_BLANK_STRING_SCHEMA,
    definition: { type: 'string', minLength: 1, maxLength: 1200 },
    includes: {
      type: 'array',
      maxItems: 24,
      items: NON_BLANK_STRING_SCHEMA,
    },
    excludes: {
      type: 'array',
      maxItems: 12,
      items: NON_BLANK_STRING_SCHEMA,
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    uncertainty: NON_BLANK_STRING_SCHEMA,
    evidenceSources: {
      type: 'array',
      maxItems: 12,
      items: NON_BLANK_STRING_SCHEMA,
    },
    evidence: {
      type: 'object',
      properties: {
        source: NON_BLANK_STRING_SCHEMA,
        line: { type: 'integer', minimum: 1 },
        implementation: NON_BLANK_STRING_SCHEMA,
      },
      required: ['source'],
      additionalProperties: false,
    },
  },
  required: ['slug', 'reason', 'evidence'],
  additionalProperties: false,
});
const SEMANTIC_EVIDENCE_ROW_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    source: NON_BLANK_STRING_SCHEMA,
    role: {
      type: 'string',
      enum: [
        'mission',
        'product-capabilities',
        'product-contract',
        'package-contract',
        'architecture',
        'agent-guidance',
      ],
    },
    title: NON_BLANK_STRING_SCHEMA,
    headings: {
      type: 'array',
      maxItems: 8,
      items: NON_BLANK_STRING_SCHEMA,
    },
    excerpt: { type: 'string', maxLength: 1200 },
    trust: {
      type: 'string',
      enum: [
        'candidate-evidence',
        'claim-review-required',
        'untrusted-instruction',
      ],
    },
    riskFlags: {
      type: 'array',
      uniqueItems: true,
      items: {
        type: 'string',
        enum: [
          'instruction-injection',
          'ontology-write-instruction',
          'future-state-claim',
          'negated-claim',
          'deprecated-state',
        ],
      },
    },
    reviewRequiredEvidence: {
      type: 'array',
      maxItems: 4,
      items: {
        type: 'object',
        properties: {
          heading: NON_BLANK_STRING_SCHEMA,
          startLine: { type: 'integer', minimum: 1 },
          endLine: { type: 'integer', minimum: 1 },
          excerpt: { type: 'string', minLength: 1, maxLength: 400 },
          riskFlags: {
            type: 'array',
            minItems: 1,
            uniqueItems: true,
            items: {
              type: 'string',
              enum: [
                'future-state-claim',
                'negated-claim',
                'deprecated-state',
              ],
            },
          },
        },
        required: ['heading', 'startLine', 'endLine', 'excerpt', 'riskFlags'],
        additionalProperties: false,
      },
    },
  },
  required: ['source', 'role', 'title', 'headings', 'excerpt', 'trust', 'riskFlags'],
  additionalProperties: false,
});
const RUST_FEATURE_REFERENCE_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    path: NON_BLANK_STRING_SCHEMA,
    line: { type: 'integer', minimum: 1 },
    form: { type: 'string', enum: ['cfg', 'cfg_attr'] },
    meaning: {
      type: 'string',
      enum: ['conditional_inclusion', 'conditional_attribute'],
    },
    polarity: {
      type: 'string',
      enum: ['positive', 'negative', 'compound', 'unknown'],
    },
    predicate: NON_BLANK_STRING_SCHEMA,
    sourceRole: { type: 'string', enum: ['production', 'test', 'unknown'] },
  },
  required: ['path', 'line', 'form', 'meaning', 'polarity', 'predicate', 'sourceRole'],
  additionalProperties: false,
});
const RUST_FEATURE_CONFIGURATION_EVIDENCE_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    contract: { type: 'string', enum: ['rustFeatureConfigurationEvidence:v1'] },
    status: {
      type: 'string',
      enum: ['not_present', 'unsupported', 'observed', 'limited'],
    },
    claimBoundary: {
      type: 'object',
      properties: {
        compileTimePredicateLocations: { type: 'boolean' },
        predicateEvaluation: { type: 'boolean', enum: [false] },
        runtimeImpact: { type: 'boolean', enum: [false] },
        importDependency: { type: 'boolean', enum: [false] },
        macroConsumers: { type: 'boolean', enum: [false] },
        semanticDependency: { type: 'boolean', enum: [false] },
      },
      required: [
        'compileTimePredicateLocations',
        'predicateEvaluation',
        'runtimeImpact',
        'importDependency',
        'macroConsumers',
        'semanticDependency',
      ],
      additionalProperties: false,
    },
    coverage: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['literal_cfg_feature_attributes_in_conventional_cargo_targets'],
        },
        workspaceMode: { type: 'string', enum: ['root_package', 'literal_direct_members'] },
        workspaceMembersDeclared: { type: 'integer', minimum: 0 },
        workspaceMembersConsidered: { type: 'integer', minimum: 0, maximum: 100 },
        workspaceMembersLimited: { type: 'boolean' },
        workspaceMembersEligible: { type: 'integer', minimum: 0 },
        workspaceMembersSkipped: { type: 'integer', minimum: 0 },
        packageLimit: { type: 'integer', minimum: 1 },
        packagesDiscovered: { type: 'integer', minimum: 0 },
        packagesScanned: { type: 'integer', minimum: 0 },
        packagesLimited: { type: 'boolean' },
        sourceFilesDiscovered: { type: 'integer', minimum: 0 },
        sourceFilesScanned: { type: 'integer', minimum: 0 },
        sourceFilesSkipped: { type: 'integer', minimum: 0 },
        sourceFileLimit: { type: 'integer', minimum: 1 },
        sourceFilesLimited: { type: 'boolean' },
        predicateForms: {
          type: 'array',
          minItems: 2,
          maxItems: 2,
          uniqueItems: true,
          items: { type: 'string', enum: ['cfg', 'cfg_attr'] },
        },
        predicateEvaluation: { type: 'boolean', enum: [false] },
        macroExpansion: { type: 'boolean', enum: [false] },
        buildScriptsExecuted: { type: 'boolean', enum: [false] },
      },
      required: [
        'scope',
        'workspaceMode',
        'workspaceMembersDeclared',
        'workspaceMembersConsidered',
        'workspaceMembersLimited',
        'workspaceMembersEligible',
        'workspaceMembersSkipped',
        'packageLimit',
        'packagesDiscovered',
        'packagesScanned',
        'packagesLimited',
        'sourceFilesDiscovered',
        'sourceFilesScanned',
        'sourceFilesSkipped',
        'sourceFileLimit',
        'sourceFilesLimited',
        'predicateForms',
        'predicateEvaluation',
        'macroExpansion',
        'buildScriptsExecuted',
      ],
      additionalProperties: false,
    },
    packages: {
      type: 'array',
      maxItems: 24,
      items: {
        type: 'object',
        properties: {
          manifest: NON_BLANK_STRING_SCHEMA,
          packageName: NON_BLANK_STRING_SCHEMA,
          featuresDeclared: { type: 'integer', minimum: 0 },
          featuresLimited: { type: 'boolean' },
          features: {
            type: 'array',
            maxItems: 48,
            items: {
              type: 'object',
              properties: {
                name: NON_BLANK_STRING_SCHEMA,
                directMappingsCount: { type: 'integer', minimum: 0 },
                directMappings: {
                  type: 'array',
                  maxItems: 100,
                  items: { ...NON_BLANK_STRING_SCHEMA, maxLength: 512 },
                },
                directMappingsLimited: { type: 'boolean' },
                referenceCount: { type: 'integer', minimum: 0 },
                byForm: {
                  type: 'object',
                  properties: {
                    cfg: { type: 'integer', minimum: 0 },
                    cfg_attr: { type: 'integer', minimum: 0 },
                  },
                  required: ['cfg', 'cfg_attr'],
                  additionalProperties: false,
                },
                byPolarity: {
                  type: 'object',
                  properties: Object.fromEntries(
                    ['positive', 'negative', 'compound', 'unknown'].map((value) => [
                      value,
                      { type: 'integer', minimum: 0 },
                    ]),
                  ),
                  required: ['positive', 'negative', 'compound', 'unknown'],
                  additionalProperties: false,
                },
                references: {
                  type: 'array',
                  maxItems: 5,
                  items: RUST_FEATURE_REFERENCE_OUTPUT_SCHEMA,
                },
                referencesLimited: { type: 'boolean' },
              },
              required: [
                'name',
                'directMappingsCount',
                'directMappings',
                'directMappingsLimited',
                'referenceCount',
                'byForm',
                'byPolarity',
                'references',
                'referencesLimited',
              ],
              additionalProperties: false,
            },
          },
        },
        required: ['manifest', 'packageName', 'featuresDeclared', 'featuresLimited', 'features'],
        additionalProperties: false,
      },
    },
    unsupportedWorkspaceMembers: {
      type: 'array',
      maxItems: 50,
      items: {
        type: 'object',
        properties: {
          member: NON_BLANK_STRING_SCHEMA,
          reason: {
            type: 'string',
            enum: [
              'invalid-member-path',
              'glob-not-supported',
              'outside-root',
              'manifest-not-found',
              'package-table-not-found',
            ],
          },
        },
        required: ['member', 'reason'],
        additionalProperties: false,
      },
    },
    unsupportedWorkspaceMembersLimited: { type: 'boolean' },
    unsupportedPredicates: {
      type: 'object',
      properties: {
        count: { type: 'integer', minimum: 0 },
        samples: {
          type: 'array',
          maxItems: 20,
          items: {
            type: 'object',
            properties: {
              path: NON_BLANK_STRING_SCHEMA,
              line: { type: 'integer', minimum: 1 },
              form: { type: 'string', enum: ['cfg', 'cfg_attr'] },
              predicate: NON_BLANK_STRING_SCHEMA,
              reason: {
                type: 'string',
                enum: [
                  'non-literal-feature-name',
                  'feature-not-declared-in-scanned-table',
                ],
              },
            },
            required: ['path', 'line', 'form', 'predicate', 'reason'],
            additionalProperties: false,
          },
        },
        limited: { type: 'boolean' },
      },
      required: ['count', 'samples', 'limited'],
      additionalProperties: false,
    },
    writePolicy: {
      type: 'object',
      properties: {
        automaticRelation: { type: 'boolean', enum: [false] },
        writeAllowed: { type: 'boolean', enum: [false] },
        humanApprovalRequired: { type: 'boolean', enum: [true] },
      },
      required: ['automaticRelation', 'writeAllowed', 'humanApprovalRequired'],
      additionalProperties: false,
    },
    limitations: { type: 'array', minItems: 1, items: NON_BLANK_STRING_SCHEMA },
  },
  required: [
    'contract',
    'status',
    'claimBoundary',
    'coverage',
    'packages',
    'unsupportedWorkspaceMembers',
    'unsupportedWorkspaceMembersLimited',
    'unsupportedPredicates',
    'writePolicy',
    'limitations',
  ],
  additionalProperties: false,
});
const IMPORT_SCAN_COVERAGE_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    contract: { type: 'string', enum: ['importScanCoverage:v1'] },
    supportedLanguages: {
      type: 'array',
      uniqueItems: true,
      items: { type: 'string', enum: ['go', 'javascript', 'python', 'rust', 'typescript'] },
    },
    supportedExtensions: { type: 'array', uniqueItems: true, items: NON_BLANK_STRING_SCHEMA },
    detectedUnsupportedLanguages: {
      type: 'array',
      uniqueItems: true,
      items: { type: 'string', enum: ['c'] },
    },
    allDetectedLanguagesSupported: { type: 'boolean' },
    zeroEdgesMeaning: {
      type: 'string',
      enum: ['no_supported_static_import_edges_observed'],
    },
    limitations: { type: 'array', minItems: 1, items: NON_BLANK_STRING_SCHEMA },
  },
  required: [
    'contract',
    'supportedLanguages',
    'supportedExtensions',
    'detectedUnsupportedLanguages',
    'allDetectedLanguagesSupported',
    'zeroEdgesMeaning',
    'limitations',
  ],
  additionalProperties: false,
});
const GO_PACKAGE_IMPORT_ROW_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    fromFile: NON_BLANK_STRING_SCHEMA,
    fromPackage: NON_BLANK_STRING_SCHEMA,
    toPackage: NON_BLANK_STRING_SCHEMA,
    importSpec: NON_BLANK_STRING_SCHEMA,
    kind: { type: 'string', enum: ['static', 'side'] },
    sourceRole: { type: 'string', enum: IMPORT_SOURCE_ROLE_VALUES },
    importUsage: { type: 'string', enum: ['value'] },
  },
  required: ['fromFile', 'fromPackage', 'toPackage', 'importSpec', 'kind', 'sourceRole', 'importUsage'],
  additionalProperties: false,
});
const GO_PACKAGE_IMPORT_MODULE_EDGE_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    fromPackage: NON_BLANK_STRING_SCHEMA,
    toPackage: NON_BLANK_STRING_SCHEMA,
    count: { type: 'integer', minimum: 1 },
    kindCounts: {
      type: 'object',
      properties: {
        static: { type: 'integer', minimum: 1 },
        side: { type: 'integer', minimum: 1 },
      },
      minProperties: 1,
      additionalProperties: false,
    },
    sourceRoleCounts: {
      type: 'object',
      properties: Object.fromEntries(
        IMPORT_SOURCE_ROLE_VALUES.map((role) => [role, { type: 'integer', minimum: 0 }]),
      ),
      required: IMPORT_SOURCE_ROLE_VALUES,
      additionalProperties: false,
    },
    importUsageCounts: {
      type: 'object',
      properties: Object.fromEntries(
        IMPORT_USAGE_VALUES.map((usage) => [usage, { type: 'integer', minimum: 0 }]),
      ),
      required: IMPORT_USAGE_VALUES,
      additionalProperties: false,
    },
    productValueCount: { type: 'integer', minimum: 0 },
    evidence: {
      type: 'array',
      minItems: 1,
      maxItems: 5,
      items: GO_PACKAGE_IMPORT_ROW_SCHEMA,
    },
    evidenceLimited: { type: 'boolean' },
  },
  required: [
    'fromPackage',
    'toPackage',
    'count',
    'kindCounts',
    'sourceRoleCounts',
    'importUsageCounts',
    'productValueCount',
    'evidence',
    'evidenceLimited',
  ],
  additionalProperties: false,
});
const GO_PACKAGE_IMPORT_EVIDENCE_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  description:
    'Root Go module-only, bounded package import evidence. It is observed static source evidence, never a runtime claim or semantic relation approval.',
  properties: {
    contract: { type: 'string', enum: ['goPackageImports:v1'] },
    modulePath: NON_BLANK_STRING_SCHEMA,
    sourceQualification: {
      type: 'string',
      enum: ['observed_bounded_go_package_imports_not_runtime_or_semantic_impact'],
    },
    writeAllowed: { type: 'boolean', enum: [false] },
    filesScanned: { type: 'integer', minimum: 0 },
    fileScanLimited: { type: 'boolean' },
    perFileByteLimit: { type: 'integer', minimum: 1 },
    perFileImportLimit: { type: 'integer', minimum: 1 },
    skipped: {
      type: 'array',
      items: {
        type: 'object',
        properties: { file: NON_BLANK_STRING_SCHEMA, reason: NON_BLANK_STRING_SCHEMA },
        required: ['file', 'reason'],
        additionalProperties: false,
      },
    },
    limitations: { type: 'array', minItems: 1, items: NON_BLANK_STRING_SCHEMA },
    packageImports: { type: 'array', items: GO_PACKAGE_IMPORT_ROW_SCHEMA },
    moduleEdges: { type: 'array', items: GO_PACKAGE_IMPORT_MODULE_EDGE_SCHEMA },
  },
  required: [
    'contract',
    'modulePath',
    'sourceQualification',
    'writeAllowed',
    'filesScanned',
    'fileScanLimited',
    'perFileByteLimit',
    'perFileImportLimit',
    'skipped',
    'limitations',
    'packageImports',
    'moduleEdges',
  ],
  additionalProperties: false,
});
const GO_PACKAGE_IMPORT_EVIDENCE_SUMMARY_SCHEMA = Object.freeze({
  type: 'object',
  description:
    'Bounded Go package-import census. Call fullEvidenceCall to retrieve the complete typed receipt; focusReview itself contains legacy file edges only.',
  properties: {
    contract: { type: 'string', enum: ['goPackageImports:v1'] },
    filesScanned: { type: 'integer', minimum: 0 },
    fileScanLimited: { type: 'boolean' },
    packageImports: { type: 'integer', minimum: 0 },
    moduleEdges: { type: 'integer', minimum: 0 },
    fullEvidenceCall: {
      type: 'object',
      properties: {
        tool: { type: 'string', enum: ['infer_imports'] },
        arguments: {
          type: 'object',
          properties: {
            rootPath: NON_BLANK_STRING_SCHEMA,
            sourceFolders: {
              type: 'array',
              maxItems: SOURCE_FOLDER_ARRAY_MAX_ITEMS,
              items: NON_BLANK_STRING_SCHEMA,
            },
            ignore: {
              type: 'array',
              maxItems: IGNORE_ARRAY_MAX_ITEMS,
              items: NON_BLANK_STRING_SCHEMA,
            },
            maxFiles: { type: 'integer', minimum: 1, maximum: 50000 },
            reviewMode: { type: 'string', enum: ['full'] },
            allowLargeResponse: { type: 'boolean', enum: [true] },
          },
          required: ['rootPath', 'reviewMode', 'allowLargeResponse'],
          additionalProperties: false,
        },
        purpose: NON_BLANK_STRING_SCHEMA,
      },
      required: ['tool', 'arguments', 'purpose'],
      additionalProperties: false,
    },
  },
  required: ['contract', 'filesScanned', 'fileScanLimited', 'packageImports', 'moduleEdges', 'fullEvidenceCall'],
  additionalProperties: false,
});
const MEANING_PROPOSAL_CONCEPT_INPUT_PROPERTIES = Object.freeze({
  slug: NON_BLANK_STRING_SCHEMA,
  title: NON_BLANK_STRING_SCHEMA,
  definition: NON_BLANK_STRING_SCHEMA,
  path: NON_BLANK_STRING_SCHEMA,
  includes: {
    type: 'array',
    maxItems: 20,
    uniqueItems: true,
    items: NON_BLANK_STRING_SCHEMA,
  },
  excludes: {
    type: 'array',
    maxItems: 20,
    uniqueItems: true,
    items: NON_BLANK_STRING_SCHEMA,
  },
  uncertainty: NON_BLANK_STRING_SCHEMA,
  evidence: {
    type: 'array',
    minItems: 1,
    maxItems: 20,
    uniqueItems: true,
    description:
      'Repository evidence sources. Element proposals may keep an ordinary citation and append reviewed navigation:<primary|supporting|test>:<path>#<symbol> strings (limits 1/1/3); they are current structural navigation, never behavior proof.',
    items: NON_BLANK_STRING_SCHEMA,
  },
  confidence: { type: 'number', minimum: 0, maximum: 1 },
});
const COMPETENCY_RELATION_WITNESS_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    from: NON_BLANK_STRING_SCHEMA,
    to: NON_BLANK_STRING_SCHEMA,
    type: { ...NON_BLANK_STRING_SCHEMA, enum: WRITE_RELATION_TYPE_VALUES },
  },
  required: ['from', 'to', 'type'],
  additionalProperties: false,
});
const COMPETENCY_WITNESSES_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    concepts: {
      type: 'array',
      maxItems: 200,
      uniqueItems: true,
      items: NON_BLANK_STRING_SCHEMA,
    },
    relations: {
      type: 'array',
      maxItems: 200,
      items: COMPETENCY_RELATION_WITNESS_SCHEMA,
    },
    evidence: {
      type: 'array',
      maxItems: 100,
      uniqueItems: true,
      items: NON_BLANK_STRING_SCHEMA,
    },
    paths: {
      type: 'array',
      maxItems: 100,
      uniqueItems: true,
      items: NON_BLANK_STRING_SCHEMA,
    },
  },
  required: ['concepts', 'relations', 'evidence', 'paths'],
  additionalProperties: false,
});
const COMPETENCY_ANSWER_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    answer: NON_BLANK_STRING_SCHEMA,
    status: {
      type: 'string',
      enum: ['answered', 'partial', 'visible-gap'],
    },
    gap: NON_BLANK_STRING_SCHEMA,
    witnesses: COMPETENCY_WITNESSES_SCHEMA,
  },
  required: ['answer', 'status', 'witnesses'],
  additionalProperties: false,
});
const COMPETENCY_ANSWERS_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    scope: COMPETENCY_ANSWER_SCHEMA,
    domains: COMPETENCY_ANSWER_SCHEMA,
    abilities: COMPETENCY_ANSWER_SCHEMA,
    evidence: COMPETENCY_ANSWER_SCHEMA,
    impact: COMPETENCY_ANSWER_SCHEMA,
  },
  required: ['scope', 'domains', 'abilities', 'evidence', 'impact'],
  additionalProperties: false,
});
const MEANING_PROPOSAL_INPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    project: {
      type: 'object',
      properties: MEANING_PROPOSAL_CONCEPT_INPUT_PROPERTIES,
      required: ['slug', 'title', 'definition', 'evidence', 'confidence'],
      additionalProperties: false,
    },
    domains: {
      type: 'array',
      maxItems: 50,
      items: {
        type: 'object',
        properties: MEANING_PROPOSAL_CONCEPT_INPUT_PROPERTIES,
        required: ['slug', 'title', 'definition', 'evidence', 'confidence'],
        additionalProperties: false,
      },
    },
    capabilities: {
      type: 'array',
      maxItems: 100,
      items: {
        type: 'object',
        properties: {
          ...MEANING_PROPOSAL_CONCEPT_INPUT_PROPERTIES,
          domain: NON_BLANK_STRING_SCHEMA,
        },
        required: ['slug', 'title', 'definition', 'evidence', 'confidence', 'domain'],
        additionalProperties: false,
      },
    },
    elements: {
      type: 'array',
      maxItems: 100,
      items: {
        type: 'object',
        properties: {
          ...MEANING_PROPOSAL_CONCEPT_INPUT_PROPERTIES,
          domain: NON_BLANK_STRING_SCHEMA,
        },
        required: [
          'slug',
          'title',
          'definition',
          'evidence',
          'confidence',
          'domain',
          'path',
        ],
        additionalProperties: false,
      },
    },
    relations: {
      type: 'array',
      maxItems: 200,
      items: {
        type: 'object',
        properties: {
          from: NON_BLANK_STRING_SCHEMA,
          to: NON_BLANK_STRING_SCHEMA,
          type: { ...NON_BLANK_STRING_SCHEMA, enum: WRITE_RELATION_TYPE_VALUES },
          why: { type: 'string', minLength: 1, maxLength: 300 },
          evidence: {
            type: 'array',
            minItems: 1,
            maxItems: 20,
            uniqueItems: true,
            items: NON_BLANK_STRING_SCHEMA,
          },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: ['from', 'to', 'type', 'why', 'evidence', 'confidence'],
        additionalProperties: false,
      },
    },
    competencyAnswers: COMPETENCY_ANSWERS_SCHEMA,
  },
  required: ['project', 'domains', 'capabilities', 'elements', 'relations', 'competencyAnswers'],
  additionalProperties: false,
});
const MEANING_WRITE_PLAN_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    concepts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          slug: NON_BLANK_STRING_SCHEMA,
          kind: {
            ...NON_BLANK_STRING_SCHEMA,
            enum: ['project', 'domain', 'capability', 'element'],
          },
          title: NON_BLANK_STRING_SCHEMA,
          domain: NON_BLANK_STRING_SCHEMA,
          path: NON_BLANK_STRING_SCHEMA,
          body: { type: 'string' },
        },
        required: ['slug', 'kind', 'title', 'body'],
        additionalProperties: false,
      },
    },
    relations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from: NON_BLANK_STRING_SCHEMA,
          to: NON_BLANK_STRING_SCHEMA,
          type: { ...NON_BLANK_STRING_SCHEMA, enum: WRITE_RELATION_TYPE_VALUES },
          why: { type: 'string', minLength: 1, maxLength: 300 },
        },
        required: ['from', 'to', 'type', 'why'],
        additionalProperties: false,
      },
    },
    competencyAnswers: COMPETENCY_ANSWERS_SCHEMA,
  },
  required: ['concepts', 'relations', 'competencyAnswers'],
  additionalProperties: false,
});
const CONSTRUCTION_LIFECYCLE_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    contract: { type: 'string', enum: [CONSTRUCTION_LIFECYCLE_CONTRACT] },
    qualificationStatus: {
      type: 'string',
      enum: ['qualified', 'not_qualified', 'invalid'],
    },
    writeEligibility: {
      type: 'string',
      enum: ['blocked', 'reviewable', 'executable'],
    },
    planDigest: { anyOf: [{ type: 'string', pattern: '^sha256:[a-f0-9]{64}$' }, { type: 'null' }] },
    sourceDigest: { anyOf: [{ type: 'string', pattern: '^sha256:[a-f0-9]{64}$' }, { type: 'null' }] },
    planRevision: { type: 'integer', minimum: 1 },
    firstBlockingPhase: {
      anyOf: [{ type: 'string', enum: CONSTRUCTION_LIFECYCLE_PHASES }, { type: 'null' }],
    },
    phases: {
      type: 'array',
      minItems: CONSTRUCTION_LIFECYCLE_PHASES.length,
      maxItems: CONSTRUCTION_LIFECYCLE_PHASES.length,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', enum: CONSTRUCTION_LIFECYCLE_PHASES },
          status: {
            type: 'string',
            enum: ['passed', 'blocked', 'awaiting_approval', 'gap_accepted', 'pending_post_write'],
          },
          diagnosticCodes: {
            type: 'array',
            uniqueItems: true,
            items: NON_BLANK_STRING_SCHEMA,
          },
        },
        required: ['id', 'status', 'diagnosticCodes'],
        additionalProperties: false,
      },
    },
    diagnostics: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          code: NON_BLANK_STRING_SCHEMA,
          phase: { type: 'string', enum: CONSTRUCTION_LIFECYCLE_PHASES },
          message: NON_BLANK_STRING_SCHEMA,
        },
        required: ['code', 'phase', 'message'],
        additionalProperties: false,
      },
    },
    requiredGapIds: {
      type: 'array',
      uniqueItems: true,
      items: NON_BLANK_STRING_SCHEMA,
    },
    proposalCoverage: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['not_measured', 'complete', 'mismatch'] },
        expectedCount: { type: 'integer', minimum: 0 },
        coveredCount: { type: 'integer', minimum: 0 },
        missingRefs: { type: 'array', uniqueItems: true, items: NON_BLANK_STRING_SCHEMA },
        unexpectedRefs: { type: 'array', uniqueItems: true, items: NON_BLANK_STRING_SCHEMA },
        sourceHiddenMissingRefs: { type: 'array', uniqueItems: true, items: NON_BLANK_STRING_SCHEMA },
      },
      required: [
        'status',
        'expectedCount',
        'coveredCount',
        'missingRefs',
        'unexpectedRefs',
        'sourceHiddenMissingRefs',
      ],
      additionalProperties: false,
    },
    admission: {
      type: 'object',
      properties: {
        contract: { type: 'string', enum: [CONSTRUCTION_ADMISSION_CONTRACT] },
        mode: { type: 'string', enum: ['shadow'] },
        tier: { type: 'string', enum: CONSTRUCTION_ADMISSION_TIERS },
        autoWriteCandidate: { type: 'boolean' },
        humanAcceptanceRequired: { type: 'boolean' },
        reviewItems: {
          type: 'array',
          uniqueItems: true,
          items: NON_BLANK_STRING_SCHEMA,
        },
        diagnosticCodes: {
          type: 'array',
          uniqueItems: true,
          items: NON_BLANK_STRING_SCHEMA,
        },
      },
      required: [
        'contract',
        'mode',
        'tier',
        'autoWriteCandidate',
        'humanAcceptanceRequired',
        'reviewItems',
        'diagnosticCodes',
      ],
      additionalProperties: false,
    },
    nextAction: NON_BLANK_STRING_SCHEMA,
  },
  required: [
    'contract',
    'qualificationStatus',
    'writeEligibility',
    'planDigest',
    'sourceDigest',
    'planRevision',
    'firstBlockingPhase',
    'phases',
    'diagnostics',
    'requiredGapIds',
    'proposalCoverage',
    'admission',
    'nextAction',
  ],
  additionalProperties: false,
});
const MEANING_PROPOSAL_VALIDATION_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    status: {
      type: 'string',
      enum: ['not-provided', 'pass', 'fail'],
    },
    canWrite: { type: 'boolean' },
    summary: {
      type: 'object',
      properties: {
        concepts: { type: 'integer', minimum: 0 },
        relations: { type: 'integer', minimum: 0 },
        findings: { type: 'integer', minimum: 0 },
        errors: { type: 'integer', minimum: 0 },
        warnings: { type: 'integer', minimum: 0 },
      },
      required: ['concepts', 'relations', 'findings', 'errors', 'warnings'],
      additionalProperties: false,
    },
    gates: {
      type: 'object',
      properties: {
        projectDefined: { type: 'boolean' },
        conceptsDefined: { type: 'boolean' },
        citationsResolved: { type: 'boolean' },
        riskyEvidenceControlled: { type: 'boolean' },
        capabilityDomainsResolved: { type: 'boolean' },
        elementDomainsResolved: { type: 'boolean' },
        elementPathsResolved: { type: 'boolean' },
        relationsResolved: { type: 'boolean' },
        confidenceValid: { type: 'boolean' },
        competencyQuestionsAnswered: { type: 'boolean' },
        competencyWitnessesResolved: { type: 'boolean' },
      },
      required: [
        'projectDefined',
        'conceptsDefined',
        'citationsResolved',
        'riskyEvidenceControlled',
        'capabilityDomainsResolved',
        'elementDomainsResolved',
        'elementPathsResolved',
        'relationsResolved',
        'confidenceValid',
        'competencyQuestionsAnswered',
        'competencyWitnessesResolved',
      ],
      additionalProperties: false,
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          code: NON_BLANK_STRING_SCHEMA,
          severity: { type: 'string', enum: ['error', 'warning'] },
          path: NON_BLANK_STRING_SCHEMA,
          message: NON_BLANK_STRING_SCHEMA,
          sources: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
        },
        required: ['code', 'severity', 'path', 'message', 'sources'],
        additionalProperties: false,
      },
    },
    constructionLifecycle: CONSTRUCTION_LIFECYCLE_OUTPUT_SCHEMA,
    reviewPlan: MEANING_WRITE_PLAN_OUTPUT_SCHEMA,
    writePlan: MEANING_WRITE_PLAN_OUTPUT_SCHEMA,
    nextStep: NON_BLANK_STRING_SCHEMA,
  },
  required: ['status', 'canWrite', 'summary', 'gates', 'findings', 'constructionLifecycle', 'nextStep'],
  additionalProperties: false,
});
const EXTRACTION_CONTRACT_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    standard: NON_BLANK_STRING_SCHEMA,
    status: {
      type: 'string',
      enum: [
        'grounded-in-existing-ontology',
        'evidence-gathering',
        'scope-discovery-required',
      ],
    },
    assertionPolicy: {
      type: 'object',
      properties: {
        sourceFacts: { type: 'string', enum: ['observed'] },
        readmeAndFolderMeanings: { type: 'string', enum: ['proposed'] },
        persistedOntologyMeanings: { type: 'string', enum: ['shared'] },
        automaticBusinessAssertions: { type: 'integer', enum: [0] },
        humanApprovalRequired: { type: 'boolean', enum: [true] },
      },
      required: [
        'sourceFacts',
        'readmeAndFolderMeanings',
        'persistedOntologyMeanings',
        'automaticBusinessAssertions',
        'humanApprovalRequired',
      ],
      additionalProperties: false,
    },
    competencyQuestions: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            enum: ['scope', 'domains', 'abilities', 'evidence', 'impact'],
          },
          type: {
            type: 'string',
            enum: ['scoping', 'validation', 'relationship'],
          },
          question: NON_BLANK_STRING_SCHEMA,
          priority: { type: 'string', enum: ['core'] },
          requiredWitnesses: {
            type: 'array',
            minItems: 1,
            uniqueItems: true,
            items: {
              type: 'string',
              enum: ['concepts', 'relations', 'evidence', 'paths'],
            },
          },
        },
        required: ['id', 'type', 'question', 'priority', 'requiredWitnesses'],
        additionalProperties: false,
      },
    },
    qualityGates: {
      type: 'object',
      properties: {
        scopeCandidateAvailable: { type: 'boolean' },
        sharedBusinessConceptsAvailable: { type: 'boolean' },
        proposedBusinessConcepts: { type: 'integer', minimum: 0 },
        implementationEvidenceAvailable: { type: 'boolean' },
        semanticEvidenceAvailable: { type: 'boolean' },
        semanticEvidenceReviewRequired: { type: 'integer', minimum: 0 },
        typedRelationsProposed: { type: 'integer', minimum: 0 },
        provenanceAttached: { type: 'boolean' },
        uncertaintyExplicit: { type: 'boolean', enum: [true] },
        approvalRequired: { type: 'boolean', enum: [true] },
      },
      required: [
        'scopeCandidateAvailable',
        'sharedBusinessConceptsAvailable',
        'proposedBusinessConcepts',
        'implementationEvidenceAvailable',
        'semanticEvidenceAvailable',
        'semanticEvidenceReviewRequired',
        'typedRelationsProposed',
        'provenanceAttached',
        'uncertaintyExplicit',
        'approvalRequired',
      ],
      additionalProperties: false,
    },
    limitations: {
      type: 'array',
      minItems: 1,
      items: NON_BLANK_STRING_SCHEMA,
    },
    nextStep: NON_BLANK_STRING_SCHEMA,
  },
  required: [
    'standard',
    'status',
    'assertionPolicy',
    'competencyQuestions',
    'qualityGates',
    'limitations',
    'nextStep',
  ],
  additionalProperties: false,
});
const RELATION_ARRAY_PATCH_SCHEMA = Object.freeze({
  type: 'object',
  properties: Object.fromEntries(
    GRAPH_ARRAY_KEYS.map((key) => [
      key,
      { type: 'array', maxItems: GRAPH_REF_ARRAY_MAX_ITEMS, items: NON_BLANK_STRING_SCHEMA },
    ]),
  ),
  additionalProperties: false,
});
const BACKLINK_REWRITE_KEY_CHANGE_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    key: NON_BLANK_STRING_SCHEMA,
    before: BACKLINK_REWRITE_VALUE_OUTPUT_SCHEMA,
    after: BACKLINK_REWRITE_VALUE_OUTPUT_SCHEMA,
  },
  required: ['key'],
  additionalProperties: false,
});
const BACKLINK_REWRITE_UPDATE_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    slug: NON_BLANK_STRING_SCHEMA,
    title: NON_BLANK_STRING_SCHEMA,
    beforeKeys: { type: 'array', items: BACKLINK_REWRITE_KEY_CHANGE_OUTPUT_SCHEMA },
    afterKeys: { type: 'array', items: BACKLINK_REWRITE_KEY_CHANGE_OUTPUT_SCHEMA },
    bodyChanged: { type: 'boolean' },
  },
  required: ['slug', 'title', 'beforeKeys', 'afterKeys', 'bodyChanged'],
  additionalProperties: false,
});
const BACKLINK_REWRITE_PLAN_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    updates: { type: 'array', items: BACKLINK_REWRITE_UPDATE_OUTPUT_SCHEMA },
    totalUpdated: { type: 'integer', minimum: 0 },
  },
  required: ['updates', 'totalUpdated'],
  additionalProperties: false,
});
const BACKLINK_ROW_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    uid: { ...NON_BLANK_STRING_SCHEMA, pattern: NODE_UID_PATTERN },
    slug: NON_BLANK_STRING_SCHEMA,
    kind: NON_BLANK_STRING_SCHEMA,
    title: NON_BLANK_STRING_SCHEMA,
    domain: NON_BLANK_STRING_SCHEMA,
    mtime: { type: 'number', minimum: 0 },
    matchedKeys: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
    matchedInBody: { type: 'boolean' },
    // Set when the referrer names an ambiguous tail that only *could* mean this
    // node — delete_concept widens its safety check to these rows.
    ambiguousTail: { type: 'boolean' },
  },
  required: ['uid', 'slug', 'kind', 'title', 'mtime'],
  additionalProperties: false,
});
const CAPTURED_DOC_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    frontmatter: { type: 'object', additionalProperties: true },
    body: { type: 'string' },
    bodyExcerpt: { type: 'string' },
  },
  required: ['frontmatter'],
  additionalProperties: false,
});
const VAULT_WARNING_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    code: { ...NON_BLANK_STRING_SCHEMA, enum: VAULT_ISSUE_CODE_VALUES },
    severity: { ...NON_BLANK_STRING_SCHEMA, enum: ['error', 'warning'] },
    message: NON_BLANK_STRING_SCHEMA,
  },
  required: ['code', 'severity', 'message'],
  additionalProperties: false,
});
const CONCEPT_NEIGHBORS_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    domains: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
    domain: { type: ['string', 'null'] },
    capabilities: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
    elements: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
    dependencies: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
    relates: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
    contains: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
    describes: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
  },
  required: ['domains', 'domain', 'capabilities', 'elements', 'dependencies', 'relates', 'contains', 'describes'],
  additionalProperties: false,
});
/**
 * One stored relation rationale, as `add_relation(why)` wrote it into the source
 * document's `relation_notes` map. Optional on every edge shape that carries it:
 * the key is omitted (never null) when the document stores no sentence for that
 * target, so absence reads as "no claim", not as an empty claim.
 */
const EDGE_RATIONALE_OUTPUT_SCHEMA = Object.freeze({
  ...NON_BLANK_STRING_SCHEMA,
  description:
    'One-line rationale stored with this relation in the source document\'s `relation_notes` map (written by `add_relation(why)`). Omitted when no note is stored for the target.',
});
const OUTGOING_EDGE_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    to: NON_BLANK_STRING_SCHEMA,
    via: NON_BLANK_STRING_SCHEMA,
    rationale: EDGE_RATIONALE_OUTPUT_SCHEMA,
  },
  required: ['to', 'via'],
  additionalProperties: false,
});
// Growth signal, attached only when a read tool hits an empty or unresolved
// result — never on a success response. `mcp/src/growth-hint.mjs` fills it from
// real vault data only (inventory, near-miss slugs and titles).
/**
 * How the body is delivered. `'excerpt'` is the first prose paragraph (<=800
 * chars), `'full'` is the whole markdown body. The default is `'excerpt'`
 * because of payload size; `'full'` exists because **the construction rules
 * require the evidence to be written in the body** — telling authors to write
 * it and then giving no way to read it makes half of that rule fictional.
 */
const BODY_DELIVERY_MODES = Object.freeze(['excerpt', 'full']);
/** Row cap for one `get_concepts({ body: 'full' })` call. Excerpt mode stays 50. */

/**
 * How much body was delivered — and **what was left out**.
 *
 * Always present in the response. When nothing was cut, `truncated: false`
 * guarantees that; when it was, the remaining character count comes with the
 * call that fetches the rest. Cutting silently was the defect (handover trial,
 * 2026-08-01).
 */
const BODY_INFO_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    mode: { type: 'string', enum: ['excerpt', 'full'] },
    totalChars: { type: 'integer', minimum: 0, description: 'Full markdown body length in characters.' },
    returnedChars: { type: 'integer', minimum: 0, description: 'Characters actually returned in this response.' },
    truncated: { type: 'boolean', description: 'True when part of the body was not returned.' },
    omittedChars: { type: 'integer', minimum: 0, description: 'Only present when truncated.' },
    hint: { type: 'string', description: 'Only present when truncated — the exact call that returns the rest.' },
  },
  required: ['mode', 'totalChars', 'returnedChars', 'truncated'],
  additionalProperties: false,
});

const GROWTH_HINT_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    reason: NON_BLANK_STRING_SCHEMA,
    suggestion: NON_BLANK_STRING_SCHEMA,
    exampleCall: {
      type: 'object',
      properties: {
        tool: NON_BLANK_STRING_SCHEMA,
        // Tool arguments are intentionally polymorphic: the example is a
        // repair hint for several tools, not an invocation envelope for one
        // fixed operation. Keep that openness explicit so it cannot be
        // mistaken for an omitted nested schema.
        args: { type: 'object', additionalProperties: true },
      },
      required: ['tool', 'args'],
      additionalProperties: false,
    },
  },
  required: ['reason', 'suggestion', 'exampleCall'],
  additionalProperties: false,
});

// Nested tools/list objects are closed by default. These small contracts are
// deliberately kept beside the registry so the MCP wire shape and the
// runtime values cannot drift independently. Only maps whose keys are chosen
// at runtime (frontmatter and example-call arguments) use an explicit open
// object schema above/below.
const PROJECT_SOURCE_GAP_SCHEMA = Object.freeze({
  type: ['object', 'null'],
  properties: {
    id: {
      type: 'string',
      enum: [
        'source_unbound',
        'multiple_active_sources',
        'receipt_missing',
        'receipt_malformed',
        'source_role_evidence_missing',
        'declared_source_path_missing',
        'source_inventory_truncated',
        'ontology_changed',
        'source_changed',
      ],
    },
    nodeSlug: { type: 'string' },
  },
  required: ['id'],
  additionalProperties: false,
});
const PROJECT_SOURCE_ACTION_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    id: {
      type: 'string',
      enum: [
        'connect_source',
        'repair_source_binding',
        'measure_source',
        'record_source_role',
        'repair_source_path',
        'review_inventory_limit',
        'remeasure_source',
        'use_current_evidence',
      ],
    },
    target: { type: 'string' },
  },
  required: ['id'],
  additionalProperties: false,
});
const PROJECT_SOURCE_RECEIPT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    contractVersion: { type: 'integer', enum: [1] },
    projectSlug: NON_BLANK_STRING_SCHEMA,
    sourceId: NON_BLANK_STRING_SCHEMA,
    sourceKind: { type: 'string', enum: ['git', 'folder'] },
    sourceRevision: NON_BLANK_STRING_SCHEMA,
    sourceFingerprint: NON_BLANK_STRING_SCHEMA,
    graphHash: NON_BLANK_STRING_SCHEMA,
    measuredAt: { type: 'string', format: 'date-time' },
    status: { type: 'string', enum: ['needs_evidence', 'review_required', 'verified_current'] },
    currentness: { type: 'string', enum: ['current'] },
    topGap: PROJECT_SOURCE_GAP_SCHEMA,
    nextAction: PROJECT_SOURCE_ACTION_SCHEMA,
    witnessSummary: {
      type: 'object',
      properties: {
        total: { type: 'integer', minimum: 0 },
        supported: { type: 'integer', minimum: 0 },
        missing: { type: 'integer', minimum: 0 },
      },
      required: ['total', 'supported', 'missing'],
      additionalProperties: false,
    },
    witnesses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: NON_BLANK_STRING_SCHEMA,
          nodeSlug: NON_BLANK_STRING_SCHEMA,
          role: NON_BLANK_STRING_SCHEMA,
          path: NON_BLANK_STRING_SCHEMA,
          supported: { type: 'boolean' },
        },
        required: ['id', 'nodeSlug', 'role', 'path', 'supported'],
        additionalProperties: false,
      },
    },
    diagnostics: {
      type: 'object',
      properties: {
        dirty: { type: ['boolean', 'null'] },
        truncated: { type: 'boolean' },
      },
      required: ['dirty', 'truncated'],
      additionalProperties: false,
    },
  },
  required: [
    'contractVersion', 'projectSlug', 'sourceId', 'sourceKind',
    'sourceRevision', 'sourceFingerprint', 'graphHash', 'measuredAt',
    'status', 'currentness', 'topGap', 'nextAction', 'witnessSummary',
    'witnesses', 'diagnostics',
  ],
  additionalProperties: false,
});
const PROJECT_SOURCE_BINDING_VIEW_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    rootPath: NON_BLANK_STRING_SCHEMA,
    kind: { type: 'string', enum: ['git', 'folder'] },
    sourceId: NON_BLANK_STRING_SCHEMA,
    dirty: { type: ['boolean', 'null'] },
    truncated: { type: 'boolean' },
    inventoryFiles: { type: 'integer', minimum: 0 },
  },
  required: ['rootPath', 'kind', 'sourceId', 'dirty', 'truncated', 'inventoryFiles'],
  additionalProperties: false,
});
const PROJECT_SOURCE_VIEW_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    contractVersion: { type: 'integer', enum: [1] },
    projectSlug: NON_BLANK_STRING_SCHEMA,
    status: { type: 'string', enum: ['not_measured', 'invalid', 'review_required', 'needs_evidence', 'verified_current'] },
    currentness: { type: 'string', enum: ['unavailable', 'stale', 'current'] },
    measuredAt: { type: ['string', 'null'], format: 'date-time' },
    topGap: PROJECT_SOURCE_GAP_SCHEMA,
    nextAction: PROJECT_SOURCE_ACTION_SCHEMA,
    bindingCardinality: { type: 'integer', minimum: 0 },
    receipt: { anyOf: [PROJECT_SOURCE_RECEIPT_SCHEMA, { type: 'null' }] },
  },
  required: [
    'contractVersion', 'projectSlug', 'status', 'currentness', 'measuredAt',
    'topGap', 'nextAction', 'bindingCardinality', 'receipt',
  ],
  additionalProperties: false,
});
const PROJECT_SOURCE_TOOL_CALL_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    name: NON_BLANK_STRING_SCHEMA,
    arguments: { type: 'object', additionalProperties: true },
  },
  required: ['name', 'arguments'],
  additionalProperties: false,
});
const PROJECT_SOURCE_CLI_CALL_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    command: NON_BLANK_STRING_SCHEMA,
    args: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
  },
  required: ['command', 'args'],
  additionalProperties: false,
});
const PROJECT_SOURCE_UNDO_SCHEMA = Object.freeze({
  type: ['object', 'null'],
  properties: {
    tool: PROJECT_SOURCE_TOOL_CALL_SCHEMA,
    cli: PROJECT_SOURCE_CLI_CALL_SCHEMA,
  },
  required: ['tool', 'cli'],
  additionalProperties: false,
});
const PROJECT_SOURCE_REMEDY_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    contract: { type: 'string', enum: ['projectSourceRemedy:v1'] },
    actionId: { type: ['string', 'null'] },
    resolvable: { type: 'boolean' },
    automatable: { type: 'boolean' },
    requiresHuman: { type: 'string', enum: ['none', 'path_choice', 'authoring'] },
    requiresConfirm: { type: 'boolean' },
    inferRoot: { type: 'boolean' },
    tool: { anyOf: [PROJECT_SOURCE_TOOL_CALL_SCHEMA, { type: 'null' }] },
    cli: { anyOf: [PROJECT_SOURCE_CLI_CALL_SCHEMA, { type: 'null' }] },
    undo: PROJECT_SOURCE_UNDO_SCHEMA,
  },
  required: [
    'contract', 'actionId', 'resolvable', 'automatable', 'requiresHuman',
    'requiresConfirm', 'inferRoot', 'tool', 'cli', 'undo',
  ],
  additionalProperties: false,
});
const PROJECT_SOURCE_NEXT_CALL_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    tool: { type: 'string', enum: ['connect_project_source', 'disconnect_project_source'] },
    arguments: { type: 'object', additionalProperties: true },
  },
  required: ['tool', 'arguments'],
  additionalProperties: false,
});
const RELATION_RESULT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    to: NON_BLANK_STRING_SCHEMA,
    type: { ...NON_BLANK_STRING_SCHEMA, enum: RELATION_TYPE_VALUES },
    key: NON_BLANK_STRING_SCHEMA,
  },
  required: ['to', 'type', 'key'],
  additionalProperties: false,
});
const IMPORT_RECONCILIATION_EDGE_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    from: NON_BLANK_STRING_SCHEMA,
    to: NON_BLANK_STRING_SCHEMA,
    count: { type: 'integer', minimum: 1 },
    absentEndpoints: { type: 'array', maxItems: 2, uniqueItems: true, items: NON_BLANK_STRING_SCHEMA },
    sourceEvidence: {
      type: 'array', maxItems: 5,
      items: {
        type: 'object',
        properties: {
          from: NON_BLANK_STRING_SCHEMA,
          to: NON_BLANK_STRING_SCHEMA,
          kind: { type: 'string', enum: IMPORT_EDGE_KIND_VALUES },
          sourceRole: { type: 'string', enum: IMPORT_SOURCE_ROLE_VALUES },
          importUsage: { type: 'string', enum: IMPORT_USAGE_VALUES },
        },
        required: ['from', 'to', 'kind', 'sourceRole', 'importUsage'],
        additionalProperties: false,
      },
    },
    sourceEvidenceLimited: { type: 'boolean' },
    evidenceQualification: {
      type: 'object',
      properties: {
        basis: { type: 'string', enum: ['whole_module_edge'] },
        sourceRoleCounts: {
          type: 'object',
          properties: Object.fromEntries(IMPORT_SOURCE_ROLE_VALUES.map((value) => [value, { type: 'integer', minimum: 0 }])),
          required: IMPORT_SOURCE_ROLE_VALUES,
          additionalProperties: false,
        },
        importUsageCounts: {
          type: 'object',
          properties: Object.fromEntries(IMPORT_USAGE_VALUES.map((value) => [value, { type: 'integer', minimum: 0 }])),
          required: IMPORT_USAGE_VALUES,
          additionalProperties: false,
        },
        productValueCount: { type: 'integer', minimum: 0 },
        status: { type: 'string', enum: ['product_value_observed', 'product_value_not_observed'] },
      },
      required: ['basis', 'sourceRoleCounts', 'importUsageCounts', 'productValueCount', 'status'],
      additionalProperties: false,
    },
    review: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['rationale_review_required'] },
        writeAllowed: { type: 'boolean', enum: [false] },
        required: { type: 'array', minItems: 1, items: NON_BLANK_STRING_SCHEMA },
        next: NON_BLANK_STRING_SCHEMA,
      },
      required: ['status', 'writeAllowed', 'required', 'next'],
      additionalProperties: false,
    },
    ref: NON_BLANK_STRING_SCHEMA,
    via: NON_BLANK_STRING_SCHEMA,
  },
  required: ['from', 'to'],
  additionalProperties: false,
});
const IMPORT_RECONCILIATION_SUMMARY_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    inBoth: { type: 'integer', minimum: 0 },
    inCodeMissingFromVault: { type: 'integer', minimum: 0 },
    inCodeMissingEndpointAbsent: { type: 'integer', minimum: 0 },
    inVaultNotInCode: { type: 'integer', minimum: 0 },
    unresolvedImports: { type: 'integer', minimum: 0 },
    hint: { type: 'string' },
  },
  required: ['inBoth', 'inCodeMissingFromVault', 'inCodeMissingEndpointAbsent', 'inVaultNotInCode', 'unresolvedImports', 'hint'],
  additionalProperties: false,
});
const IMPORT_STALE_EDGE_FOLLOW_UP_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['not_present', 'full_follow_up_required'] },
    count: { type: 'integer', minimum: 0 },
    nextCall: {
      type: ['object', 'null'],
      properties: {
        tool: { type: 'string', enum: ['infer_imports'] },
        arguments: {
          type: 'object',
          properties: {
            rootPath: NON_BLANK_STRING_SCHEMA,
            reviewMode: { type: 'string', enum: ['full'] },
            allowLargeResponse: { type: 'boolean', enum: [true] },
          },
          required: ['rootPath', 'reviewMode', 'allowLargeResponse'],
          additionalProperties: false,
        },
        purpose: NON_BLANK_STRING_SCHEMA,
      },
      required: ['tool', 'arguments', 'purpose'],
      additionalProperties: false,
    },
  },
  required: ['status', 'count', 'nextCall'],
  additionalProperties: false,
});
const VAULT_ISSUE_CODE_DESCRIPTION = VAULT_ISSUE_CODE_VALUES.map((code) => `\`${code}\``).join(', ');
const IMPORT_EDGE_KIND_DESCRIPTION = IMPORT_EDGE_KIND_VALUES.join(', ');
const NODE_KIND_DESCRIPTION = NODE_KIND_VALUES.join(', ');
const EDGE_TARGET_KIND_DESCRIPTION = EDGE_TARGET_KIND_VALUES.join(', ');
const POST_WRITE_MAINTENANCE_GUIDANCE =
  'compact `postWriteMaintenance` (maintenance_plan) with count-safe `byPhase` / `bySeverity` / `byKind` queue buckets, action `score`, executable `proposedAction`, and current-page `nextExecutableAction` / `nextReviewAction` pointers';
const COMPACT_MAINTENANCE_PROPOSED_ACTION_TOOLS = Object.freeze(['add_concept', 'add_relation', 'patch_concept']);
const COMPACT_MAINTENANCE_PROPOSED_ACTION_ARGS_OUTPUT_SCHEMA = Object.freeze({
  oneOf: [
    {
      type: 'object',
      properties: {
        slug: NON_BLANK_STRING_SCHEMA,
        kind: { ...NON_BLANK_STRING_SCHEMA, enum: NODE_KIND_VALUES },
        title: NON_BLANK_STRING_SCHEMA,
      },
      required: ['slug', 'kind', 'title'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        from: NON_BLANK_STRING_SCHEMA,
        to: NON_BLANK_STRING_SCHEMA,
        type: { ...NON_BLANK_STRING_SCHEMA, enum: WRITE_RELATION_TYPE_VALUES },
        why: {
          type: 'string',
          maxLength: 300,
          description:
            'One-line rationale for this relation ("A leans on B because ..."). Stored in the SAME frontmatter write as the ref (relation_notes map) — write it whenever you know the reason; a graph edge without a why is a mind-map line, not an ontology claim.',
        },
      },
      required: ['from', 'to', 'type'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        slug: NON_BLANK_STRING_SCHEMA,
        frontmatter: RELATION_ARRAY_PATCH_SCHEMA,
        expected_mtime: { type: 'number', minimum: 0 },
      },
      required: ['slug', 'frontmatter', 'expected_mtime'],
      additionalProperties: false,
    },
  ],
});
const COMPACT_MAINTENANCE_NODE_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    slug: NON_BLANK_STRING_SCHEMA,
    kind: { ...NON_BLANK_STRING_SCHEMA, enum: NODE_KIND_VALUES },
    title: NON_BLANK_STRING_SCHEMA,
  },
  required: ['slug', 'kind', 'title'],
  additionalProperties: false,
});
const COMPACT_MAINTENANCE_PROPOSED_ACTION_OUTPUT_SCHEMA = Object.freeze({
  type: ['object', 'null'],
  properties: {
    tool: { ...NON_BLANK_STRING_SCHEMA, enum: COMPACT_MAINTENANCE_PROPOSED_ACTION_TOOLS },
    args: COMPACT_MAINTENANCE_PROPOSED_ACTION_ARGS_OUTPUT_SCHEMA,
  },
  required: ['tool', 'args'],
  additionalProperties: false,
});
const COMPACT_MAINTENANCE_ACTION_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    id: NON_BLANK_STRING_SCHEMA,
    phase: { ...NON_BLANK_STRING_SCHEMA, enum: MAINTENANCE_PHASE_VALUES },
    kind: { ...NON_BLANK_STRING_SCHEMA, enum: MAINTENANCE_KIND_VALUES },
    severity: { ...NON_BLANK_STRING_SCHEMA, enum: MAINTENANCE_SEVERITY_VALUES },
    score: { type: 'number', minimum: 0 },
    executable: { type: 'boolean' },
    reason: NON_BLANK_STRING_SCHEMA,
    proposedAction: COMPACT_MAINTENANCE_PROPOSED_ACTION_OUTPUT_SCHEMA,
    node: COMPACT_MAINTENANCE_NODE_OUTPUT_SCHEMA,
    nodes: {
      type: ['array', 'object'],
      items: COMPACT_MAINTENANCE_NODE_OUTPUT_SCHEMA,
      additionalProperties: COMPACT_MAINTENANCE_NODE_OUTPUT_SCHEMA,
    },
  },
  required: ['id', 'phase', 'kind', 'severity', 'score', 'executable', 'reason', 'proposedAction'],
  additionalProperties: false,
});
const NULLABLE_COMPACT_MAINTENANCE_ACTION_OUTPUT_SCHEMA = Object.freeze({
  ...COMPACT_MAINTENANCE_ACTION_OUTPUT_SCHEMA,
  type: ['object', 'null'],
});
const POST_WRITE_MAINTENANCE_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  description:
    'Compact maintenance_plan summary for post-write follow-up. Bucket maps describe the remaining queue after the write.',
  properties: {
    operation: { type: 'string', enum: ['maintenance_plan'] },
    sideEffect: { type: 'boolean' },
    graphHash: { type: 'string' },
    summary: {
      type: 'object',
      properties: {
        totalActions: { type: 'integer', minimum: 0 },
        filteredActions: { type: 'integer', minimum: 0 },
        remainingActions: { type: 'integer', minimum: 0 },
        executableActions: { type: 'integer', minimum: 0 },
        reviewActions: { type: 'integer', minimum: 0 },
        compileIssues: { type: 'integer', minimum: 0 },
        dependencyCycles: { type: 'integer', minimum: 0 },
        canonicalizationActions: { type: 'integer', minimum: 0 },
        danglingReferences: { type: 'integer', minimum: 0 },
        relationRecommendations: { type: 'integer', minimum: 0 },
        externalElementRefs: { type: 'integer', minimum: 0 },
        externalElementRefsIgnored: { type: 'integer', minimum: 0 },
        unassignedNodes: { type: 'integer', minimum: 0 },
        emptyDomains: { type: 'integer', minimum: 0 },
      },
      required: [
        'totalActions',
        'filteredActions',
        'remainingActions',
        'executableActions',
        'reviewActions',
        'compileIssues',
        'dependencyCycles',
        'canonicalizationActions',
        'danglingReferences',
        'relationRecommendations',
        'externalElementRefs',
        'externalElementRefsIgnored',
        'unassignedNodes',
        'emptyDomains',
      ],
      additionalProperties: false,
    },
    filters: {
      type: 'object',
      properties: {
        executableOnly: { type: 'boolean' },
        phases: { type: 'array', items: { ...NON_BLANK_STRING_SCHEMA, enum: MAINTENANCE_PHASE_VALUES } },
        severities: { type: 'array', items: { ...NON_BLANK_STRING_SCHEMA, enum: MAINTENANCE_SEVERITY_VALUES } },
        kinds: { type: 'array', items: { ...NON_BLANK_STRING_SCHEMA, enum: MAINTENANCE_KIND_VALUES } },
      },
      required: ['executableOnly', 'phases', 'severities', 'kinds'],
      additionalProperties: false,
    },
    cursor: {
      type: 'object',
      properties: {
        afterActionId: { type: ['string', 'null'] },
        found: { type: 'boolean' },
        reason: { type: ['string', 'null'] },
        startIndex: { type: ['integer', 'null'], minimum: 0 },
        nextAfterActionId: { type: ['string', 'null'] },
        hasMore: { type: 'boolean' },
      },
      required: ['afterActionId', 'found', 'reason', 'startIndex', 'nextAfterActionId', 'hasMore'],
      additionalProperties: false,
    },
    byPhase: { type: 'object', additionalProperties: { type: 'integer', minimum: 0 } },
    bySeverity: { type: 'object', additionalProperties: { type: 'integer', minimum: 0 } },
    byKind: { type: 'object', additionalProperties: { type: 'integer', minimum: 0 } },
    limited: { type: 'boolean' },
    nextExecutableAction: {
      ...NULLABLE_COMPACT_MAINTENANCE_ACTION_OUTPUT_SCHEMA,
      description: 'First executable action in the current compact page, or null.',
    },
    nextReviewAction: {
      ...NULLABLE_COMPACT_MAINTENANCE_ACTION_OUTPUT_SCHEMA,
      description: 'First review action in the current compact page, or null.',
    },
    actions: { type: 'array', items: COMPACT_MAINTENANCE_ACTION_OUTPUT_SCHEMA },
  },
  required: [
    'operation',
    'sideEffect',
    'graphHash',
    'summary',
    'filters',
    'cursor',
    'byPhase',
    'bySeverity',
    'byKind',
    'limited',
    'nextExecutableAction',
    'nextReviewAction',
    'actions',
  ],
  additionalProperties: false,
});

const MEANING_ASSESSMENT_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    contract: { type: 'string', enum: ['meaningAssessment:v1'] },
    projectSlug: { type: ['string', 'null'] },
    status: {
      type: 'string',
      enum: ['verified_current', 'review_required', 'needs_evidence', 'invalid'],
    },
    dimensions: {
      type: 'object',
      properties: {
        structure: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['ready', 'needs_structure', 'invalid'] },
            basis: { type: 'string', enum: ['structure_only'] },
          },
          required: ['status', 'basis'],
          additionalProperties: false,
        },
        competency: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['answered', 'needs_evidence'] },
            questions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: NON_BLANK_STRING_SCHEMA,
                  status: { type: 'string', enum: ['answered', 'partial', 'visible-gap', 'unassessed'] },
                  witnessStatus: { type: 'string', enum: ['resolved', 'missing', 'unavailable'] },
                },
                required: ['id', 'status', 'witnessStatus'],
                additionalProperties: false,
              },
            },
          },
          required: ['status', 'questions'],
          additionalProperties: false,
        },
        source: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['not_measured', 'needs_evidence', 'review_required', 'invalid', 'verified_current'],
            },
            currentness: { type: 'string', enum: ['current', 'stale', 'unavailable'] },
          },
          required: ['status', 'currentness'],
          additionalProperties: false,
        },
      },
      required: ['structure', 'competency', 'source'],
      additionalProperties: false,
    },
    topGap: {
      type: ['object', 'null'],
      properties: {
        dimension: NON_BLANK_STRING_SCHEMA,
        id: NON_BLANK_STRING_SCHEMA,
        questionId: NON_BLANK_STRING_SCHEMA,
      },
      required: ['dimension', 'id'],
      additionalProperties: false,
    },
    nextAction: {
      type: 'object',
      properties: {
        id: NON_BLANK_STRING_SCHEMA,
        target: NON_BLANK_STRING_SCHEMA,
      },
      required: ['id'],
      additionalProperties: false,
    },
    provenance: {
      type: 'object',
      properties: {
        evaluator: NON_BLANK_STRING_SCHEMA,
        graphHash: { type: ['string', 'null'] },
        competencyContract: { type: ['string', 'null'] },
        competencyEvaluator: { type: ['string', 'null'] },
        competencyGraphHash: { type: ['string', 'null'] },
        witnessInventoryContract: { type: ['string', 'null'] },
        witnessInventoryGraphHash: { type: ['string', 'null'] },
        witnessInventorySourceFingerprint: { type: ['string', 'null'] },
        sourceGraphHash: { type: ['string', 'null'] },
        sourceReceiptContractVersion: { type: ['integer', 'null'] },
        sourceId: { type: ['string', 'null'] },
        sourceRevision: { type: ['string', 'null'] },
        sourceFingerprint: { type: ['string', 'null'] },
        sourceMeasuredAt: { type: ['string', 'null'] },
        sourceGapId: { type: ['string', 'null'] },
      },
      required: [
        'evaluator',
        'graphHash',
        'competencyContract',
        'competencyEvaluator',
        'competencyGraphHash',
        'witnessInventoryContract',
        'witnessInventoryGraphHash',
        'witnessInventorySourceFingerprint',
        'sourceGraphHash',
        'sourceReceiptContractVersion',
        'sourceId',
        'sourceRevision',
        'sourceFingerprint',
        'sourceMeasuredAt',
        'sourceGapId',
      ],
      additionalProperties: false,
    },
  },
  required: ['contract', 'projectSlug', 'status', 'dimensions', 'topGap', 'nextAction', 'provenance'],
  additionalProperties: false,
});

function nonBlankStringSchema(description, extra = {}) {
  return {
    ...NON_BLANK_STRING_SCHEMA,
    ...extra,
    description,
  };
}

function paginationOutputSchema() {
  return {
    type: 'object',
    properties: {
      offset: { type: 'integer', minimum: 0 },
      limit: { type: 'integer', minimum: 0 },
      total: { type: 'integer', minimum: 0 },
      returned: { type: 'integer', minimum: 0 },
      hasMore: { type: 'boolean' },
      nextOffset: { type: ['integer', 'null'], minimum: 0 },
    },
    required: ['offset', 'limit', 'total', 'returned', 'hasMore', 'nextOffset'],
    additionalProperties: false,
  };
}

const QUERY_ONTOLOGY_OPERATION_UNION = QUERY_ONTOLOGY_OPERATIONS
  .map((operation) => `'${operation}'`)
  .join('|');
const QUERY_PLAN_TARGET_OPERATION_UNION = QUERY_PLAN_TARGET_OPERATIONS
  .map((operation) => `'${operation}'`)
  .join('|');
const RELATION_TYPE_UNION = RELATION_TYPE_VALUES
  .map((type) => `'${type}'`)
  .join('|');
const ADD_RELATION_TYPE_SCHEMA = { ...NON_BLANK_STRING_SCHEMA, enum: WRITE_RELATION_TYPE_VALUES };
const GIT_FILE_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    path: NON_BLANK_STRING_SCHEMA,
    index: { type: 'string', minLength: 1, maxLength: 1 },
    worktree: { type: 'string', minLength: 1, maxLength: 1 },
    status: { type: 'string', enum: ['untracked', 'added', 'modified', 'deleted'] },
    staged: { type: 'boolean' },
    unstaged: { type: 'boolean' },
  },
  required: ['path', 'index', 'worktree', 'status', 'staged', 'unstaged'],
  additionalProperties: false,
});
const GIT_COUNTS_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    total: { type: 'integer', minimum: 0 },
    staged: { type: 'integer', minimum: 0 },
    unstaged: { type: 'integer', minimum: 0 },
    untracked: { type: 'integer', minimum: 0 },
    outsideVault: { type: 'integer', minimum: 0 },
    stagedOutsideVault: { type: 'integer', minimum: 0 },
  },
  required: ['total', 'staged', 'unstaged', 'untracked', 'outsideVault', 'stagedOutsideVault'],
  additionalProperties: false,
});
const GIT_RISK_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    level: { type: 'string', enum: ['low', 'medium', 'high'] },
    warnings: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
  },
  required: ['level', 'warnings'],
  additionalProperties: false,
});
const DESTRUCTIVE_PREVIEW_OUTPUT_PROPERTIES = Object.freeze({
  previewReady: {
    type: 'boolean',
    description: 'True only when this response is a complete dry-run preview that an agent can review.',
  },
  canConfirm: {
    type: 'boolean',
    description: 'True only when repeating the call with confirm:true can perform the previewed change without another explicit safety opt-in.',
  },
  wouldChange: {
    type: 'boolean',
    description: 'True only when the dry-run predicts a disk or Git change.',
  },
  blockedReasons: {
    type: 'array',
    items: NON_BLANK_STRING_SCHEMA,
    description: 'Machine-readable human explanations for every condition currently blocking confirmation.',
  },
});
const DESTRUCTIVE_PREVIEW_REQUIRED = Object.freeze([
  'previewReady',
  'canConfirm',
  'wouldChange',
  'blockedReasons',
]);
const GIT_RESULT_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    operation: { type: 'string', enum: ['git_status', 'git_snapshot'] },
    ok: { type: 'boolean' },
    reason: NON_BLANK_STRING_SCHEMA,
    repoRoot: NON_BLANK_STRING_SCHEMA,
    vaultRoot: NON_BLANK_STRING_SCHEMA,
    vaultPathspec: NON_BLANK_STRING_SCHEMA,
    head: { type: ['string', 'null'] },
    branch: { type: ['string', 'null'] },
    detachedHead: { type: 'boolean' },
    operationInProgress: { type: ['string', 'null'] },
    counts: GIT_COUNTS_OUTPUT_SCHEMA,
    files: { type: 'array', items: GIT_FILE_OUTPUT_SCHEMA },
    stagedOutsideVault: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
    risk: GIT_RISK_OUTPUT_SCHEMA,
    dryRun: { type: 'boolean' },
    committed: { type: 'boolean' },
    expectedHead: { type: ['string', 'null'] },
    previousHead: NON_BLANK_STRING_SCHEMA,
    subject: NON_BLANK_STRING_SCHEMA,
    commitHash: NON_BLANK_STRING_SCHEMA,
    commitSummary: { type: 'string' },
    pushSupported: { type: 'boolean' },
    pushReason: NON_BLANK_STRING_SCHEMA,
    validation: {
      type: 'object',
      properties: {
        scanned: { type: 'integer', minimum: 0 },
        problemFiles: { type: 'integer', minimum: 0 },
        errorFiles: { type: 'integer', minimum: 0 },
        warningFiles: { type: 'integer', minimum: 0 },
        pathDrifts: { type: 'integer', minimum: 0 },
      },
      required: ['scanned', 'problemFiles', 'errorFiles', 'warningFiles', 'pathDrifts'],
      additionalProperties: false,
    },
  },
  required: ['operation', 'ok', 'repoRoot', 'vaultRoot'],
  additionalProperties: false,
});


const GIT_SNAPSHOT_OUTPUT_SCHEMA = Object.freeze({
  ...GIT_RESULT_OUTPUT_SCHEMA,
  properties: {
    ...GIT_RESULT_OUTPUT_SCHEMA.properties,
    ...DESTRUCTIVE_PREVIEW_OUTPUT_PROPERTIES,
  },
  required: [
    ...GIT_RESULT_OUTPUT_SCHEMA.required,
    'dryRun',
    'committed',
    ...DESTRUCTIVE_PREVIEW_REQUIRED,
  ],
});
const GIT_HISTORY_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    operation: { type: 'string', enum: ['git_history'] },
    ok: { type: 'boolean' },
    reason: NON_BLANK_STRING_SCHEMA,
    repoRoot: NON_BLANK_STRING_SCHEMA,
    vaultRoot: NON_BLANK_STRING_SCHEMA,
    vaultPathspec: NON_BLANK_STRING_SCHEMA,
    head: { type: ['string', 'null'] },
    branch: { type: ['string', 'null'] },
    limit: { type: 'integer', minimum: 1, maximum: 100 },
    count: { type: 'integer', minimum: 0 },
    limited: { type: 'boolean' },
    hasMore: { type: 'boolean' },
    shallow: { type: 'boolean' },
    historyComplete: { type: 'boolean' },
    commits: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          hash: NON_BLANK_STRING_SCHEMA,
          shortHash: NON_BLANK_STRING_SCHEMA,
          authoredAt: NON_BLANK_STRING_SCHEMA,
          subject: { type: 'string' },
        },
        required: ['hash', 'shortHash', 'authoredAt', 'subject'],
        additionalProperties: false,
      },
    },
  },
  required: ['operation', 'ok', 'repoRoot', 'vaultRoot'],
  additionalProperties: false,
});

export {
  NON_BLANK_STRING_SCHEMA,
  BACKLINK_REWRITE_VALUE_OUTPUT_SCHEMA,
  GRAPH_REF_ARRAY_MAX_ITEMS,
  LOCALE_LABELS_SCHEMA,
  IGNORE_ARRAY_MAX_ITEMS,
  SOURCE_FOLDER_ARRAY_MAX_ITEMS,
  MEANING_GATE_EVIDENCE_ROW_LIMIT,
  MEANING_GATE_REVIEW_ROW_LIMIT,
  BUSINESS_EVIDENCE_ROW_SCHEMA,
  REVIEW_REQUIRED_CAPABILITY_ROW_SCHEMA,
  PROPOSED_BUSINESS_CONCEPT_ROW_SCHEMA,
  SEMANTIC_EVIDENCE_ROW_SCHEMA,
  RUST_FEATURE_REFERENCE_OUTPUT_SCHEMA,
  RUST_FEATURE_CONFIGURATION_EVIDENCE_OUTPUT_SCHEMA,
  IMPORT_SCAN_COVERAGE_OUTPUT_SCHEMA,
  GO_PACKAGE_IMPORT_ROW_SCHEMA,
  GO_PACKAGE_IMPORT_MODULE_EDGE_SCHEMA,
  GO_PACKAGE_IMPORT_EVIDENCE_OUTPUT_SCHEMA,
  GO_PACKAGE_IMPORT_EVIDENCE_SUMMARY_SCHEMA,
  MEANING_PROPOSAL_CONCEPT_INPUT_PROPERTIES,
  COMPETENCY_RELATION_WITNESS_SCHEMA,
  COMPETENCY_WITNESSES_SCHEMA,
  COMPETENCY_ANSWER_SCHEMA,
  COMPETENCY_ANSWERS_SCHEMA,
  MEANING_PROPOSAL_INPUT_SCHEMA,
  MEANING_WRITE_PLAN_OUTPUT_SCHEMA,
  CONSTRUCTION_LIFECYCLE_OUTPUT_SCHEMA,
  MEANING_PROPOSAL_VALIDATION_OUTPUT_SCHEMA,
  EXTRACTION_CONTRACT_OUTPUT_SCHEMA,
  RELATION_ARRAY_PATCH_SCHEMA,
  BACKLINK_REWRITE_KEY_CHANGE_OUTPUT_SCHEMA,
  BACKLINK_REWRITE_UPDATE_OUTPUT_SCHEMA,
  BACKLINK_REWRITE_PLAN_OUTPUT_SCHEMA,
  BACKLINK_ROW_OUTPUT_SCHEMA,
  CAPTURED_DOC_OUTPUT_SCHEMA,
  VAULT_WARNING_OUTPUT_SCHEMA,
  CONCEPT_NEIGHBORS_OUTPUT_SCHEMA,
  EDGE_RATIONALE_OUTPUT_SCHEMA,
  OUTGOING_EDGE_OUTPUT_SCHEMA,
  BODY_DELIVERY_MODES,
  BODY_INFO_OUTPUT_SCHEMA,
  GROWTH_HINT_OUTPUT_SCHEMA,
  PROJECT_SOURCE_GAP_SCHEMA,
  PROJECT_SOURCE_ACTION_SCHEMA,
  PROJECT_SOURCE_RECEIPT_SCHEMA,
  PROJECT_SOURCE_BINDING_VIEW_SCHEMA,
  PROJECT_SOURCE_VIEW_SCHEMA,
  PROJECT_SOURCE_TOOL_CALL_SCHEMA,
  PROJECT_SOURCE_CLI_CALL_SCHEMA,
  PROJECT_SOURCE_UNDO_SCHEMA,
  PROJECT_SOURCE_REMEDY_SCHEMA,
  PROJECT_SOURCE_NEXT_CALL_SCHEMA,
  RELATION_RESULT_SCHEMA,
  IMPORT_RECONCILIATION_EDGE_SCHEMA,
  IMPORT_RECONCILIATION_SUMMARY_SCHEMA,
  IMPORT_STALE_EDGE_FOLLOW_UP_SCHEMA,
  VAULT_ISSUE_CODE_DESCRIPTION,
  IMPORT_EDGE_KIND_DESCRIPTION,
  NODE_KIND_DESCRIPTION,
  EDGE_TARGET_KIND_DESCRIPTION,
  POST_WRITE_MAINTENANCE_GUIDANCE,
  COMPACT_MAINTENANCE_PROPOSED_ACTION_TOOLS,
  COMPACT_MAINTENANCE_PROPOSED_ACTION_ARGS_OUTPUT_SCHEMA,
  COMPACT_MAINTENANCE_NODE_OUTPUT_SCHEMA,
  COMPACT_MAINTENANCE_PROPOSED_ACTION_OUTPUT_SCHEMA,
  COMPACT_MAINTENANCE_ACTION_OUTPUT_SCHEMA,
  NULLABLE_COMPACT_MAINTENANCE_ACTION_OUTPUT_SCHEMA,
  POST_WRITE_MAINTENANCE_OUTPUT_SCHEMA,
  MEANING_ASSESSMENT_OUTPUT_SCHEMA,
  nonBlankStringSchema,
  paginationOutputSchema,
  QUERY_ONTOLOGY_OPERATION_UNION,
  QUERY_PLAN_TARGET_OPERATION_UNION,
  RELATION_TYPE_UNION,
  ADD_RELATION_TYPE_SCHEMA,
  GIT_FILE_OUTPUT_SCHEMA,
  GIT_COUNTS_OUTPUT_SCHEMA,
  GIT_RISK_OUTPUT_SCHEMA,
  DESTRUCTIVE_PREVIEW_OUTPUT_PROPERTIES,
  DESTRUCTIVE_PREVIEW_REQUIRED,
  GIT_RESULT_OUTPUT_SCHEMA,
  GIT_SNAPSHOT_OUTPUT_SCHEMA,
  GIT_HISTORY_OUTPUT_SCHEMA,
};
