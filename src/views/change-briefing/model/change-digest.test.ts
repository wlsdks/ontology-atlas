import { describe, expect, it } from 'vitest';
import type { BriefingCommit } from '@/shared/lib/git/tauri-change-briefing';
import { buildChangeDigest, changeBody, changeTitle, directoryCounts, titleWithoutHead, latestChangeDay, mainDirectory, pullRequestNumber, titleLabel } from './change-digest';

let sequence = 0;
function change(subject: string, options: { files?: number; paths?: string[]; message?: string; at?: string } = {}): BriefingCommit {
  sequence += 1;
  const paths = options.paths ?? Array.from({ length: options.files ?? 4 }, (_, index) => `src/area-${sequence}/file-${index}.ts`);
  return { hash: sequence.toString(16).padStart(40, '0'), subject, message: options.message, committedAt: options.at ?? `2026-11-13T09:${String(sequence % 60).padStart(2, '0')}:00Z`, paths };
}
const ordinary = (count: number, label = 'map') => Array.from({ length: count }, (_, index) => change(`fix(${label}): ordinary ${index}`));
const noConcepts = new Map<string, string[]>();

describe('title parsing', () => {
  it.each([
    ['Merge #3178: fix(brand): export Moru', 3178],
    ['fix(brand): export Moru (#3178)', 3178],
    ['fix(brand): export Moru (#3178) ', 3178],
    ['fix(brand): mention #12 in passing', null],
    ['Merge branch main', null],
  ])('reads the pull request number of %j', (subject, number) => {
    expect(pullRequestNumber(subject)).toBe(number);
  });

  it('shows the author title without the number it carries', () => {
    expect(changeTitle('Merge #3178: fix(brand): export Moru')).toBe('fix(brand): export Moru');
    expect(changeTitle('fix(brand): export Moru (#3178)')).toBe('fix(brand): export Moru');
    expect(changeTitle('Merge #1: ')).toBe('Merge #1: ');
  });

  it('reads a merge of several pull requests by its first title and number', () => {
    const subject = 'Merge #2981 #2984: fix(editor): confirm discarding and 1 more';
    expect(pullRequestNumber(subject)).toBe(2981);
    expect(titleLabel(subject)).toBe('editor');
    expect(changeTitle(subject)).toBe('fix(editor): confirm discarding and 1 more');
  });

  it('reads a hosted merge by the first line of its body', () => {
    const subject = 'Merge pull request #12 from someone/branch';
    const message = `${subject}\n\nfix(map): keep the camera\n`;
    expect(pullRequestNumber(subject)).toBe(12);
    expect(titleLabel(subject, message)).toBe('map');
    expect(changeTitle(subject, message)).toBe('fix(map): keep the camera');
    expect(changeTitle(subject)).toBe(subject);
  });

  it.each([
    ['fix(map): keep the camera', 'map'],
    ['Merge #3: feat(Brand)!: adopt motions', 'brand'],
    ['fix(지도): 카메라 유지', '지도'],
    ['docs: delete documents', null],
    ['fix(): empty brackets', null],
    ['A sentence (with brackets): not a label', null],
  ])('reads the label of %j', (subject, label) => {
    expect(titleLabel(subject)).toBe(label);
  });
});

describe('worth a look', () => {
  it('returns a revert, a change marked breaking and a very large change in that order', () => {
    const revert = change('Revert "fix(map): keep the camera"');
    const breaking = change('feat(cli)!: rename the export flag');
    const large = change('feat(brand): adopt fifty motions', { files: 482 });
    const digest = buildChangeDigest([...ordinary(15), large, breaking, ...ordinary(15, 'cli'), revert], noConcepts);
    expect(digest.notable.map(entry => [entry.change.commit, entry.reason])).toEqual([
      [revert, { kind: 'revert' }],
      [breaking, { kind: 'breaking' }],
      [large, { kind: 'size', count: 482 }],
    ]);
  });

  it('draws no strip when thirty ordinary changes qualify for nothing', () => {
    expect(buildChangeDigest(ordinary(30), noConcepts).notable).toEqual([]);
  });

  it('reads reverts and breaking marks from the message and lists each change once', () => {
    const both = change('Merge #9: revert(map)!: undo the camera', { at: '2026-11-13T12:00:00Z' });
    const message = change('fix(map): restore', { message: 'fix(map): restore\n\nThis reverts commit abc.', at: '2026-11-13T11:00:00Z' });
    const footer = change('feat(cli): flags', { message: 'feat(cli): flags\n\nBREAKING CHANGE: renamed', at: '2026-11-13T10:00:00Z' });
    const digest = buildChangeDigest([footer, message, both], noConcepts);
    expect(digest.notable.map(entry => [entry.change.commit, entry.reason.kind])).toEqual([[both, 'revert'], [message, 'revert'], [footer, 'breaking']]);
  });

  it('breaks ties newest first and stops at three', () => {
    const reverts = ['08', '11', '09', '10'].map(hour => change(`revert: undo ${hour}`, { at: `2026-11-13T${hour}:00:00Z` }));
    expect(buildChangeDigest(reverts, noConcepts).notable.map(entry => entry.change.commit)).toEqual([reverts[1], reverts[3], reverts[2]]);
  });

  it('ranks recorded-concept reach by count before size', () => {
    const two = change('fix(map): two', { paths: ['a.ts', 'b.ts'] });
    const three = change('fix(map): three', { paths: ['a.ts', 'b.ts', 'c.ts'] });
    const one = change('fix(map): one', { paths: ['a.ts'] });
    const concepts = new Map([['a.ts', ['camera']], ['b.ts', ['search']], ['c.ts', ['index', 'camera']]]);
    const digest = buildChangeDigest([one, two, three, ...ordinary(3, 'cli')], concepts);
    expect(digest.notable.map(entry => [entry.change.commit, entry.reason])).toEqual([[three, { kind: 'reach', count: 3 }], [two, { kind: 'reach', count: 2 }]]);
  });

  it('counts a change as large only from thirty files and three times the median', () => {
    const busy = Array.from({ length: 5 }, (_, index) => change(`fix(map): busy ${index}`, { files: 20 }));
    const fifty = change('fix(map): fifty', { files: 50 });
    const seventy = change('fix(cli): seventy', { files: 70 });
    expect(buildChangeDigest([...busy, fifty, seventy], noConcepts).notable.map(entry => entry.change.commit)).toEqual([seventy]);
    expect(buildChangeDigest([...ordinary(3), change('fix(cli): twenty-nine', { files: 29 })], noConcepts).notable).toEqual([]);
  });
});

describe('groups', () => {
  it('names the seven largest labels by count then name, puts the rest last and adds up to the headline', () => {
    const commits = [
      ...ordinary(18, 'map'), ...ordinary(6, 'brand'), ...ordinary(3, 'harness'), ...ordinary(2, 'deps'),
      ...ordinary(1, 'cli'), ...ordinary(1, 'records'), ...ordinary(1, 'agents'), ...ordinary(1, 'zeta'), ...ordinary(1, 'beta'),
      change('docs: no label'),
    ];
    const digest = buildChangeDigest(commits, noConcepts);
    expect(digest.grouping).toBe('label');
    expect(digest.groups.map(group => [group.name, group.changes.length])).toEqual([
      ['map', 18], ['brand', 6], ['harness', 3], ['deps', 2], ['agents', 1], ['beta', 1], ['cli', 1], ['', 3],
    ]);
    expect(digest.groups.at(-1)?.kind).toBe('other');
    expect(digest.groups.reduce((sum, group) => sum + group.changes.length, 0)).toBe(digest.changes);
    expect(digest.changes).toBe(35);
  });

  it('orders a group newest first and ranks its recorded concepts by changes touched', () => {
    const early = change('fix(map): early', { paths: ['a.ts'], at: '2026-11-13T08:00:00Z' });
    const late = change('fix(map): late', { paths: ['a.ts', 'b.ts'], at: '2026-11-13T18:00:00Z' });
    const digest = buildChangeDigest([early, late, ...ordinary(1, 'cli')], new Map([['a.ts', ['camera']], ['b.ts', ['search']]]));
    expect(digest.groups[0].changes.map(entry => entry.commit)).toEqual([late, early]);
    expect(digest.groups[0].concepts).toEqual(['camera', 'search']);
  });

  it('groups by the top-level directory holding most files when under half the titles carry a label', () => {
    const commits = [
      change('fix(map): only label', { paths: ['src/a.ts', 'src/b.ts', 'docs/c.md'] }),
      change('docs: words', { paths: ['docs/a.md'] }),
      change('chore: root', { paths: ['package.json', 'README.md'] }),
      change('chore: nothing', { paths: [] }),
    ];
    const digest = buildChangeDigest(commits, noConcepts);
    expect(digest.grouping).toBe('directory');
    expect(digest.groups.map(group => [group.kind, group.name, group.changes.length])).toEqual([
      ['directory', '.', 1], ['directory', 'docs', 1], ['directory', 'src', 1], ['other', '', 1],
    ]);
    expect(mainDirectory(['b/x', 'a/y'])).toBe('a');
  });

  it('keeps label groups when most titles carry the same single label', () => {
    const digest = buildChangeDigest([...ordinary(6, 'changes'), change('docs: words', { paths: ['docs/a.md'] })], noConcepts);
    expect(digest.grouping).toBe('label');
    expect(digest.groups.map(group => [group.name, group.changes.length])).toEqual([['changes', 6], ['', 1]]);
  });

  it('counts distinct files across the period', () => {
    const digest = buildChangeDigest([change('fix(map): a', { paths: ['x.ts', 'y.ts'] }), change('fix(cli): b', { paths: ['x.ts'] })], noConcepts);
    expect(digest.files).toBe(2);
  });

  it('finds the local day of the newest change', () => {
    expect(latestChangeDay([change('a', { at: '2026-11-10T12:00:00' }), change('b', { at: '2026-11-13T12:00:00' })])).toBe('2026-11-13');
    expect(latestChangeDay([])).toBeNull();
  });
});

describe('one change opened where it is listed', () => {
  it('drops the head a label group already names and keeps a title that has none', () => {
    expect(titleWithoutHead('Merge #3114: fix(map): keep the camera')).toBe('keep the camera');
    expect(titleWithoutHead('Update the readme')).toBe('Update the readme');
  });

  it('keeps the prose under the title and leaves out its echoes and trailers', () => {
    const message = 'Merge #3114: fix(map): keep the camera\n\nfix(map): keep the camera (#3114)\n\nThe camera jumped when a panel opened.\nIt now holds its centre.\n\nCo-Authored-By: Someone <a@b.c>';
    expect(changeBody('Merge #3114: fix(map): keep the camera', message)).toEqual(['The camera jumped when a panel opened.', 'It now holds its centre.']);
    expect(changeBody('fix(map): keep the camera')).toEqual([]);
  });

  it('counts each file once under its top-level directory, most files first', () => {
    expect(directoryCounts(['src/a.ts', 'src/b.ts', 'src/a.ts', 'docs/x.md', 'README.md'])).toEqual([['src', 2], ['.', 1], ['docs', 1]]);
  });
});
