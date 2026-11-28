import { ELEMENT_NAMING_RULE_EN, FAMILY_SCOPE_RULE_EN } from '../../construction/construction-rules.mjs';
import { GRAPH_REF_ARRAY_MAX_ITEMS } from '../tool-schemas/array-limits.mjs';
import {
  NON_BLANK_STRING_SCHEMA,
  nonBlankStringSchema,
} from '../tool-schemas/field-primitives.mjs';
import { LOCALE_LABELS_SCHEMA } from '../tool-schemas/vault-node-shapes.mjs';

export const WRITE_FINDINGS_GUIDANCE =
  '`findings`: one line per maintenance finding on the nodes written, with the call that settles it';

export const WRITE_FINDINGS_SCHEMA = {
  type: 'array',
  items: { type: 'string' },
  description: 'One line per kind of maintenance finding on the nodes this call wrote: the first finding with the call that settles it, then the other nodes it applies to.',
};

/** What a capability's body holds, said where the builder writes it. */
const CONCEPT_BODY_DESCRIPTION =
  'All five parts, written now: definition; the deciding rule with the cite of its lines; `## Includes` naming in code form each surveyed ability it covers; `## Excludes`, what it is often taken for and is not; `## Uncertainty`, what was not read. A missing part is repaired later one patch_concept per node.';

export const ADD_CONCEPT_TOOL = {
  name: 'add_concept',
  description:
    'Create one new ontology node (.md file) for a project, domain, capability, element or document found in the code. ' +
    'Throws if the slug exists: use patch_concept then. Frontmatter is normalized per kind; a capability or element without `domain:`, or a title another node already has, ' +
    'comes back as a `warning`, not an error: prefer patch_concept on the existing node over a duplicate. ' +
    'Returns `slug`, `mtime` (the next `expected_mtime`) and ' + WRITE_FINDINGS_GUIDANCE + '. ' +
    'For 5+ nodes use `add_concepts` (max 50 per call). ' + ELEMENT_NAMING_RULE_EN,
  inputSchema: {
    type: 'object',
    properties: {
      slug: nonBlankStringSchema(
        'Vault-relative slug, flat under the kind folder ("elements/jwt-token"); omit the .md extension. Never a code path: "elements/src/views/home" is rejected.',
      ),
      kind: {
        ...NON_BLANK_STRING_SCHEMA,
        enum: ['project', 'domain', 'capability', 'element', 'document'],
        description: 'Node kind; vault-readme is reserved for the generated README.',
      },
      title: NON_BLANK_STRING_SCHEMA,
      domain: nonBlankStringSchema(
        'Parent domain slug; expected for a capability or element.',
      ),
      domains: {
        type: 'array',
        maxItems: GRAPH_REF_ARRAY_MAX_ITEMS,
        items: NON_BLANK_STRING_SCHEMA,
        description: 'Domain slugs this project owns.',
      },
      capabilities: {
        type: 'array',
        maxItems: GRAPH_REF_ARRAY_MAX_ITEMS,
        items: NON_BLANK_STRING_SCHEMA,
        description: 'Capability slugs this project or domain owns.',
      },
      elements: {
        type: 'array',
        maxItems: GRAPH_REF_ARRAY_MAX_ITEMS,
        items: NON_BLANK_STRING_SCHEMA,
        description: 'Element slugs this project or capability uses.',
      },
      path: nonBlankStringSchema(
        'The capability\'s or element\'s entry file or folder, repo-relative; checked by validate_vault path drift.',
      ),
      body: {
        type: 'string',
        description: `${CONCEPT_BODY_DESCRIPTION} A starter body when omitted.`,
      },
      labels: LOCALE_LABELS_SCHEMA,
    },
    required: ['slug', 'kind', 'title'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      ok: { type: 'boolean' },
      slug: { type: 'string' },
      changed: { type: 'boolean' },
      mtime: { type: 'number', minimum: 0 },
      warnings: { type: 'array', items: { type: 'string' } },
      findings: WRITE_FINDINGS_SCHEMA,
    },
    required: ['ok', 'slug', 'changed', 'mtime'],
    additionalProperties: false,
  },
};

export const ADD_CONCEPTS_TOOL = {
  name: 'add_concepts',
  description:
    'Create one or more new ontology nodes (.md files) for a project, domain, capability, element or document found in the code: one row for one node, up to 50 per call; use it for the construction batch after analyze_repo_structure. Replaces add_concept. ' +
    'A row whose slug exists fails: use patch_concept then. Frontmatter is normalized per kind; a capability or element without `domain:` comes back as a `warning`, not an error. ' +
    'Rows are independent and there is no rollback: a bad row (existing slug, invalid kind, missing or unknown field, duplicate input slug) returns `{slug, ok: false, error}` labelled `concepts[n]` with repair fields, and the rest still land, in input order. ' +
    'A title matching an existing node or an earlier row lands with a near-duplicate `warning`: patch_concept that node instead. ' +
    'A written row is `{ok, slug, changed, mtime, warnings?}`. Invalid-only batches return no row-level write metadata, no `findings` and no `coverage`; otherwise the response adds ' + WRITE_FINDINGS_GUIDANCE + ', and `coverage`: the build-depth counts the batch moved, with the next call. ' +
    FAMILY_SCOPE_RULE_EN + ' ' + ELEMENT_NAMING_RULE_EN,
  inputSchema: {
    type: 'object',
    properties: {
      concepts: {
        type: 'array',
        maxItems: 50,
        items: {
          type: 'object',
          properties: {
            slug: nonBlankStringSchema(
              'Flat under the kind folder ("elements/jwt-token"), no .md. Never a code path: "elements/src/views/home" is rejected.',
            ),
            kind: {
              ...NON_BLANK_STRING_SCHEMA,
              enum: ['project', 'domain', 'capability', 'element', 'document'],
              description: 'vault-readme is reserved for the generated README.',
            },
            title: NON_BLANK_STRING_SCHEMA,
            domain: nonBlankStringSchema('Parent domain slug; expected for a capability or element.'),
            domains: { type: 'array', maxItems: GRAPH_REF_ARRAY_MAX_ITEMS, items: NON_BLANK_STRING_SCHEMA, description: 'Domain slugs this project owns.' },
            capabilities: { type: 'array', maxItems: GRAPH_REF_ARRAY_MAX_ITEMS, items: NON_BLANK_STRING_SCHEMA, description: 'Capability slugs this project or domain owns.' },
            elements: { type: 'array', maxItems: GRAPH_REF_ARRAY_MAX_ITEMS, items: NON_BLANK_STRING_SCHEMA, description: 'Element slugs this project or capability uses.' },
            path: nonBlankStringSchema(
              'The entry file or folder, repo-relative; checked by validate_vault path drift.',
            ),
            body: { type: 'string', description: CONCEPT_BODY_DESCRIPTION },
            labels: LOCALE_LABELS_SCHEMA,
          },
          required: ['slug', 'kind', 'title'],
          additionalProperties: false,
        },
        description: 'One row per node: `slug`, `kind` and `title`, with the kind\'s relation fields.',
      },
    },
    required: ['concepts'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      concepts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            slug: { type: 'string' },
            ok: { type: 'boolean' },
            changed: { type: 'boolean' },
            mtime: { type: 'number', minimum: 0 },
            warnings: { type: 'array', items: { type: 'string' } },
            error: { type: 'string' },
            errorCode: { type: 'string' },
            valueName: { type: 'string' },
            receivedValue: { type: 'string' },
            suggestion: { type: 'string' },
            allowedValues: { type: 'array', items: { type: 'string' } },
            rowName: { type: 'string' },
            receivedField: { type: 'string' },
            unknownFields: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  suggestion: { type: 'string' },
                },
                required: ['name'],
                additionalProperties: false,
              },
            },
            allowedFields: { type: 'array', items: { type: 'string' } },
            receivedFields: { type: 'array', items: { type: 'string' } },
            conflictSubject: { type: 'string' },
            conflictSlug: { type: 'string' },
            firstSeenAt: { type: 'string' },
            recoveryTools: { type: 'array', items: { type: 'string' } },
            avoidTools: { type: 'array', items: { type: 'string' } },
          },
          required: ['slug', 'ok'],
          additionalProperties: false,
        },
      },
      findings: WRITE_FINDINGS_SCHEMA,
      coverage: {
        type: 'object',
        description: 'Only what the batch changed in the build depth: `changed` maps a count (`abilities.unplaced`, `areas.notMapped`, `reads.unread`, `rules.uncited`, `roles.unplaced`, `abilityEdges.capabilitiesWithoutEdge`) to `[before, after]`, and `nextAction` is the one call that moves the first count that is not zero. `validate_vault` lists the unplaced abilities.',
        properties: {
          changed: { type: 'object', additionalProperties: { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2 } },
          nextAction: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
    required: ['concepts'],
    additionalProperties: false,
  },
};

export const PATCH_CONCEPT_TOOL = {
  name: 'patch_concept',
  description:
    'Update the frontmatter and/or body of an existing node, to revise or deepen it; in a filled vault prefer it over adding. ' +
    'Frontmatter patches are key by key: null deletes a key, omission keeps it. A given body replaces the whole body. ' +
    'Pass `expected_mtime` from the last read or write: a changed file throws VaultConflictError. ' +
    'Send one node as `slug` with its fields, or up to 20 as `patches`: one consent, every patch checked before any file is touched, ' +
    'and all-or-nothing, so a patch that fails puts the earlier files back. ' +
    'Returns `slug`, `mtime` (the next `expected_mtime`) and ' + WRITE_FINDINGS_GUIDANCE + '; `patches` returns one `{slug, ok, changed, mtime}` row per node. ' + FAMILY_SCOPE_RULE_EN,
  inputSchema: {
    type: 'object',
    properties: {
      slug: nonBlankStringSchema('Vault-relative slug (omit the .md extension).'),
      frontmatter: {
        type: 'object',
        description:
          'Key/value patches (e.g. { domain: "views" }); null removes a key. Localized names go in `display_ko` / `display_en` for every locale the vault serves.',
        additionalProperties: true,
      },
      body: {
        type: 'string',
        description: 'Replacement body; kept when omitted.',
      },
      expected_mtime: {
        type: 'number',
        minimum: 0,
        description:
          'Conflict guard: mtime from the last read or write of this node (add_relations returns it only when guarded).',
      },
      patches: {
        type: 'array',
        minItems: 1,
        maxItems: 20,
        description: 'Instead of `slug`: up to 20 patches in one call, one per node, written all or none.',
        items: {
          type: 'object',
          properties: {
            slug: nonBlankStringSchema('Vault-relative slug (omit the .md extension).'),
            frontmatter: { type: 'object', additionalProperties: true, description: 'Key/value patches; null removes a key.' },
            body: { type: 'string', description: 'Replacement body; kept when omitted.' },
            expected_mtime: { type: 'number', minimum: 0, description: 'Conflict guard for this node.' },
          },
          required: ['slug'],
          additionalProperties: false,
        },
      },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      ok: { type: 'boolean' },
      slug: { type: 'string' },
      changed: { type: 'boolean' },
      mtime: { type: 'number', minimum: 0 },
      mintedUid: { type: 'string' },
      notice: { type: 'string' },
      patches: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            slug: { type: 'string' },
            changed: { type: 'boolean' },
            mtime: { type: 'number', minimum: 0 },
            mintedUid: { type: 'string' },
            notice: { type: 'string' },
          },
          required: ['ok', 'slug', 'changed', 'mtime'],
          additionalProperties: false,
        },
      },
      findings: WRITE_FINDINGS_SCHEMA,
    },
    required: ['ok'],
    additionalProperties: false,
  },
};
