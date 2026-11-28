import { VAULT_ISSUE_CODE_VALUES } from '../../validate.mjs';
import {
  NON_BLANK_STRING_SCHEMA,
  paginationOutputSchema,
} from '../tool-schemas/field-primitives.mjs';

export const VALIDATE_VAULT_TOOL = {
  name: 'validate_vault',
  description:
    'Validate every doc in the vault in one call and return a per-doc + per-code aggregate: the whole-vault health view for first-contact before writes and before / after a batch write. side effect 0. `problems` is one page, errors first: follow `problemsPagination.nextOffset` until `hasMore` is false before calling the vault clean; `summary` counts the whole vault. `pathDrift` lists source paths gone from disk (fix with patch_concept). `evidenceDrift` marks `stale` concepts whose cited file changed after them: read it before trusting the meaning. `coverage` counts the unplaced abilities, unmapped areas, unread entry files, rules that cite no read lines and capabilities no ability edge touches, lists the first 10 unplaced abilities (`unplacedOffset.nextOffset` for the next 10) and gives one `nextAction`. `finalizeGate` lists what `finalize_project_meaning` would refuse for a row answered `answered`; empty means none. `summary.byCode[code].remedy` states the repair once for every issue of that code.',
  inputSchema: {
    type: 'object',
    properties: {
      repoRoot: {
        ...NON_BLANK_STRING_SCHEMA,
        description:
          'Root that `path:` claims resolve against. Defaults to the active repository root.',
      },
      offset: {
        type: 'integer',
        minimum: 0,
        description: 'Resume at `problemsPagination.nextOffset`.',
      },
      unplacedOffset: {
        type: 'integer',
        minimum: 0,
        description:
          'Resume the unplaced abilities at `coverage.breadth.unplaced.pagination.nextOffset`; it pages on its own, apart from `offset`.',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description: 'Problem files per page. Defaults 100.',
      },
      unplacedOffset: {
        type: 'integer',
        minimum: 0,
        description: 'Resume the unplaced abilities of `coverage` at `coverage.unplacedOffset.nextOffset`.',
      },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      coverage: {
        type: 'object',
        description: 'Build depth as counts: `abilities` the survey lists by where each sits, `areas` mapped, `reads` of capability entry files, `rules` citing no read lines, `roles` with no element, `abilityEdges`; the page of `unplaced` abilities from `unplacedOffset`; and one `nextAction`.',
        properties: {
          abilities: { type: 'object' },
          areas: { type: 'object' },
          reads: { type: 'object' },
          rules: { type: 'object' },
          roles: { type: 'object' },
          abilityEdges: { type: 'object' },
          unplaced: { type: 'array', items: { type: 'object' }, description: 'Up to 10 abilities no node covers, from `unplacedOffset.offset`.' },
          unplacedOffset: { ...paginationOutputSchema(), description: 'The cursor over `unplaced`; pass `nextOffset` as `unplacedOffset` until `hasMore` is false. It is not `problemsPagination`.' },
          nextAction: { type: 'string', description: 'The one call that moves the first count that is not zero.' },
        },
        additionalProperties: false,
      },
      finalizeGate: {
        type: 'array',
        description: 'What `finalize_project_meaning` refuses for a row answered `answered` and for the Not mapped yet lines, one entry per block with its count; empty when it would refuse nothing. Present when the repository is grounded.',
        items: { type: 'object', properties: { row: { type: 'string', enum: ['abilities', 'evidence', 'impact', 'not-mapped-lines'] } }, required: ['row'] },
      },
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
                remedy: { type: 'string', description: 'What to do about every issue of this code, with `<slug>` for the node. An issue without it carries its own repair.' },
                files: {
                  type: 'array',
                  items: NON_BLANK_STRING_SCHEMA,
                  description: 'At most 20 files with this code that are not on this page of `problems`, in page order.',
                },
                filesOmitted: {
                  type: 'integer',
                  minimum: 1,
                  description: 'Present when `files` names fewer than `count`: how many more. Page through `problems` for them.',
                },
              },
              required: ['severity', 'count'],
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
          'Whether each concept still stands on the code it cites, dated by one Git walk: current / stale / missing / unknown per concept, with the first 10 stale, missing and folder-only rows named; `omitted` counts the rest.',
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
          omitted: { type: 'object', description: 'How many rows were cut from `stale`, `missing` and `folderOnly`, by group.' },
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

const WIKI_PROBLEM_SCHEMA = {
  type: 'object',
  properties: {
    code: { type: 'string' },
    message: { type: 'string' },
    line: { type: 'integer', minimum: 1 },
    detail: {
      type: 'object',
      description: 'The pieces of `message`, so a screen can retell it in the reader\'s language: `key` names the sentence, `values` fills it.',
      properties: {
        key: { type: 'string' },
        values: { type: 'object', additionalProperties: { type: 'string' } },
      },
      required: ['key'],
      additionalProperties: false,
    },
  },
  required: ['code', 'message'],
  additionalProperties: false,
};

export const VALIDATE_WIKI_TOOL = {
  name: 'validate_wiki',
  description:
    'Judge the pages under `wiki/` against the wiki page contract (`docs/ONTOLOGY-ATLAS-SPEC.md` §11) after editing a page and before claiming a compile finished. side effect 0. `pages` holds failing pages only: follow `nextCall` until `pagination.hasMore` is false; the folder is clean only when `failingCount` is 0.',
  inputSchema: {
    type: 'object',
    properties: {
      paths: {
        type: 'array',
        maxItems: 50,
        items: { type: 'string', minLength: 1 },
        description:
          'Page paths to judge (`wiki/plan.md`), listed passing or not. Omit to judge all of `wiki/` and page the failing ones.',
      },
      afterPath: {
        type: 'string',
        minLength: 1,
        description: 'Resume after this page, from `nextCall`.',
      },
      offset: {
        type: 'integer',
        minimum: 0,
        description: 'First failing page in path order.',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description: 'Default 100.',
      },
    },
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      pageCount: { type: 'integer', minimum: 0, description: 'Pages judged: the whole folder, or the named `paths`.' },
      failingCount: {
        type: 'integer',
        minimum: 0,
        description: 'Pages with at least one problem. Zero means every page judged fits.',
      },
      pagination: {
        ...paginationOutputSchema(),
        description: 'The page `pages` holds: `offset` is its position among `total` failing pages and `nextOffset` the position after it, both as of this call; resume with `nextCall`. Absent with `paths`.',
      },
      nextCall: {
        type: 'object',
        description: 'Present while more failing pages remain: the exact call for the next page.',
        properties: {
          tool: { type: 'string', enum: ['validate_wiki'] },
          arguments: {
            type: 'object',
            properties: {
              afterPath: { type: 'string', minLength: 1 },
              limit: { type: 'integer', minimum: 1, maximum: 500 },
            },
            required: ['afterPath'],
            additionalProperties: false,
          },
        },
        required: ['tool', 'arguments'],
        additionalProperties: false,
      },
      pagesHint: {
        type: 'string',
        description: 'Present when the failing pages span more than one reply: which ones this reply shows, why it stopped, and the next call.',
      },
      summary: {
        type: 'object',
        description: 'The whole folder, whatever page `pages` holds. Absent with `paths`.',
        properties: {
          blockingPages: { type: 'integer', minimum: 0, description: 'Failing pages with at least one problem that is not advisory.' },
          advisoryOnlyPages: { type: 'integer', minimum: 0, description: 'Failing pages whose only problems are advisory (orphan-page, shared-source-unlinked).' },
          byCode: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              properties: {
                severity: {
                  type: 'string',
                  enum: ['error', 'warning'],
                  description: '`warning` for an advisory code, `error` for the rest.',
                },
                count: { type: 'integer', minimum: 1, description: 'Pages with this code.' },
                files: {
                  type: 'array',
                  // A path exactly as the folder names it, like `pages[].path`: a file name may
                  // hold any character, and the path must round-trip into `paths` and `afterPath`.
                  items: { type: 'string', minLength: 1 },
                  description: 'At most 20 of the `count` pages with this code, blocking pages first, each group by path.',
                },
                filesOmitted: {
                  type: 'integer',
                  minimum: 1,
                  description: 'Present when `files` names fewer than `count`: how many more. Page through `pages` for them.',
                },
              },
              required: ['severity', 'count', 'files'],
              additionalProperties: false,
            },
          },
        },
        required: ['blockingPages', 'advisoryOnlyPages', 'byCode'],
        additionalProperties: false,
      },
      pages: {
        type: 'array',
        description: 'Without `paths`, failing pages only, one page of them. With `paths`, every named page.',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            ok: { type: 'boolean' },
            blocking: { type: 'boolean', description: 'Whether any problem is more than advisory (orphan-page and shared-source-unlinked are advisory).' },
            problems: { type: 'array', items: WIKI_PROBLEM_SCHEMA, description: 'At most 20, in the order judged; each message escapes control and format characters.' },
            problemsOmitted: {
              type: 'integer',
              minimum: 1,
              description: 'Present when the page has more problems than `problems` shows: how many more.',
            },
          },
          required: ['path', 'ok', 'blocking', 'problems'],
          additionalProperties: false,
        },
      },
    },
    required: ['pageCount', 'failingCount', 'pages'],
    additionalProperties: false,
  },
};
