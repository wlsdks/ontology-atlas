import { beforeEach, describe, expect, it } from 'vitest';

import { readMachineApprovals, recordApproval } from '@/shared/lib/connectors/machine-approvals';

import { STANDING_APPROVAL_SCOPE } from './standing-approval';
import { keepStandingChoice, standingChoiceKept } from './standing-choice';

const FOLDER = '/Users/probe/notes';

beforeEach(() => {
  window.localStorage.clear();
});

describe('the auto-approve choice kept on this Mac', () => {
  it('is off until the person turns it on, and off again when they turn it off', () => {
    expect(standingChoiceKept(FOLDER)).toBe(false);
    keepStandingChoice(FOLDER, true);
    expect(standingChoiceKept(FOLDER)).toBe(true);
    expect(standingChoiceKept('/Users/probe/other')).toBe(false);
    keepStandingChoice(FOLDER, false);
    expect(standingChoiceKept(FOLDER)).toBe(false);
  });

  it('holds only for the scope it was given for', () => {
    recordApproval('auto-approve', FOLDER, 'chat', `${STANDING_APPROVAL_SCOPE} delete_concept`);
    expect(readMachineApprovals().allowed('auto-approve', FOLDER, 'chat')).not.toBeNull();
    expect(standingChoiceKept(FOLDER)).toBe(false);
  });

  it('is never kept without a folder path, as on the web', () => {
    keepStandingChoice(null, true);
    expect(standingChoiceKept(null)).toBe(false);
  });

  it('names every Atlas write it answers, so adding one asks for the choice again', () => {
    expect(STANDING_APPROVAL_SCOPE.split(' ')).toEqual([
      'edit-inside-folder@1',
      'add_concept',
      'add_concepts',
      'add_relation',
      'add_relations',
      'patch_concept',
      'reclassify_concept',
      'rename_concept',
      'replace_relation',
    ]);
  });
});
