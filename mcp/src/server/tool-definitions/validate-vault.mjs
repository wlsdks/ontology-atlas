import { VAULT_ISSUE_CODE_VALUES } from '../../validate.mjs';
import {
  NON_BLANK_STRING_SCHEMA,
  VAULT_ISSUE_CODE_DESCRIPTION,
  paginationOutputSchema,
} from '../tool-schemas.mjs';

export const VALIDATE_VAULT_TOOL = {
  name: 'validate_vault',
  description:
    'R+ (cycle 46) — validate every doc in the vault, return per-doc + per-code aggregate. ' +
    'Replaces the K-round-trip pattern of `list_concepts` then per-doc `get_concept` (whose `warnings: [...]` is per-file). ' +
    `8 issue codes — ${VAULT_ISSUE_CODE_DESCRIPTION}. ` +
    'Returns `{ scanned, problems: [{slug, issues: [{code, severity, message}]}], problemsPagination, summary: { problemFiles, errorFiles, warningFiles, byCode: { code: { severity, count, files } } } }`. ' +
    '`problems` is one page, files with errors first and then by slug: `offset` (default 0) and `limit` (default 100, max 500) choose it, a page left at the default `limit` stops sooner when its text would pass 128 KiB, and `problemsPagination.nextOffset` resumes it, so follow pages until `hasMore` is false before calling the vault clean. `summary` always counts the whole vault; each `byCode` entry names at most 20 `files` and says how many more in `filesOmitted`. ' +
    'Also returns `pathDrift`: frontmatter `path:` / `elements:` source paths that no longer exist on disk (vault→code drift), resolved against `repoRoot` (default: the active resolved repository root from connection_info). Ontology-slug references are never flagged. Fix via `patch_concept` or remove the stale entry. ' +
    'Also returns `evidenceDrift`: one Git walk dates every cited path and every concept document, and each concept is `current` (cited code unchanged since the document), `stale` (a cited file changed after the document — read it before trusting the recorded meaning), `missing` (cited path gone) or `unknown` (nothing cited, no commit in the window, or only a folder-level path moved — listed under `folderOnly`, because a folder changes on almost any commit). `checked: false` names why nothing was dated; it never means nothing moved. ' +
    'side effect 0. Use when an agent needs the *whole-vault* health view: first-contact before writes, before / after a batch write, or surfacing issues to the user.',
  inputSchema: {
    type: 'object',
    properties: {
      repoRoot: {
        ...NON_BLANK_STRING_SCHEMA,
        description:
          'Repository root that frontmatter source paths resolve against, for the pathDrift check. Defaults to the active resolved repository root from connection_info. Pass this if the vault lives apart from the code repo.',
      },
      offset: {
        type: 'integer',
        minimum: 0,
        description: 'Zero-based index of the first problem file to return, in the order errors first and then slug. Resume with `problemsPagination.nextOffset`. Defaults 0.',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description: 'Problem files per page. Defaults 100.',
      },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      scanned: {
        type: 'integer',
        minimum: 0,
        description: 'Number of vault markdown files scanned.',
      },
      problemsPagination: {
        ...paginationOutputSchema(),
        description: 'The page `problems` holds: `total` problem files, and `nextOffset` for the next page until `hasMore` is false.',
      },
      problemsHint: {
        type: 'string',
        description: 'Present when the vault has more than one page: which files this page shows and the call for the next one.',
      },
      problems: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            slug: NON_BLANK_STRING_SCHEMA,
            issues: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  code: { ...NON_BLANK_STRING_SCHEMA, enum: VAULT_ISSUE_CODE_VALUES },
                  severity: {
                    type: 'string',
                    enum: ['error', 'warning'],
                  },
                  message: NON_BLANK_STRING_SCHEMA,
                },
                required: ['code', 'severity', 'message'],
                additionalProperties: false,
              },
            },
          },
          required: ['slug', 'issues'],
          additionalProperties: false,
        },
      },
      summary: {
        type: 'object',
        properties: {
          problemFiles: { type: 'integer', minimum: 0 },
          errorFiles: { type: 'integer', minimum: 0 },
          warningFiles: { type: 'integer', minimum: 0 },
          byCode: {
            type: 'object',
            propertyNames: { enum: VAULT_ISSUE_CODE_VALUES },
            additionalProperties: {
              type: 'object',
              properties: {
                severity: {
                  type: 'string',
                  enum: ['error', 'warning'],
                },
                count: { type: 'integer', minimum: 0 },
                files: {
                  type: 'array',
                  items: NON_BLANK_STRING_SCHEMA,
                  description: 'At most 20 of the `count` files with this code, in page order.',
                },
                filesOmitted: {
                  type: 'integer',
                  minimum: 1,
                  description: 'Present when `files` names fewer than `count`: how many more. Page through `problems` for them.',
                },
              },
              required: ['severity', 'count', 'files'],
              additionalProperties: false,
            },
          },
        },
        required: ['problemFiles', 'errorFiles', 'warningFiles', 'byCode'],
        additionalProperties: false,
      },
      summaryFreshness: {
        type: 'object',
        properties: {
          checked: { type: 'boolean' },
          summaryNodes: { type: 'integer', minimum: 0 },
          stale: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                slug: NON_BLANK_STRING_SCHEMA,
                kind: { type: 'string', enum: ['project', 'domain'] },
                childCount: { type: 'integer', minimum: 0 },
                reasonCode: { type: 'string' },
                bodyChangedAt: { type: 'string', format: 'date-time' },
                membershipChangedAt: { type: 'string', format: 'date-time' },
                behindByMs: { type: 'number', minimum: 0 },
                score: { type: 'number', minimum: 0, maximum: 1 },
                hint: NON_BLANK_STRING_SCHEMA,
              },
              required: ['slug', 'kind', 'childCount', 'score', 'hint'],
              additionalProperties: false,
            },
          },
          hint: { type: 'string' },
        },
        required: ['checked', 'summaryNodes', 'stale', 'hint'],
        additionalProperties: false,
      },
      pathDrift: {
        type: 'object',
        description:
          'Vault→code path drift: frontmatter source paths missing on disk, resolved against repoRoot.',
        properties: {
          repoRoot: NON_BLANK_STRING_SCHEMA,
          checked: {
            type: 'boolean',
            description:
              'False when the repository this vault describes could not be determined (vault outside any git repo and no repoRoot given). Then `drifts` is empty because nothing was measured — NOT because nothing drifted.',
          },
          nodesScanned: { type: 'integer', minimum: 0 },
          pathsChecked: { type: 'integer', minimum: 0 },
          drifts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                slug: { type: 'string' },
                kind: { type: 'string' },
                key: { type: 'string', enum: ['path', 'elements[]'] },
                missingPath: { type: 'string' },
                suggestedPath: {
                  type: 'string',
                  description:
                    'Reconcile hint (Track A #3): a unique existing repo file sharing the missing file\'s basename — likely where the source moved. Present only on a unique match.',
                },
              },
              required: ['slug', 'kind', 'key', 'missingPath'],
              additionalProperties: false,
            },
          },
          hint: { type: 'string' },
        },
        required: ['repoRoot', 'checked', 'nodesScanned', 'pathsChecked', 'drifts', 'hint'],
        additionalProperties: false,
      },
      evidenceDrift: {
        type: 'object',
        description:
          'Whether each concept still stands on the code it cites, dated by one Git walk: current / stale / missing / unknown per concept, with the stale and missing rows named (bounded to 50 each).',
        properties: {
          checked: { type: 'boolean' },
          reason: { type: 'string', description: 'Why nothing was dated, when `checked` is false.' },
          repoRoot: NON_BLANK_STRING_SCHEMA,
          counts: {
            type: 'object',
            properties: {
              current: { type: 'integer', minimum: 0 },
              stale: { type: 'integer', minimum: 0 },
              missing: { type: 'integer', minimum: 0 },
              unknown: { type: 'integer', minimum: 0 },
              folderOnly: { type: 'integer', minimum: 0, description: 'Unknown rows whose only moved evidence is a folder path.' },
            },
            required: ['current', 'stale', 'missing', 'unknown', 'folderOnly'],
            additionalProperties: false,
          },
          stale: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                slug: { type: 'string' },
                kind: { type: 'string' },
                docChangedAt: { type: ['string', 'null'] },
                moved: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { path: { type: 'string' }, changedAt: { type: 'string' } },
                    required: ['path', 'changedAt'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['slug', 'kind', 'docChangedAt', 'moved'],
              additionalProperties: false,
            },
          },
          missing: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                slug: { type: 'string' },
                kind: { type: 'string' },
                gone: { type: 'array', items: { type: 'string' } },
              },
              required: ['slug', 'kind', 'gone'],
              additionalProperties: false,
            },
          },
          folderOnly: {
            type: 'array',
            description: 'Concepts whose only evidence that moved is a folder: something under it changed, which is not yet a verdict on the meaning.',
            items: {
              type: 'object',
              properties: {
                slug: { type: 'string' },
                kind: { type: 'string' },
                docChangedAt: { type: ['string', 'null'] },
                folders: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { path: { type: 'string' }, changedAt: { type: 'string' } },
                    required: ['path', 'changedAt'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['slug', 'kind', 'docChangedAt', 'folders'],
              additionalProperties: false,
            },
          },
          hint: { type: 'string' },
        },
        required: ['checked', 'counts', 'stale', 'missing', 'folderOnly', 'hint'],
        additionalProperties: false,
      },
    },
    required: ['scanned', 'problems', 'summary', 'summaryFreshness', 'pathDrift'],
    additionalProperties: false,
  },
};

export const VALIDATE_WIKI_TOOL = {
  name: 'validate_wiki',
  description:
    'Judge the pages under `wiki/` against the wiki page contract (`docs/ONTOLOGY-ATLAS-SPEC.md` §11): ' +
    'no `kind:`, the seven required frontmatter fields, the five sections in order, a citation on every ' +
    'bullet under `## Facts`, and a cited path that is both declared in `sources:` and present in the folder. ' +
    'A wiki page is **not** an ontology node — it carries no `kind:` by contract, which is what keeps it out ' +
    'of the graph — so `validate_vault` says nothing about whether one fits its own shape. This is that answer. ' +
    'Problem codes: kind-present, missing-field:<key>, section-order, uncited-fact, bad-citation, ' +
    'bad-truncation-record, citation-target-missing, describes-needs-approval. ' +
    'The optional `sources_truncated:` key lists which paths in `sources:` the run read only part of; ' +
    'it is what lets a reader tell a document written up whole from one written up in part. ' +
    'Returns `{ pageCount, failingCount, pages: [{path, problems: [{code, message, line?}]}] }` — the same shape ' +
    '`ontology-atlas wiki-validate --json` prints, so a person and an agent read one report. ' +
    'side effect 0. Use it after writing or editing a page, and before claiming a compile finished.',
  inputSchema: {
    type: 'object',
    properties: {
      paths: {
        type: 'array',
        maxItems: 50,
        items: { type: 'string', minLength: 1 },
        description:
          'Vault-relative page paths to judge (`wiki/quarter-plan.md`). Omit to judge every page under `wiki/`, ' +
          'which has no cap because the folder decides how many there are. Max 50 when naming them, the same ' +
          'ceiling `get_concepts.uids` uses: past that, asking for the whole folder is one call instead of a ' +
          'list somebody has to assemble. A path outside `wiki/` is reported as a problem rather than silently skipped.',
      },
    },
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      pageCount: { type: 'integer', minimum: 0, description: 'Pages judged.' },
      failingCount: {
        type: 'integer',
        minimum: 0,
        description: 'Pages with at least one problem. Zero means every page judged fits.',
      },
      pages: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            ok: { type: 'boolean' },
            problems: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                  line: { type: 'integer', minimum: 1 },
                },
                required: ['code', 'message'],
                additionalProperties: false,
              },
            },
          },
          required: ['path', 'ok', 'problems'],
          additionalProperties: false,
        },
      },
    },
    required: ['pageCount', 'failingCount', 'pages'],
    additionalProperties: false,
  },
};
