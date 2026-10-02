import { describe, expect, it } from 'vitest';

import {
  buildDraftPreviewGeometry,
  DRAFT_PREVIEW_CLOCK,
  DRAFT_PREVIEW_ROLES,
  DRAFT_PREVIEW_VIOLATION,
  draftPreviewIterations,
  draftPreviewLayout,
  draftPreviewTracks,
  foldFolderRows,
} from './draft-preview';

const EASING = { ease: 'ease', exit: 'ease-in', spring: 'linear' };
const LIGHT = { haloRest: 0.34, haloRaised: 0.7, intensity: 0.9, bloomTauMs: 280 };
const geometryAt = (available: number, rows: number) => buildDraftPreviewGeometry(draftPreviewLayout(available), rows);

function valueAt(frames: Keyframe[], offset: number, property: string): string | number | undefined {
  const before = [...frames].reverse().find((frame) => (frame.offset ?? 0) <= offset);
  const after = frames.find((frame) => (frame.offset ?? 1) >= offset);
  expect(before?.[property], `${property} changes across the resting frame`).toEqual(after?.[property]);
  return before?.[property] as string | number | undefined;
}

describe('foldFolderRows', () => {
  it('keeps every folder while they fit the column', () => {
    const folders = ['app', 'docs', 'src'];
    expect(foldFolderRows(folders, 3)).toEqual({ shown: folders, hidden: 0 });
  });

  it('folds the rest into one counted row, so the count names every hidden folder', () => {
    const folders = Array.from({ length: 14 }, (_, index) => `f${index}`);
    const folded = foldFolderRows(folders, 7);
    expect(folded.shown).toHaveLength(6);
    expect(folded.shown.length + folded.hidden).toBe(14);
  });
});

describe('buildDraftPreviewGeometry', () => {
  it('reaches every folder in reading order before it carries the read to the foundation', () => {
    const geometry = geometryAt(800, 6);
    expect(geometry.rowStops).toEqual([...geometry.rowStops].sort((a, b) => a - b));
    expect(geometry.rowStops[0]).toBeGreaterThan(0);
    expect(geometry.rowStops[geometry.rowStops.length - 1]).toBeLessThan(1);
    const foundation = geometry.faces[geometry.faces.length - 1]!;
    expect(geometry.linkPort).toEqual({ x: geometry.faceX, y: foundation.y + geometry.faceH / 2 });
  });

  it('runs every rule down the ladder and only the violation climbs', () => {
    const geometry = geometryAt(800, 6);
    expect(geometry.faces.map((face) => face.role)).toEqual([...DRAFT_PREVIEW_ROLES]);
    for (const arrow of geometry.arrows) expect(arrow.y2).toBeGreaterThan(arrow.y1);
    const from = DRAFT_PREVIEW_ROLES.indexOf(DRAFT_PREVIEW_VIOLATION.from);
    const to = DRAFT_PREVIEW_ROLES.indexOf(DRAFT_PREVIEW_VIOLATION.to);
    expect(from).toBeGreaterThan(to);
  });

  it('fits any width at least its narrowest scene, and keeps the sentence once it has room', () => {
    const narrowest = geometryAt(0, 7).width;
    let sentence = false;
    for (let available = narrowest; available <= 1400; available += 7) {
      const geometry = geometryAt(available, 7);
      expect(geometry.width, `${available}px`).toBeLessThanOrEqual(available);
      if (sentence) expect(geometry.sentence, `${available}px`).toBe(true);
      sentence = geometry.sentence;
    }
    expect(sentence).toBe(true);
  });

  it('keeps a folder list longer than the ladder above the turn into the foundation', () => {
    const geometry = geometryAt(800, 11);
    const lastRow = geometry.rows[geometry.rows.length - 1]!;
    expect(geometry.linkPort.y).toBeGreaterThan(lastRow.y);
  });
});

describe('the preview clock', () => {
  const c = DRAFT_PREVIEW_CLOCK;

  it('follows the real draft path: read, propose, name and approve, save, rules, then the check', () => {
    const arrival = c.light + c.lightRead + c.lightCarry;
    const lastGroupSettles = c.propose + (DRAFT_PREVIEW_ROLES.length - 1) * c.fast + c.spring;
    const lastNameShown = c.name + (DRAFT_PREVIEW_ROLES.length - 1) * c.fast + c.fast + c.base;
    const fileSaved = c.save + Math.max(c.spring, c.fast + c.settle);
    const lastRuleDrawn = c.rules + (DRAFT_PREVIEW_ROLES.length - 2) * c.fast + c.base;
    expect(arrival).toBeLessThanOrEqual(c.propose);
    expect(lastGroupSettles).toBeLessThanOrEqual(c.name);
    expect(lastNameShown).toBeLessThanOrEqual(c.save);
    expect(fileSaved).toBeLessThanOrEqual(c.rules);
    expect(lastRuleDrawn).toBeLessThanOrEqual(c.catch);
    expect(c.catch + c.catchDraw + c.settle).toBeLessThanOrEqual(c.rest);
    expect(c.rest).toBeLessThan(c.clear);
    expect(c.clear + c.fast).toBeLessThanOrEqual(c.loop);
  });

  it('ends its last loop on the built frame and then asks for no more frames', () => {
    const iterations = draftPreviewIterations(3);
    expect(Math.floor(iterations)).toBe(2);
    expect((iterations % 1) * c.loop).toBeCloseTo(c.rest, 6);
  });
});

describe('draftPreviewTracks', () => {
  const geometry = geometryAt(800, 6);
  const tracks = draftPreviewTracks(geometry, EASING, LIGHT);
  const rest = DRAFT_PREVIEW_CLOCK.rest / DRAFT_PREVIEW_CLOCK.loop;

  it('gives every lane a whole loop whose offsets never run backwards', () => {
    for (const [part, lanes] of Object.entries(tracks)) {
      for (const frames of lanes) {
        const offsets = frames.map((frame) => frame.offset as number);
        expect(offsets[0], part).toBe(0);
        expect(offsets[offsets.length - 1], part).toBe(1);
        expect(offsets, part).toEqual([...offsets].sort((a, b) => a - b));
      }
    }
  });

  it('says "approved" only once the last group is named, and before the file is saved', () => {
    const loop = DRAFT_PREVIEW_CLOCK.loop;
    const opacityAt = (frames: Keyframe[], index: number) => Number(frames[index]!.opacity);
    const firstFull = (frames: Keyframe[]) => frames.findIndex((frame) => Number(frame.opacity) === 1);
    const lastNameLands = Math.max(
      ...DRAFT_PREVIEW_ROLES.map((role) => {
        const lane = tracks[`named:${role}`]![0]!;
        return (lane[firstFull(lane)]!.offset as number) * loop;
      }),
    );
    const heading = tracks['heading-approved']![0]!;
    const rises = heading.findIndex((frame, index) => opacityAt(heading, index) === 0 && Number(heading[index + 1]?.opacity) > 0);
    const approvedStarts = (heading[rises]!.offset as number) * loop;
    expect(approvedStarts).toBeGreaterThanOrEqual(lastNameLands);
    expect(approvedStarts).toBeLessThan(DRAFT_PREVIEW_CLOCK.save);
    const proposed = tracks['heading-proposed']![0]!;
    const fades = proposed.findIndex((frame, index) => opacityAt(proposed, index) === 1 && Number(proposed[index + 1]?.opacity) < 1);
    expect((proposed[fades]!.offset as number) * loop).toBe(approvedStarts);
  });

  it('never shows a group label and its name at once', () => {
    const loop = DRAFT_PREVIEW_CLOCK.loop;
    for (const role of DRAFT_PREVIEW_ROLES) {
      const group = tracks[`group:${role}`]![0]!;
      const named = tracks[`named:${role}`]![0]!;
      const groupGone = group.findIndex((frame, index) => index > 0 && Number(frame.opacity) === 0 && Number(group[index - 1]!.opacity) > 0);
      const nameRises = named.findIndex((frame, index) => Number(frame.opacity) === 0 && Number(named[index + 1]?.opacity) > 0);
      expect((named[nameRises]!.offset as number) * loop, role).toBeGreaterThanOrEqual((group[groupGone]!.offset as number) * loop);
    }
  });

  it('keeps the same keyframes at any width, so a window drag never restarts the loop', () => {
    expect(draftPreviewTracks(geometryAt(560, 6), EASING, LIGHT)).toEqual(draftPreviewTracks(geometryAt(1200, 6), EASING, LIGHT));
  });

  it('rests on the frame a reduced-motion reader sees, so stopping never jumps', () => {
    const still: Record<string, Record<string, string | number>> = {
      folders: { opacity: 1 },
      'row:0': { opacity: 1 },
      'branch:0': { opacity: 0 },
      'light-read': { opacity: 0 },
      'light-carry': { opacity: 0 },
      bloom: { opacity: 0 },
      'link-port': { opacity: 1 },
      'heading-proposed': { opacity: 0 },
      'heading-approved': { opacity: 1 },
      'face:shared': { opacity: 1, transform: 'translateY(0px)' },
      'group:shared': { opacity: 0 },
      'named:routing': { opacity: 1 },
      'plane:routing': { opacity: 1 },
      'rules-label': { opacity: 1 },
      'arrow:0': { strokeDashoffset: '0', opacity: 1 },
      'head:4': { opacity: 1 },
      'violation-reveal': { strokeDashoffset: '0' },
      'violation-halo': { opacity: LIGHT.haloRest },
      'violation-mark': { opacity: 1 },
      chip: { opacity: 1, transform: 'translateY(0px)' },
      check: { strokeDashoffset: '0' },
    };
    for (const [part, expected] of Object.entries(still)) {
      for (const [property, value] of Object.entries(expected)) {
        const lane = tracks[part]!.find((frames) => property in frames[0]!)!;
        expect(valueAt(lane, rest, property), `${part} ${property}`).toEqual(value);
      }
    }
  });
});
