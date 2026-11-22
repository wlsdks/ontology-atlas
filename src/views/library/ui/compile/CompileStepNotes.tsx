"use client";

import { AgentDoor } from "../agent/AgentDoor";

/**
 * The sentences under step two's buttons, in the order a person needs them: why Compile is dead and the
 * door it names, why Check the wiki is dead, what a second Compile is worth, what leaves this computer.
 */
export function CompileStepNotes({ blockedBelow, lintReasonBelow, partialNote, transfer, agentDoor }: {
  blockedBelow: string | null;
  lintReasonBelow: string | null;
  partialNote: string | null;
  transfer: string | null;
  /**
   * Whether a printed reason earns a door to `/agents`: true exactly when the sentence is one of the
   * agent-availability ones. False on the web, where the missing thing is the app and the `/download/`
   * link is the honest door, and while an agent is still being looked for.
   */
  agentDoor: boolean;
}) {
  if (!(blockedBelow || lintReasonBelow || partialNote || transfer)) return null;
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {blockedBelow ? (
        <p
          id="library-stage-compile-blocked"
          data-testid="library-stage-compile-blocked"
          /* The count marker for "the landing's availability sentence", set
             only when this paragraph is the one carrying it — `LibraryPage`
             decides, and the spec counts this attribute exactly once. */
          /*
           * The marker for the one availability sentence on this surface, set whenever this paragraph is
           * drawn; the spec counts the attribute exactly once.
           */
          data-landing-blocked-reason="true"
          /*
           * The reason is one type step under the button, not two: the sentence explaining a dead card may not
           * be the smallest text on it (`.claude/rules/design.md`). Same grade as the pane's own reason.
           */
          className="text-label leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
        >
          {blockedBelow}
        </p>
      ) : null}
      {/* The door the sentence above named: `AgentDoor` carries the rail's agents word, so the two are
         visibly one destination. */}
      {blockedBelow && agentDoor ? (
        <div className="flex">
          <AgentDoor testId="library-stage-compile-blocked-door" />
        </div>
      ) : null}
      {/*
        Check the wiki's own reason, on the one route where Compile has none: a
        disabled control beside the sentence that disables it, at the same grade
        as Compile's own so the two read as one voice.
      */}
      {lintReasonBelow ? (
        <>
          <p
            id="library-stage-lint-blocked"
            data-testid="library-stage-lint-blocked"
            data-landing-blocked-reason={blockedBelow ? undefined : "true"}
            className="text-label leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
          >
            {lintReasonBelow}
          </p>
          {agentDoor ? (
            <div className="flex">
              <AgentDoor testId="library-stage-lint-blocked-door" />
            </div>
          ) : null}
        </>
      ) : null}
      {/* After the reason, never before it: why the button is dead is what a
          person reads first, and this is what the press would be worth. */}
      {partialNote ? (
        <p
          data-testid="library-stage-compile-partial"
          className="text-caption leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
        >
          {partialNote}
        </p>
      ) : null}
      {transfer ? (
        <p
          data-testid="library-stage-transfer"
          className="text-caption leading-body text-[color:var(--color-text-quaternary)] [word-break:keep-all] [overflow-wrap:anywhere]"
        >
          {transfer}
        </p>
      ) : null}
    </div>
  );
}
