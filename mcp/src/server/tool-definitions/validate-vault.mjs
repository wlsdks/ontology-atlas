import { VAULT_ISSUE_CODE_VALUES } from '../../validate.mjs';
import { VAULT_ISSUE_CODE_DESCRIPTION } from '../tool-schemas/enum-descriptions.mjs';
import {
  NON_BLANK_STRING_SCHEMA,
  paginationOutputSchema,
} from '../tool-schemas/field-primitives.mjs';

export const VALIDATE_VAULT_TOOL = {
  name: 'validate_vault',
  description:
    'R+ (cycle 46) — validate every doc in the vault, return per-doc + per-code aggregate. ' +
    'Replaces the K-round-trip pattern of `list_concepts` then per-doc `get_concept` (whose `warnings: [...]` is per-file). ' +
    `Issue codes — ${VAULT_ISSUE_CODE_DESCRIPTION}. ` +
    'Returns `{ scanned, problems: [{slug, issues: [{code, severity, message}]}], problemsPagination, summary: { problemFiles, errorFiles, warningFiles, byCode: { code: { severity, count, files } } } }`. ' +
    '`problems` is one page, files with errors first and then by slug: `offset` (default 0) and `limit` (default 100, max 500) choose it, a page left at the default `limit` stops sooner when its text would pass 128 KiB, and `problemsPagination.nextOffset` resumes it, so follow pages until `hasMore` is false before calling the vault clean. `summary` always counts the whole vault; each `byCode` entry names at most 20 `files` and says how many more in `filesOmitted`. ' +
    'Also returns `pathDrift`: frontmatter `path:` / `elements:` source paths that no longer exist on disk (vault→code drift), resolved against `repoRoot` (default: the active resolved repository root from connection_info). Ontology-slug references are never flagged. Fix via `patch_concept` or remove the stale entry. ' +
    'Also returns `evidenceDrift`: one Git walk dates every cited path and every concept document, and each concept is `current` (cited code unchanged since the document), `stale` (a cited file changed after the document — read it before trusting the recorded meaning), `missing` (cited path gone) or `unknown` (nothing cited, no commit in the window, or only a folder-level path moved — listed under `folderOnly`, because a folder changes on almost any commit). `checked: false` names why nothing was dated; it never means nothing moved. ' +
    'Also returns `coverage`, one line: which abilities the survey lists (entry points, dispatched operations, library exports) no node places, which capabilities\' entry files were never read this session, which rules cite no read lines, and which capabilities no ability-to-ability edge touches, each with its next call. Build-depth warnings: `relation-note-on-unread` (judged by the lines this session served), `rule-without-read-lines`, `dependency-both-ways`, `path-without-code`, `path-shared`. ' +
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
      coverage: {
        type: 'string',
        description: 'One line: of the abilities the survey lists (entry points, dispatched operations, library exports, families), how many have their own node, are named inside a capability or element or are excluded with a reason, and each unplaced ability by name; the capabilities that cite no lines this server process read holding a condition, with the exact analyze_repo_structure call that reads them; the capabilities stating a rule without citing read lines that hold its condition, with the read and patch; and the capabilities no ability-to-ability depends_on touches. Absent when no repository root is grounded or it has no product source.',
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
    'Judge the pages under `wiki/` against the wiki page contract (`docs/ONTOLOGY-ATLAS-SPEC.md` §11): ' +
    'no `kind:`, the seven required frontmatter fields, the five sections in order, a citation on every ' +
    'bullet under `## Facts`, and a cited path that is both declared in `sources:` and present in the folder. ' +
    'A wiki page is **not** an ontology node — it carries no `kind:` by contract, which is what keeps it out ' +
    'of the graph — so `validate_vault` says nothing about whether one fits its own shape. This is that answer. ' +
    'Problem codes: kind-present, missing-field:<key>, section-order, uncited-fact, bad-citation, ' +
    'bad-truncation-record, citation-target-missing, bad-describes, describes-target-missing; folder codes dangling-wikilink, ' +
    'and the advisory orphan-page and shared-source-unlinked. ' +
    'The optional `describes:` lists the slugs of the `kind:` nodes a page is about, at any `status`, with one ' +
    'sentence each under `relation_notes:`; `describes-target-missing` names an entry that resolves (full slug, ' +
    '`slug:` alias or unique tail, as `find_backlinks` resolves) to no `kind:` node: a missing or ambiguous name, ' +
    'a wiki page or the vault README; `bad-describes` names a `describes:` that is not a list. `describes: []` records that no concept fits. ' +
    'The optional `sources_truncated:` key lists which paths in `sources:` the run read only part of; ' +
    'it is what lets a reader tell a document written up whole from one written up in part. ' +
    'Without `paths`, returns `{ pageCount, failingCount, pagination, nextCall?, summary: { blockingPages, advisoryOnlyPages, byCode }, pages: [{path, ok, blocking, problems: [{code, message, line?, detail?}], problemsOmitted?}] }`: ' +
    '`pageCount` and `failingCount` count the whole folder and `pages` holds failing pages only, one page of them, by path; ' +
    '`blocking` says whether a page has a problem that is not advisory, and `summary.byCode` samples blocking pages first. `limit` (default 100, max 500) sets its size; ' +
    'a page left at the default `limit` stops sooner when the reply would pass 128 KiB, and always holds at least one page. ' +
    '`nextCall` resumes after the last page shown (`afterPath`), so every page that fails for the whole walk is listed once, repairs between calls included; ' +
    'follow it until `pagination.hasMore` is false. A page renamed during the walk appears under its new path only if that path sorts after the cursor, ' +
    'and a page that starts failing behind the walk is found by the next walk: the folder is clean only when `failingCount` is 0. Each page shows at most 20 problems and counts the rest in `problemsOmitted`; ' +
    'fix those and validate again to see more. `summary` always counts the whole folder; ' +
    'each `byCode` entry names at most 20 `files` and says how many more in `filesOmitted`. ' +
    'With `paths`, every named page is listed with its `ok`, passing or not, unpaged. ' +
    '`ontology-atlas wiki-validate --json` prints the same page and problem objects for every page in the folder, ' +
    'because a person reading it locally has no reply budget. ' +
    'side effect 0. Use it after writing or editing a page, and before claiming a compile finished.',
  inputSchema: {
    type: 'object',
    properties: {
      paths: {
        type: 'array',
        maxItems: 50,
        items: { type: 'string', minLength: 1 },
        description:
          'Vault-relative page paths to judge (`wiki/quarter-plan.md`). Omit to judge every page under `wiki/` ' +
          'and page through the failing ones with `limit` and `nextCall`. Max 50 when naming them, the same ' +
          'ceiling `get_concepts.uids` uses: past that, asking for the whole folder is one call instead of a ' +
          'list somebody has to assemble. A path outside `wiki/` is reported as a problem rather than silently skipped.',
      },
      afterPath: {
        type: 'string',
        minLength: 1,
        description: 'Resume after this page path, copied from the last reply\'s `nextCall`. Failing pages are walked by path, so repairs between calls move no unseen page behind it. Not with `paths` or `offset`.',
      },
      offset: {
        type: 'integer',
        minimum: 0,
        description: 'Zero-based index of the first failing page to return, in path order. Shifts when a repair removes earlier pages; `nextCall` does not. Defaults 0. Not with `paths` or `afterPath`.',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description: 'Failing pages per reply. Defaults 100. Not with `paths`.',
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
