// Every issue code `validateVaultDocument` can surface, for `--list-codes` and unknown `--fail-on`
// codes. Kept in step with cli/src/lib/mcp-bridge/validate.mjs by tests/contract/cli/known-codes-drift.contract.test.ts.
export const KNOWN_CODES = [
  {
    code: 'unclosed-frontmatter',
    severity: 'error',
    description: '`---` never closes: the frontmatter at the head of the file has no end.',
  },
  {
    code: 'parse-zero-keys',
    severity: 'warning',
    description: 'frontmatter parsed to 0 keys: the YAML syntax is probably broken.',
  },
  {
    code: 'malformed-frontmatter-line',
    severity: 'error',
    description: 'a frontmatter declaration or indented list breaks key: value syntax.',
  },
  {
    code: 'malformed-quoted-scalar',
    severity: 'error',
    description: 'a scalar opens a quote it never closes as the last character, so the quote is kept as literal text.',
  },
  {
    code: 'missing-kind',
    severity: 'warning',
    description: 'no `kind:` key at all: the file is left out of the graph.',
  },
  {
    code: 'empty-kind',
    severity: 'error',
    description: '`kind:` is empty: the file is left out of the graph and invalid.',
  },
  {
    code: 'unknown-kind',
    severity: 'warning',
    description: 'a value other than project / domain / capability / element / document.',
  },
  {
    code: 'missing-uid',
    severity: 'error',
    description: 'the ontology node has no permanent `uid:`.',
  },
  {
    code: 'invalid-uid',
    severity: 'error',
    description: '`uid:` is not a lowercase UUIDv4.',
  },
  {
    code: 'invalid-merged-uids',
    severity: 'error',
    description: '`merged_uids:` breaks the absorbed UUIDv4 identity-alias format.',
  },
  {
    code: 'non-canonical-merged-uids',
    severity: 'warning',
    description: '`merged_uids:` is not a deduplicated, ascending canonical set.',
  },
  {
    code: 'missing-expected-field',
    severity: 'warning',
    description: 'a field strongly expected for this kind is missing (for example `domain:` on capability/element).',
  },
  {
    code: 'non-canonical-graph-array',
    severity: 'warning',
    description: 'a graph array is not a trimmed, deduplicated, sorted canonical set.',
  },
  {
    code: 'dangling-graph-reference',
    severity: 'warning',
    scope: 'vault',
    description: 'a graph reference resolves to no node in the vault.',
  },
  /*
   * The meaning findings are warnings: the Markdown is valid and the graph reads it. `--strict` and
   * `--fail-on` can hard-gate them; the default exit stays on errors.
   */
  {
    code: 'definition-missing',
    severity: 'warning',
    description: 'a domain, capability, or element whose body never says what it is, or only restates its title.',
  },
  {
    code: 'boundary-missing',
    severity: 'warning',
    description: 'a domain or capability with no `## Includes` or no `## Excludes` holding more than a placeholder.',
  },
  {
    code: 'epistemic-exclusion',
    severity: 'warning',
    description: 'an exclusion bullet that states what the writer did not read rather than what the product does not do.',
  },
  {
    code: 'uncertainty-missing',
    severity: 'warning',
    description: 'a node that records no unknown at all, so its body reads as complete when no vault is.',
  },
  {
    code: 'slug-outside-kind-folder',
    severity: 'warning',
    description: 'a domain, capability, or element written at the vault root instead of inside its kind folder.',
  },
  {
    code: 'folder-only-evidence',
    severity: 'warning',
    scope: 'vault',
    description: 'frontmatter `path:` names a directory, so this node\'s evidence can never be dated against the code.',
  },
  {
    code: 'dependency-unwitnessed',
    severity: 'warning',
    scope: 'vault',
    description: 'a declared dependency whose citing file never names the file the target cites, so nothing in the source witnesses the edge.',
  },
  {
    code: 'dependency-unjudged',
    severity: 'warning',
    scope: 'vault',
    description: 'a declared dependency whose citing file is too large to read, so no witness was looked for and the edge is not judged.',
  },
  {
    code: 'relation-note-on-unread',
    severity: 'warning',
    scope: 'vault',
    description: 'a relation `why` states how two nodes work together while one of them was never read (validate_vault: by the lines its server served; here: by its own Uncertainty wording); the message names the read and the replace_relation call that repair it.',
  },
  {
    code: 'rule-without-read-lines',
    severity: 'warning',
    scope: 'vault',
    description: 'a capability states a rule (a condition, order or default) but cites no lines that hold it, as `path:L12-L30`; validate_vault also requires the lines were served this session. The cited lines are checked with OATLAS_REPO_ROOT.',
  },
  {
    code: 'dependency-both-ways',
    severity: 'warning',
    scope: 'vault',
    description: 'two nodes each declare a dependency on the other, so one arrow points from provider to consumer.',
  },
  {
    code: 'path-without-code',
    severity: 'warning',
    scope: 'vault',
    description: 'a capability or element `path:` names a file with no code: empty, comments or a docstring only, or a bare re-export. Needs OATLAS_REPO_ROOT.',
  },
  {
    code: 'path-shared',
    severity: 'warning',
    scope: 'vault',
    description: 'more than five capabilities and elements share one `path:`, so a drift check cannot tell them apart. Needs OATLAS_REPO_ROOT.',
  },
  {
    code: 'starter-example-node',
    severity: 'warning',
    scope: 'vault',
    description: 'a starter example the `init` scaffold wrote, still standing after real nodes of the same kind arrived.',
  },
  {
    code: 'duplicate-slug',
    severity: 'error',
    scope: 'vault',
    description: 'two documents claim the same canonical slug, so a relation cannot say which one it means.',
  },
  {
    code: 'duplicate-uid',
    severity: 'error',
    scope: 'vault',
    description: 'two nodes claim the same primary or merged UID as their permanent identity.',
  },
  {
    code: 'kind-under-sources',
    severity: 'warning',
    scope: 'vault',
    description: 'a file under `sources/` carries `kind:`, but every file there is a raw source, never a node.',
  },
];
