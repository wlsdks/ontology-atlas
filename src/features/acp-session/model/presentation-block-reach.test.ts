import { describe, expect, it } from 'vitest';

import ko from '../../../../messages/ko.json';
import en from '../../../../messages/en.json';
import { buildAcpPresentationTrace } from './presentation-trace';
import type { AcpEvent } from './use-acp-session';

/**
 * **The blocked card may only name reasons it can actually give.**
 *
 * ## What was measured (2026-09-20)
 *
 * The card listed ten reasons. Two of them could never be read, because the panel re-checks the
 * same conditions before it draws the card at all:
 *
 * | reason | the builder returns it when | the panel already requires |
 * |---|---|---|
 * | `intent_inactive` | the intent is null, or this turn is not the request | intent non-null **and** this turn is the request |
 * | `turn_incomplete` | the session is not `ready` | the session is `ready` |
 *
 * So the two sentences were written, translated and shipped for a state the surface cannot be in.
 * They are gone, and this holds the two halves together: the catalogue must carry a sentence for
 * every reason the card can reach, and must not carry one for a reason it cannot.
 *
 * ⚠️ **Removing copy only pays if the unreachability is checked.** If a guard is ever relaxed, the
 * reason becomes reachable and `t()` would print the raw key on screen. These cases fail first.
 */

const user = (text: string): AcpEvent => ({ kind: 'user', id: 'u', text });
const agent = (text: string): AcpEvent => ({ kind: 'agent', id: 'a', text });

/** The three things the panel checks before it draws the card. */
const REQUEST = 'Walk me through the business flow.';
const underPanelGuards = (events: readonly AcpEvent[]) =>
  buildAcpPresentationTrace({
    intent: { kind: 'business-flow' } as never,
    expectedUserText: REQUEST,
    sessionStatus: 'ready',
    events,
    knownSlugs: new Set<string>(),
    knownRelations: new Set<string>(),
  });

describe('the presentation block card names only reachable reasons', () => {
  it('never answers with a reason the panel has already ruled out', () => {
    const result = underPanelGuards([user(REQUEST), agent('An answer that exists.')]);
    expect(['intent_inactive', 'turn_incomplete']).not.toContain(
      result.status === 'blocked' ? result.reason : '',
    );
  });

  it('carries a sentence for every reason it can still give, in both catalogues', () => {
    // `no_answer` stays: the panel looks for an answer anywhere in the conversation, the builder
    // for one inside this turn, so a turn that answered nothing still reaches it.
    const noAnswer = underPanelGuards([agent('An older turn answered.'), user(REQUEST)]);
    expect(noAnswer).toMatchObject({ status: 'blocked', reason: 'no_answer' });

    for (const catalogue of [ko, en]) {
      const reasons = catalogue.acpChat.presentation.blockReason as Record<string, string>;
      expect(Object.keys(reasons), 'a reason the card can give has no sentence').toContain('no_answer');
      for (const gone of ['intent_inactive', 'turn_incomplete']) {
        expect(Object.keys(reasons), `${gone} cannot be reached and must not be written`).not.toContain(gone);
      }
    }
  });
});
