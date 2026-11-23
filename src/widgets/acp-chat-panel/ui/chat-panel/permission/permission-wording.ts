import type { permissionLocality } from '@/features/acp-session';

import type { Answer } from './use-permission-answer';

type Locality = ReturnType<typeof permissionLocality>;

/** Which title the card states about the request: an ontology write, a server consent, or a file write. */
export function permissionTitleKey({
  ontologyWrite,
  serverConsent,
  locality,
  statedOnly = false,
}: {
  ontologyWrite: boolean;
  serverConsent: boolean;
  locality: Locality;
  /** The paths are the agent's own list, not the one the policy judged: the title reports, it does not assert. */
  statedOnly?: boolean;
}) {
  return ontologyWrite
    ? 'ontologyWriteTitle'
    : serverConsent
      ? 'consentTitle'
      : locality === 'inside-folder'
        ? statedOnly ? 'statedInsideFolderTitle' : 'insideFolderTitle'
        : locality === 'inside-project'
          ? 'insideProjectTitle'
          : 'title';
}

/**
 * The sentence under the title. For an ontology write it says whether the basis of the review was
 * verified, or that the connected folder is not the one the agent reported.
 */
export function permissionBodyKey({
  ontologyWrite,
  executionBlocked,
  reviewReady,
  serverConsent,
  locality,
}: {
  ontologyWrite: boolean;
  executionBlocked: boolean | undefined;
  reviewReady: boolean;
  serverConsent: boolean;
  locality: Locality;
}) {
  return ontologyWrite
    ? executionBlocked
      ? 'taskReview.rootMismatchBody'
      : reviewReady
        ? 'ontologyWriteBody'
        : 'ontologyWriteUnverifiedBody'
    : serverConsent
      ? 'consentBody'
      : locality === 'inside-folder'
        ? 'insideFolderBody'
        : locality === 'inside-project'
          ? 'insideProjectBody'
          : 'body';
}

/** What the receipt says after an answer; `null` while nothing is answered. */
export function answeredKey({
  answered,
  failed,
  targetName,
  ontologyWrite,
}: {
  answered: Answer | null;
  failed: boolean;
  targetName: string | null;
  ontologyWrite: boolean;
}) {
  return answered === null
    ? null
    : failed
      ? 'answered.failed'
      : answered === 'allow'
        ? targetName && ontologyWrite ? 'answered.allowNamed' : 'answered.allow'
        : answered === 'reject'
          ? targetName && ontologyWrite ? 'answered.rejectNamed' : ontologyWrite ? 'answered.rejectWrite' : 'answered.reject'
          : answered === 'correct'
            ? 'answered.correct'
            : 'answered.always';
}

/** What "Allow once" will do, in the legend: a batch, one named target, or the request as shown. */
export function allowEffect(
  changeSet: { itemCount: number } | null,
  targetName: string | null,
): { kind: 'batch'; count: number } | { kind: 'named'; name: string } | { kind: 'plain' } {
  return changeSet && changeSet.itemCount > 1
    ? { kind: 'batch', count: changeSet.itemCount }
    : targetName
      ? { kind: 'named', name: targetName }
      : { kind: 'plain' };
}
