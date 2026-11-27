import { describe, expect, it } from 'vitest';
import type { ReleaseWalk, TaggedCommit } from '@/shared/lib/git/tauri-change-briefing';
import { appendWalk, EMPTY_WALK, filterRows, parseTagName, releaseRows, releasesFromTags, sequencesOf, sinceChoices, unreleasedSpan, type LineWalk } from './release-list';

const hash = (name: string) => name.padEnd(40, '0');
/** The read branch, newest first: each commit's title and the tags on it. */
const LINE: [string, string[]][] = [
  ['docs: seven', []],
  ['untyped six', ['api@2.0.0']],
  ['feat(web): five', ['web@1.0.0']],
  ['chore: four', ['latest', 'v1.1.0']],
  ['Merge #12: fix(map): three', ['nightly']],
  ['feat(map): two', ['v1.1.0-beta.1']],
  ['fix: one', []],
  ['feat: first', ['v1.0.0']],
];
const commitAt = (position: number) => hash(`c${position}`);
const SIDE = hash('side');
const TAGS: TaggedCommit[] = [
  ...LINE.flatMap(([, names], position) => names.length ? [{ commit: commitAt(position), committedAt: 800 - position * 100, names }] : []),
  { commit: SIDE, committedAt: 150, names: ['v0.9.0-hotfix'] },
];
const TYPE = /^(?:Merge #\d+: )?(\w+)(?:\([^)]*\))?:/;

function step(titles: string[], skip: number, ended: boolean, commits: (index: number) => string, tagged: Set<string>): ReleaseWalk {
  const types: string[] = [];
  const kinds = titles.map(title => {
    const type = TYPE.exec(title)?.[1];
    if (!type) return -1;
    if (!types.includes(type)) types.push(type);
    return types.indexOf(type);
  });
  const marks = titles.flatMap((_, offset) => tagged.has(commits(skip + offset)) ? [{ position: skip + offset, commit: commits(skip + offset) }] : []);
  return { status: 'measured', skip, kinds, types, marks, ended };
}

const tagged = new Set(TAGS.map(tag => tag.commit));
const titles = LINE.map(([title]) => title);
const fullLine = appendWalk(EMPTY_WALK, step(titles, 0, true, commitAt, tagged));
const sideWalk = appendWalk(EMPTY_WALK, step(['fix: off the branch', 'feat: first'], 0, true, index => index === 0 ? SIDE : commitAt(7), tagged));
const releases = releasesFromTags(TAGS);
const rowsOf = (line: LineWalk, off = new Map([[SIDE, sideWalk]])) => releaseRows(releases, line, off);

describe('release list', () => {
  it('reads the text before the version as the sequence and the suffix as a pre-release', () => {
    expect(parseTagName('v1.2.3')).toEqual({ prefix: 'v', major: 1, minor: 2, patch: 3, pre: null });
    expect(parseTagName('web@1.0.0-beta.2+build.5')).toEqual({ prefix: 'web@', major: 1, minor: 0, patch: 0, pre: 'beta.2' });
    expect(parseTagName('api/v2.4')).toEqual({ prefix: 'api/v', major: 2, minor: 4, patch: 0, pre: null });
    expect(parseTagName('1.0.0')?.prefix).toBe('');
    expect(parseTagName('nightly')).toBeNull();
  });

  it('orders by the read branch, merges names on one commit and places an off-branch tag at its date', () => {
    const rows = rowsOf(fullLine);
    expect(rows.map(row => row.release.names[0])).toEqual(['api@2.0.0', 'web@1.0.0', 'v1.1.0', 'nightly', 'v1.1.0-beta.1', 'v0.9.0-hotfix', 'v1.0.0']);
    expect(rows[2].release.names).toEqual(['v1.1.0', 'latest']);
    expect(rows.map(row => row.placement)).toEqual(['line', 'line', 'line', 'line', 'line', 'off', 'line']);
  });

  it('marks size by the number that changed and a pre-release apart', () => {
    const marks = Object.fromEntries(rowsOf(fullLine).map(row => [row.release.names[0], [row.release.size, row.release.preRelease]]));
    expect(marks).toMatchObject({ 'v1.0.0': ['major', false], 'v1.1.0': ['minor', false], 'v1.1.0-beta.1': ['minor', true], 'v0.9.0-hotfix': ['minor', true], nightly: ['patch', false] });
  });

  it('starts each release at the nearest earlier tag of its sequence, a final skipping its own betas', () => {
    const rows = Object.fromEntries(rowsOf(fullLine).map(row => [row.release.names[0], row]));
    expect(rows['v1.1.0'].start).toEqual({ commit: commitAt(7), position: 7 });
    expect(rows['v1.1.0'].count).toBe(4);
    expect(rows['v1.1.0-beta.1'].count).toBe(2);
    expect(rows['v1.0.0'].start).toEqual({ commit: null, position: 8 });
    expect(rows['v1.0.0'].count).toBe(1);
    expect(rows['api@2.0.0'].count).toBe(7);
    expect(rows['web@1.0.0'].count).toBe(6);
    expect(rows.nightly.count).toBe(4);
    expect(rows['v0.9.0-hotfix'].start).toEqual({ commit: commitAt(7), position: 1 });
    expect(rows['v0.9.0-hotfix'].count).toBe(1);
  });

  it('splits a release into kinds as typed, with none when under half are typed', () => {
    const rows = Object.fromEntries(rowsOf(fullLine).map(row => [row.release.names[0], row]));
    expect(rows['v1.1.0'].kinds?.kinds).toEqual([{ type: 'fix', count: 2 }, { type: 'chore', count: 1 }, { type: 'feat', count: 1 }]);
    expect(rows['v1.1.0'].kindCounts).toEqual([2, 1, 1, 0]);
    const untyped = releaseRows(releasesFromTags([{ commit: commitAt(1), committedAt: 1, names: ['v9.0.0'] }]), fullLine, new Map());
    expect(untyped[0].count).toBe(7);
    expect(untyped[0].kinds).not.toBeNull();
  });

  it('names come first and counts fill as the walk reaches each start', () => {
    const before = rowsOf(EMPTY_WALK, new Map());
    expect(before.map(row => row.release.names[0])).toEqual(['api@2.0.0', 'web@1.0.0', 'v1.1.0', 'nightly', 'v1.1.0-beta.1', 'v0.9.0-hotfix', 'v1.0.0']);
    expect(before.every(row => row.count === null && row.placement === 'unknown')).toBe(true);
    const partial = appendWalk(EMPTY_WALK, step(titles.slice(0, 6), 0, false, commitAt, tagged));
    const rows = Object.fromEntries(rowsOf(partial, new Map()).map(row => [row.release.names[0], row]));
    expect(rows['v1.1.0'].count).toBeNull();
    expect(rows['v1.0.0'].placement).toBe('unknown');
    const rest = appendWalk(partial, step(titles.slice(6), 6, true, commitAt, tagged));
    expect(rest.kinds).toEqual(fullLine.kinds.map(kind => fullLine.types[kind] ?? null).map(type => type === null ? -1 : rest.types.indexOf(type)));
    expect(rowsOf(rest).find(row => row.release.names[0] === 'v1.1.0')?.count).toBe(4);
  });

  it('holds the changes after the newest release on the branch as unreleased', () => {
    const unreleased = unreleasedSpan(rowsOf(fullLine), fullLine);
    expect(unreleased).toMatchObject({ base: commitAt(1), count: 1 });
    const tipWalk = appendWalk(EMPTY_WALK, step(titles, 0, true, commitAt, new Set([commitAt(0)])));
    const tipTagged = releaseRows(releasesFromTags([{ commit: commitAt(0), committedAt: 900, names: ['v3.0.0'] }]), tipWalk, new Map());
    expect(unreleasedSpan(tipTagged, tipWalk).count).toBe(0);
  });

  it('offers every older release on the same line as a start', () => {
    const rows = rowsOf(fullLine);
    const selected = rows.find(row => row.release.names[0] === 'v1.1.0')!;
    expect(sinceChoices(rows, selected, fullLine).map(row => row.release.names[0])).toEqual(['nightly', 'v1.1.0-beta.1', 'v1.0.0']);
    expect(sinceChoices(rows, null, fullLine)).toHaveLength(6);
    const off = rows.find(row => row.placement === 'off')!;
    expect(sinceChoices(rows, off, sideWalk).map(row => row.release.names[0])).toEqual(['v1.0.0']);
  });

  it('finds by any name in one Unicode form and narrows to one sequence', () => {
    const rows = rowsOf(fullLine);
    expect(filterRows(rows, 'LATE', null).map(row => row.release.names[0])).toEqual(['v1.1.0']);
    expect(filterRows(rows, '', 'api@').map(row => row.release.names[0])).toEqual(['api@2.0.0']);
    expect(sequencesOf(releases)).toEqual(expect.arrayContaining(['v', 'web@', 'api@']));
    const hangul = releaseRows(releasesFromTags([{ commit: commitAt(1), committedAt: 1, names: ['출시-1.0.0'] }]), fullLine, new Map());
    expect(filterRows(hangul, '출시'.normalize('NFD'), null)).toHaveLength(1);
  });
});
