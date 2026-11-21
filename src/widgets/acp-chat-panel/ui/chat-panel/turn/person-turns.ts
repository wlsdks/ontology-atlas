/**
 * A turn the person started, typed or pressed, is the only kind that gets next steps; an app-composed
 * request (an opening door, an investigation) and a reopened conversation get none. After a send, the
 * next new user message is the person's turn.
 */
export function startedPersonTurnId(
  sentAfter: { after: string | null } | null,
  latestUserEventId: string | null,
): string | null {
  return sentAfter && latestUserEventId !== null && latestUserEventId !== sentAfter.after
    ? latestUserEventId
    : null;
}

/** Next steps show for the latest turn when the person started it and did not stop it. */
export function offersNextSteps({
  latestUserEventId,
  personTurnIds,
  cancelledWaitTurnId,
}: {
  latestUserEventId: string | null;
  personTurnIds: ReadonlySet<string>;
  cancelledWaitTurnId: string | null;
}): boolean {
  return (
    latestUserEventId !== null
    && personTurnIds.has(latestUserEventId)
    && latestUserEventId !== cancelledWaitTurnId
  );
}
