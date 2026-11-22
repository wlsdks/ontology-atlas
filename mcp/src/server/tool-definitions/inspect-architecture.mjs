import { NON_BLANK_STRING_SCHEMA } from '../tool-schemas/field-primitives.mjs';

export const INSPECT_ARCHITECTURE_TOOL = {
  name: 'inspect_architecture',
  description:
    'Check the repository\'s imports against a reviewed architecture-profile/v1 document in the vault and return an architectureBrief:v1 of conforms, violated and unknown; unsupported languages, unclassified import usage and unmapped imports never count as compliance. side effect 0.',
  inputSchema: {
    type: 'object',
    properties: {
      rootPath: {
        ...NON_BLANK_STRING_SCHEMA,
        description:
          'Defaults to the active repository root.',
      },
      profileSlug: {
        ...NON_BLANK_STRING_SCHEMA,
        description:
          'Optional when the vault has one architecture profile.',
      },
      maxFiles: {
        type: 'integer',
        minimum: 1,
        maximum: 50000,
        description: 'Default 5000.',
      },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      contract: { type: 'string', enum: ['architectureBrief:v1'] },
      sideEffect: { type: 'integer', enum: [0] },
      profile: {
        type: 'object',
        properties: {
          uid: { ...NON_BLANK_STRING_SCHEMA },
          slug: { ...NON_BLANK_STRING_SCHEMA },
          projectUid: { ...NON_BLANK_STRING_SCHEMA },
          title: { ...NON_BLANK_STRING_SCHEMA },
          patterns: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                axis: { ...NON_BLANK_STRING_SCHEMA },
                name: { ...NON_BLANK_STRING_SCHEMA },
              },
              required: ['axis', 'name'],
              additionalProperties: false,
            },
          },
          scopePaths: { type: 'array', items: { ...NON_BLANK_STRING_SCHEMA } },
          excludePaths: { type: 'array', items: { ...NON_BLANK_STRING_SCHEMA } },
          roles: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { ...NON_BLANK_STRING_SCHEMA },
                paths: { type: 'array', items: { ...NON_BLANK_STRING_SCHEMA } },
                allowedDependencies: {
                  type: ['array', 'null'],
                  items: { ...NON_BLANK_STRING_SCHEMA },
                },
              },
              required: ['id', 'paths', 'allowedDependencies'],
              additionalProperties: false,
            },
          },
          dependencyPolicy: { type: 'string', enum: ['explicit', 'lower-only'] },
          dependencyUsages: {
            type: 'array',
            minItems: 1,
            uniqueItems: true,
            items: { type: 'string', enum: ['value', 'type_only'] },
          },
          evidence: { type: 'array', items: { ...NON_BLANK_STRING_SCHEMA } },
        },
        required: [
          'uid',
          'slug',
          'projectUid',
          'title',
          'patterns',
          'scopePaths',
          'excludePaths',
          'roles',
          'dependencyPolicy',
          'dependencyUsages',
          'evidence',
        ],
        additionalProperties: false,
      },
      conformance: {
        type: 'object',
        properties: {
          contract: { type: 'string', enum: ['architectureConformance:v1'] },
          status: { type: 'string', enum: ['conforms', 'violated', 'unknown'] },
          roles: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { ...NON_BLANK_STRING_SCHEMA },
                paths: { type: 'array', items: { ...NON_BLANK_STRING_SCHEMA } },
                matchedFileCount: { type: 'integer', minimum: 0 },
                matchedFiles: { type: 'array', items: { ...NON_BLANK_STRING_SCHEMA } },
                matchedFilesLimited: { type: 'boolean' },
              },
              required: ['id', 'paths', 'matchedFileCount', 'matchedFiles', 'matchedFilesLimited'],
              additionalProperties: false,
            },
          },
          observedRoleEdges: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                fromRole: { ...NON_BLANK_STRING_SCHEMA },
                toRole: { ...NON_BLANK_STRING_SCHEMA },
                count: { type: 'integer', minimum: 0 },
                importUsageCounts: {
                  type: 'object',
                  properties: {
                    value: { type: 'integer', minimum: 0 },
                    type_only: { type: 'integer', minimum: 0 },
                    unknown: { type: 'integer', minimum: 0 },
                  },
                  required: ['value', 'type_only', 'unknown'],
                  additionalProperties: false,
                },
                evidence: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      from: { ...NON_BLANK_STRING_SCHEMA },
                      to: { ...NON_BLANK_STRING_SCHEMA },
                      kind: { ...NON_BLANK_STRING_SCHEMA },
                      importUsage: {
                        type: 'string',
                        enum: ['value', 'type_only', 'unknown'],
                      },
                    },
                    required: ['from', 'to', 'kind', 'importUsage'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['fromRole', 'toRole', 'count', 'importUsageCounts', 'evidence'],
              additionalProperties: false,
            },
          },
          excludedByUsage: { type: 'integer', minimum: 0 },
          violationCount: { type: 'integer', minimum: 0 },
          violations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                fromRole: { ...NON_BLANK_STRING_SCHEMA },
                toRole: { ...NON_BLANK_STRING_SCHEMA },
                from: { ...NON_BLANK_STRING_SCHEMA },
                to: { ...NON_BLANK_STRING_SCHEMA },
                kind: { ...NON_BLANK_STRING_SCHEMA },
                importUsage: { type: 'string', enum: ['value', 'type_only'] },
                rule: { ...NON_BLANK_STRING_SCHEMA },
              },
              required: ['fromRole', 'toRole', 'from', 'to', 'kind', 'importUsage', 'rule'],
              additionalProperties: false,
            },
          },
          violationsLimited: { type: 'boolean' },
          unknown: {
            type: 'object',
            properties: {
              coverageIncomplete: { type: 'boolean' },
              unmappedEdges: { type: 'integer', minimum: 0 },
              unruledEdges: { type: 'integer', minimum: 0 },
              unknownImportUsages: { type: 'integer', minimum: 0 },
              emptyRoles: { type: 'array', items: { ...NON_BLANK_STRING_SCHEMA } },
            },
            required: [
              'coverageIncomplete',
              'unmappedEdges',
              'unruledEdges',
              'unknownImportUsages',
              'emptyRoles',
            ],
            additionalProperties: false,
          },
          source: {
            type: 'object',
            properties: {
              rootPath: { type: ['string', 'null'] },
              filesScanned: { type: 'integer', minimum: 0 },
              supportedLanguages: { type: 'array', items: { ...NON_BLANK_STRING_SCHEMA } },
            },
            required: ['rootPath', 'filesScanned', 'supportedLanguages'],
            additionalProperties: false,
          },
        },
        required: [
          'contract',
          'status',
          'roles',
          'observedRoleEdges',
          'excludedByUsage',
          'violationCount',
          'violations',
          'violationsLimited',
          'unknown',
          'source',
        ],
        additionalProperties: false,
      },
      agentPlanContract: {
        type: 'object',
        properties: {
          contract: { type: 'string', enum: ['architectureChangePlan:v1'] },
          requiredFields: {
            type: 'array',
            items: {
              type: 'string',
              enum: [
                'touchedRoles',
                'plannedPaths',
                'expectedNewDependencies',
                'crossedBoundaries',
                'preservedInterfaces',
                'verificationCommands',
                'unknowns',
              ],
            },
          },
        },
        required: ['contract', 'requiredFields'],
        additionalProperties: false,
      },
      nextActions: {
        type: 'array',
        items: {
          oneOf: [
            {
              type: 'object',
              properties: {
                id: { type: 'string', enum: ['inspect_violations'] },
                count: { type: 'integer', minimum: 0 },
              },
              required: ['id', 'count'],
              additionalProperties: false,
            },
            {
              type: 'object',
              properties: {
                id: { type: 'string', enum: ['close_measurement_gaps'] },
                unknown: {
                  type: 'object',
                  properties: {
                    coverageIncomplete: { type: 'boolean' },
                    unmappedEdges: { type: 'integer', minimum: 0 },
                    unruledEdges: { type: 'integer', minimum: 0 },
                    unknownImportUsages: { type: 'integer', minimum: 0 },
                    emptyRoles: { type: 'array', items: { ...NON_BLANK_STRING_SCHEMA } },
                  },
                  required: [
                    'coverageIncomplete',
                    'unmappedEdges',
                    'unruledEdges',
                    'unknownImportUsages',
                    'emptyRoles',
                  ],
                  additionalProperties: false,
                },
              },
              required: ['id', 'unknown'],
              additionalProperties: false,
            },
            {
              type: 'object',
              properties: {
                id: { type: 'string', enum: ['plan_within_architecture'] },
                profileSlug: { ...NON_BLANK_STRING_SCHEMA },
              },
              required: ['id', 'profileSlug'],
              additionalProperties: false,
            },
          ],
        },
      },
    },
    required: ['contract', 'sideEffect', 'profile', 'conformance', 'agentPlanContract', 'nextActions'],
    additionalProperties: false,
  },
};
