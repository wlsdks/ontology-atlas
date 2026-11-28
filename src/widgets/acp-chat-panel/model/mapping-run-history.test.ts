import { createTranslator } from 'use-intl';
import { describe, expect, it } from 'vitest';

import en from '../../../../messages/en/acpChat.json';
import ja from '../../../../messages/ja/acpChat.json';
import ko from '../../../../messages/ko/acpChat.json';
import zh from '../../../../messages/zh/acpChat.json';

import { beginsWithOpening, groupRunConversations, isRunRequestText, requestOpening, requestWithoutCount, type HistoryRow } from './mapping-run-history';

const OPENINGS = [en, ko, ja, zh].map((catalogue) => requestOpening(catalogue.suggest.mapArea.prompt));
const isRunRequest = (title: string) => isRunRequestText(title, OPENINGS);

const conversation = (sessionId: string, title: string | null, updatedAt = `2026-11-23T10:${sessionId.padStart(2, '0')}:00Z`) =>
  ({ sessionId, cwd: '/vault', title, updatedAt });
const runTitle = (mapped: number) => `${mapped} of the 120 abilities found in this code are on the map (${Math.floor(mapped / 1.2)}%). Map the next part now.`;

/** Each row as a short label: a conversation's id, or a run's ids oldest first. */
const labels = (rows: HistoryRow[]) => rows.map((row) => (row.kind === 'run' ? `run ${row.sessions.map((session) => session.sessionId).join(',')}` : row.session.sessionId));

describe('the map-rest request for a run that read no figures', () => {
  it.each([['en', en], ['ko', ko], ['ja', ja], ['zh', zh]] as const)('%s states no count and keeps the rest of the request', (locale, catalogue) => {
    const t = createTranslator({ locale, messages: { acpChat: catalogue }, namespace: 'acpChat' });
    const counted = t('suggest.mapArea.prompt', { mapped: 828, total: 1_240, percent: 66 });
    const rest = requestWithoutCount(t('suggest.mapArea.prompt', { mapped: 0, total: 0, percent: 0 }));
    expect(counted.endsWith(rest)).toBe(true);
    expect(rest.length).toBeLessThan(counted.length);
    expect(rest).not.toMatch(/\b0\b|828|1,240|66%/);
    expect(rest).toContain('validate_vault');
  });
});

describe('the opening of the map-rest request', () => {
  it('recognises a title the request began, with its numbers, in every locale', () => {
    expect(isRunRequest(runTitle(48))).toBe(true);
    expect(isRunRequest('이 코드에서 찾은 기능 1,240개 중 828개(66%)가 지도에 있어. 다음 부분을')).toBe(true);
    expect(isRunRequest('このコードで見つかった機能120個のうち48個（40%）がマップにあります。')).toBe(true);
    expect(isRunRequest('这份代码中找到的 120 项功能里有 48 项（40%）在地图上。')).toBe(true);
  });

  it('recognises a title the agent cut short, once enough of its words agree', () => {
    expect(isRunRequest('48 of the 120 abilities fou')).toBe(true);
    expect(isRunRequest('48 of the 1')).toBe(false);
  });

  it('does not take a conversation of the person\'s own for a request', () => {
    expect(isRunRequest('What does billing do?')).toBe(false);
    expect(isRunRequest('48 of the tests failed; why?')).toBe(false);
    expect(isRunRequest('the 120 abilities found in this code are on the map')).toBe(false);
  });

  it('stops at the end of the first sentence, placeholders kept apart from the words', () => {
    expect(requestOpening('{a} of {b} found. Then more {c}.')).toEqual([null, ' of ', null, ' found.']);
    expect(beginsWithOpening('7 of 9 found. Then', requestOpening('{a} of {b} found today and more. Then {c}.'))).toBe(false);
  });
});

describe('History shows one row per run', () => {
  it('groups the conversations a run of this launch sent, whatever their titles, and leaves the rest', () => {
    const rows = groupRunConversations(
      [conversation('9', 'What does billing do?'), conversation('8', null), conversation('7', 'anything'), conversation('6', 'Explain loans')],
      [['7', '8']],
      isRunRequest,
    );
    expect(labels(rows)).toEqual(['9', 'run 7,8', '6']);
    expect(rows[1]).toMatchObject({ updatedAt: '2026-11-23T10:08:00Z' });
  });

  it('after a restart, groups requests that follow one another, and a conversation of the person\'s own between two runs splits them', () => {
    const rows = groupRunConversations(
      [
        conversation('6', runTitle(110)),
        conversation('5', runTitle(80)),
        conversation('4', 'Why is billing split in two?'),
        conversation('3', runTitle(72)),
        conversation('2', runTitle(48)),
        conversation('1', runTitle(24)),
      ],
      [],
      isRunRequest,
    );
    expect(labels(rows)).toEqual(['run 5,6', '4', 'run 1,2,3']);
  });

  it('keeps a known run apart from requests next to it that only their titles name', () => {
    const rows = groupRunConversations(
      [conversation('4', runTitle(90)), conversation('3', runTitle(72)), conversation('2', runTitle(48))],
      [['3']],
      isRunRequest,
    );
    expect(labels(rows)).toEqual(['run 4', 'run 3', 'run 2']);
  });
});
