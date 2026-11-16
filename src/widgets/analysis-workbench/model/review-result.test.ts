import { describe, expect, it } from 'vitest';

import { ANALYSIS_FINDINGS_INSTRUCTION } from '@/features/acp-session';

import { isRecordedReviewRequest } from './review-result';

const DIGEST = `sha256:${'a'.repeat(64)}`;
const CONCEPT_UID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const investigationPacket = {
  contract: 'grayAreaInvestigation:v1', requestedMode: 'read-only', execution: 'editable draft; not automatically sent',
  projectUid: '11111111-1111-4111-8111-111111111111',
  basis: { projectSlug: 'project', selectedUids: [CONCEPT_UID], sourceId: DIGEST, sourceFingerprint: DIGEST, graphDigest: DIGEST, bodyDigest: DIGEST, bindingDigest: DIGEST },
  snapshotId: DIGEST, measuredAt: '2026-10-04T00:00:00.000Z',
  candidate: { id: 'a', kind: 'changed-source', slug: 'capabilities/a', relatedSlug: null, path: ['capabilities/a'], statement: 'source changed', sourcePaths: ['source.py'], currency: 'observed' },
  nodes: [{ uid: CONCEPT_UID, slug: 'capabilities/a', bodyDigest: DIGEST }], witnesses: [],
};
const fenced = (packet: unknown) => `\`\`\`atlas-investigation\n${JSON.stringify(packet, null, 2)}\n\`\`\``;

describe('which requests the app records as a review', () => {
  it('records a review that asks for the findings block', () => {
    expect(isRecordedReviewRequest(`Review the meaning.\n${ANALYSIS_FINDINGS_INSTRUCTION}`)).toBe(true);
  });
  it('records a prepared code-check investigation sent under its lead sentence', () => {
    expect(isRecordedReviewRequest(`Look into this question.\n\n${fenced(investigationPacket)}`)).toBe(true);
  });
  it('leaves an ordinary question and a broken investigation packet in the conversation', () => {
    expect(isRecordedReviewRequest('What does the refund capability own?')).toBe(false);
    expect(isRecordedReviewRequest(fenced({ ...investigationPacket, contract: 'other' }))).toBe(false);
  });
});
