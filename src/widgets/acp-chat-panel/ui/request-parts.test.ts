import { describe, expect, it } from 'vitest';

import { ANALYSIS_FINDINGS_INSTRUCTION } from '@/features/acp-session';
import { buildLintBrief } from '@/features/library';

import { splitAppRequest } from './request-parts';

describe('splitAppRequest — the transcript opens on the readable sentence', () => {
  it('folds the scope and the response contract the workbench appends', () => {
    const text = [
      'Review what this ontology means and where its boundaries are.',
      'Scope: {"projectSlug":"storefront","targetSlugs":["domains/order"]}.',
      ANALYSIS_FINDINGS_INSTRUCTION,
    ].join('\n');
    const parts = splitAppRequest(text);
    expect(parts.lead).toBe('Review what this ontology means and where its boundaries are.');
    // Nothing is dropped: the folded half plus the lead is the whole request.
    expect(parts.detail).toContain('Scope: {"projectSlug"');
    expect(parts.detail).toContain(ANALYSIS_FINDINGS_INSTRUCTION.split('\n')[0]);
  });

  it('folds the follow-up sentence naming a record and its read tool', () => {
    const parts = splitAppRequest(
      'Review the refund window.\nContinue analysis 24e7bc39. Read it with query_ontology(...).',
    );
    expect(parts.lead).toBe('Review the refund window.');
    expect(parts.detail).toContain('Continue analysis 24e7bc39');
  });

  it("folds the map's relation triple", () => {
    const parts = splitAppRequest(
      'Meaning review: Cart\nSelected relation: {"from":"a","to":"b","type":"relates"}',
    );
    expect(parts.lead).toBe('Meaning review: Cart');
    expect(parts.detail).toContain('"type":"relates"');
  });

  /*
   * ⚠️ **A long typed question is a long typed question.** Splitting by length would be the panel
   * deciding what somebody meant to say, so only text the app itself generates is folded.
   */
  it('leaves a typed request whole, however long, and keeps its line breaks', () => {
    const typed = 'First, read the order domain.\n\nThen tell me what it is missing.\n- one\n- two';
    expect(splitAppRequest(typed)).toEqual({ lead: typed, detail: null });
  });

  it('does not fold when the marker is the whole request', () => {
    const onlyBlock = `Scope: {"projectSlug":"storefront"}.\n${ANALYSIS_FINDINGS_INSTRUCTION}`;
    // A disclosure whose summary is all of the content is a click that buys nothing.
    expect(splitAppRequest(onlyBlock).detail).toBeNull();
  });

  it('reads the contract marker from the constant rather than a copy of it', () => {
    // A reworded instruction must keep folding; a copied literal here would silently stop.
    const text = `Do the review.\n${ANALYSIS_FINDINGS_INSTRUCTION}`;
    expect(splitAppRequest(text).lead).toBe('Do the review.');
  });
});

/**
 * **The Library's briefs, measured on the installed app 2026-09-13.**
 *
 * Pressing 「서식 맞는지 확인」 opened the dock on the outgoing instruction verbatim — a JSON
 * schema, fenced blocks, `{"counts":{"disagreement":0,…}`, `nodeCandidates` and the taxonomy
 * rules — the largest block on the screen, in front of somebody who had pressed a Korean
 * button. Every Library brief writes the same anchor line before its instructions, so one
 * marker folds all of them, and the readable sentence each one opens with is what stands.
 */
describe("a Library brief folds at its folder anchor", () => {
  const KO = [
    '이 폴더의 위키를 읽고, 빠진 연결을 목록으로 돌려줘. 파일은 하나도 고치지 않아.',
    '',
    '폴더: /Users/probe/Atlas/launch',
    '',
    '`wiki/sources/` 는 열지 마: 판단 대상은 문서야.',
  ].join('\n');

  it('stands the readable sentence up alone and folds the instructions', () => {
    const { lead, detail } = splitAppRequest(KO);
    expect(lead).toBe('이 폴더의 위키를 읽고, 빠진 연결을 목록으로 돌려줘. 파일은 하나도 고치지 않아.');
    expect(detail).toContain('폴더: /Users/probe/Atlas/launch');
    expect(detail).toContain('는 열지 마');
  });

  it('folds the English anchor the same way', () => {
    const { lead, detail } = splitAppRequest(
      'Read the wiki in this folder and come back with a list.\n\nFolder: /tmp/v\n\nRead every page.',
    );
    expect(lead).toBe('Read the wiki in this folder and come back with a list.');
    expect(detail).toContain('Folder: /tmp/v');
  });

  /* The briefs that open on the anchor fold nothing, and that is the honest outcome:
     there is no readable half in front of it for the bubble to stand on. */
  it('folds nothing when the anchor is the first line', () => {
    expect(splitAppRequest('폴더: /tmp/v\n\n위키를 고쳐 줘.').detail).toBeNull();
  });
});

/**
 * **The real brief, not a stand-in for it.**
 *
 * The fold and the text it folds are written in two files, so the case that matters is the
 * one built from the composer itself: a reworded brief that stops folding must fail here.
 */
describe('the Check-the-wiki brief, as it is actually sent', () => {
  const brief = buildLintBrief({
    pages: [{ slug: 'wiki/plan', title: 'Plan', sourcePaths: ['sources/plan.pdf'], createdBy: 'agent:claude', compiledAt: null }],
    locale: 'ko',
    vaultRoot: '/Users/probe/Atlas/launch',
  });

  it('stands one readable line up and folds the schema, the fences and the rules', () => {
    const { lead, detail } = splitAppRequest(brief);
    expect(lead.split('\n')).toHaveLength(1);
    expect(lead).toContain('목록으로 돌려줘');
    // None of what filled the dock is in the bubble any more.
    expect(lead).not.toContain('```');
    expect(lead).not.toContain('nodeCandidates');
    expect(lead).not.toContain('"counts"');
    expect(detail).toContain('nodeCandidates');
    expect(detail).toContain('"counts"');
    // The bubble is a small fraction of the turn, and the turn is whole.
    expect(lead.length).toBeLessThan(brief.length / 5);
    // The blank line between the two halves is the only byte the split spends.
    expect(`${lead}\n\n${detail}`).toBe(brief.trim());
  });
});

/**
 * **The architecture workbench's packet, measured on the installed app 2026-09-09.**
 *
 * Pressing 「source check」 on a Korean build drew a bubble opening
 * `{"contract":"architectureAgentTask:v1","kind":"verify"` with ten English instruction
 * sentences under it, and a "full request" disclosure below that folded almost nothing.
 * Two causes, and the fix needs both: the marker was not listed here, and the packet stood
 * on line 0, where a marker folds nothing because there is no readable half in front of it.
 *
 * The bubble is `break-keep`, so a JSON object with no spaces in it does not wrap either —
 * which is why the first line ran off the panel's right edge with no scrollbar. Folded, it
 * lands in the disclosure, which is `break-words`.
 */
describe('the architecture handoff packet folds', () => {
  const REAL_SHAPE = [
    'Start from the reviewed architecture profile atlas-web.',
    'Architecture task context: {"contract":"architectureAgentTask:v1","kind":"verify","stage":"understand"}',
    'Call inspect_architecture with {"profileSlug":"atlas-web"} before opening implementation files.',
    'This is a verification task. Do not edit implementation files.',
  ].join('\n');

  it('stands the readable sentence up alone', () => {
    expect(splitAppRequest(REAL_SHAPE).lead).toBe(
      'Start from the reviewed architecture profile atlas-web.',
    );
  });

  it('folds the packet and everything after it', () => {
    const detail = splitAppRequest(REAL_SHAPE).detail ?? '';
    expect(detail).toContain('architectureAgentTask:v1');
    expect(detail).toContain('This is a verification task.');
  });

  it('loses nothing — lead plus detail is the request that was sent', () => {
    const { lead, detail } = splitAppRequest(REAL_SHAPE);
    expect(`${lead}\n${detail}`).toBe(REAL_SHAPE);
  });

  it('folds nothing when the packet leads, which is why the order matters', () => {
    const packetFirst = REAL_SHAPE.split('\n').slice(1).join('\n');
    expect(splitAppRequest(packetFirst).detail).toBeNull();
  });
});
