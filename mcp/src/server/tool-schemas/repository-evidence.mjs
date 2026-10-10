// Business, semantic, Rust, Go and import evidence schemas.

import {
  IMPORT_EDGE_KIND_VALUES,
  IMPORT_SOURCE_ROLE_VALUES,
  IMPORT_USAGE_VALUES,
} from '../../infer-imports.mjs';
import { IGNORE_ARRAY_MAX_ITEMS, SOURCE_FOLDER_ARRAY_MAX_ITEMS } from './array-limits.mjs';
import { NON_BLANK_STRING_SCHEMA } from './field-primitives.mjs';

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

export {
  BUSINESS_EVIDENCE_ROW_SCHEMA,
  REVIEW_REQUIRED_CAPABILITY_ROW_SCHEMA,
  PROPOSED_BUSINESS_CONCEPT_ROW_SCHEMA,
  SEMANTIC_EVIDENCE_ROW_SCHEMA,
  RUST_FEATURE_CONFIGURATION_EVIDENCE_OUTPUT_SCHEMA,
  IMPORT_SCAN_COVERAGE_OUTPUT_SCHEMA,
  GO_PACKAGE_IMPORT_EVIDENCE_OUTPUT_SCHEMA,
  GO_PACKAGE_IMPORT_EVIDENCE_SUMMARY_SCHEMA,
  IMPORT_RECONCILIATION_EDGE_SCHEMA,
  IMPORT_RECONCILIATION_SUMMARY_SCHEMA,
  IMPORT_STALE_EDGE_FOLLOW_UP_SCHEMA,
};
