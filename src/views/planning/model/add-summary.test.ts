import { describe, expect, it } from 'vitest';
import { planningAddSummary } from './add-summary';

const outcome = (added: number, duplicates = 0, unsupported = 0, failed = 0) => ({ added: Array.from({ length: added }, (_, index) => `file-${index}.md`), duplicates, unsupported, failed });
const keys = (summary: ReturnType<typeof planningAddSummary>) => summary && { keys: summary.sentences.map((sentence) => sentence.key), tone: summary.tone };

describe('the sentence an Add files toast says', () => {
  it('names what was added and appends only the leftovers that happened', () => {
    expect(keys(planningAddSummary(outcome(2)))).toEqual({ keys: ['addFilesAdded'], tone: 'success' });
    expect(keys(planningAddSummary(outcome(1, 1, 2)))).toEqual({ keys: ['addFilesAdded', 'addFilesLeftBoth'], tone: 'success' });
    expect(keys(planningAddSummary(outcome(1, 1)))).toEqual({ keys: ['addFilesAdded', 'addFilesLeftDuplicates'], tone: 'success' });
    expect(keys(planningAddSummary(outcome(1, 0, 3)))).toEqual({ keys: ['addFilesAdded', 'addFilesLeftUnsupported'], tone: 'success' });
    expect(planningAddSummary(outcome(1, 1, 2))?.sentences[1].values).toEqual({ duplicates: 1, unsupported: 2 });
  });

  it('warns when some files were added and others could not be written', () => {
    expect(keys(planningAddSummary(outcome(1, 0, 0, 2)))).toEqual({ keys: ['addFilesAdded', 'addFilesPartFailed'], tone: 'warning' });
  });

  it('says the files were already there when that is all that happened', () => {
    expect(keys(planningAddSummary(outcome(0, 2)))).toEqual({ keys: ['addFilesLeftDuplicates'], tone: 'info' });
    expect(keys(planningAddSummary(outcome(0, 1, 1)))).toEqual({ keys: ['addFilesLeftBoth'], tone: 'info' });
  });

  it('names the listed types when nothing of them was chosen, and the failure when nothing could be written', () => {
    expect(keys(planningAddSummary(outcome(0, 0, 3)))).toEqual({ keys: ['addFilesNothing'], tone: 'info' });
    expect(keys(planningAddSummary(outcome(0, 1, 1, 1)))).toEqual({ keys: ['addFilesFailed'], tone: 'error' });
    expect(planningAddSummary(outcome(0))).toBeNull();
  });
});
