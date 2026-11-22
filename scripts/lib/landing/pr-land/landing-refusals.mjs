/** The pull requests a landing refuses before any CI is read, each with the reason a person can act on. */

import { CATEGORIES } from '../../records/changelog-entry-template.mjs';

export const CONFLICT_INSTRUCTION =
  'conflicts with main, and only its author can resolve that:\n'
  + '    git fetch origin && git merge origin/main\n'
  + '    # resolve the conflict, commit, then push the branch\n'
  + '  If only generated docs-vault JSON, the changelog or the ledger conflict, do not\n'
  + '  resolve those by hand: `pnpm docs-vault:resolve-conflicts -- --dry-run`, then the\n'
  + '  write command. Then run `pnpm pr:land <number>` again. It was not queued, so\n'
  + '  nothing waits on it meanwhile.';

const FEATURE_TITLE = /^(feat)(\([^)]*\))?!?:/;
const NO_CHANGE_RECORD_LINE = /^No change record: *\S/m;
const CHANGE_RECORD_DIR = 'docs/records/changes/';

export function missingChangeRecord(pr, readChangedFiles) {
  const type = FEATURE_TITLE.exec(pr.title ?? '')?.[1];
  if (!type || NO_CHANGE_RECORD_LINE.test(pr.body ?? '')) return null;
  const files = readChangedFiles();
  if (files === null) {
    return `is titled \`${type}:\`, and its changed files could not be read, so whether it adds a change record is unknown; try again once the read works.`;
  }
  if (files.some((path) => path.startsWith(CHANGE_RECORD_DIR))) return null;
  return `is titled \`${type}:\`, which tells a user something new arrived, but adds no ${CHANGE_RECORD_DIR} record, so no release note can name it.\n`
    + `  Record the fact, then commit and push it:\n`
    + `    pnpm record:new -- --kind=change --date=YYYY-MM-DD --slug=<subject> --category=<${CATEGORIES.join('|')}> --input=<file>\n`
    + '  Or, when no user can notice the feature, add this line to the pull request body:\n'
    + '    No change record: <why no user can notice it>\n'
    + '  Then run `pnpm pr:land <number>` again.';
}

/** A pull request this script refuses to touch, with the reason a person can act on. */
export function refuseLanding(pr) {
  if (!pr || typeof pr.number !== 'number') return 'no such pull request.';
  if (pr.state !== 'OPEN') {
    return `is ${String(pr.state).toLowerCase()}, not open. Only an open pull request can land.`;
  }
  if (pr.isCrossRepository) {
    return 'comes from a fork. Checking its branch out runs the fork\'s scripts as you (the tracked .githooks),'
      + ' so read it with `gh pr diff <number>` or try it in a throwaway clone with no hooks path set'
      + ' (`git -c core.hooksPath=/dev/null checkout` for a single checkout), then land it by hand:'
      + ' CONTRIBUTING.md, "Reviewing a fork pull request".';
  }
  if (pr.baseRefName && pr.baseRefName !== 'main') return `targets ${pr.baseRefName}, not main.`;
  if (String(pr.headRefName ?? '').startsWith('train/')) return 'is a landing train; the conductor lands it.';
  if (pr.mergeStateStatus === 'DIRTY' || pr.mergeable === 'CONFLICTING') return CONFLICT_INSTRUCTION;
  return null;
}
