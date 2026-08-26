/**
 * **The sentence that asks the agent to narrate this codebase's business.**
 *
 * ## Why the product owns this text
 *
 * A person can already type "explain this project" into the conversation, and the
 * 2026-08-26 field trial is what says that is not enough. A fresh agent, given a
 * vault and no source, answered all six onboarding questions — and made two
 * mistakes a hand-typed prompt cannot prevent:
 *
 * 1. It repeated a project exclusion that nothing in the subject supported. An
 *    exclusion is the one claim a source-hidden reader can never check, because
 *    there is no code for a thing deliberately not built.
 * 2. It carried the project's `partial` scope qualifier into its first answer and
 *    dropped it from its last, presenting three exclusions as equally settled.
 *    The vault was more honest than the answer given from it.
 *
 * Both are prompt-shaped defects, so the prompt is where they get fixed, and the
 * product carries it rather than the person's memory. The two rules below are
 * exactly those two failures written as instructions.
 *
 * ## What it deliberately does not do
 *
 * It does not ask the agent to read the source. The narrative's whole value is
 * that it is checkable against the vault a person can open, and an agent that
 * silently supplements from code produces prose nobody can verify. When the vault
 * cannot answer, the honest output is the gap — that is a finding about the vault,
 * not a failure of the request.
 *
 * It also does not ask for the result to be saved. A stored narrative is a second
 * copy of the graph that starts drifting the moment a node changes, and the
 * whole point of deriving it on demand is that it cannot.
 */

/**
 * Kept short enough to sit in a conversation input without scrolling it away.
 *
 * This is a guard on the app's own localized string rather than on user input:
 * a translation that grows past it has stopped being a request someone reads
 * before pressing, and an unread request cannot be checked against the answer.
 */
const MAX_CHARS = 1200;

export interface BusinessFlowRequestLabels {
  /** Localized body. The app writes the sentence; the model does not. */
  readonly request: string;
}

/**
 * The request, with the vault folder named so the agent starts in the right place.
 *
 * `vaultRoot` is absent on the web, where no agent can be launched at all
 * (`isAcpBridgeAvailable()` is false because a browser cannot start a process).
 * The sentence is still built there so the screen can show what *would* be asked
 * rather than an empty box; the caller decides whether it is pressable.
 */
export function buildBusinessFlowRequest(
  labels: BusinessFlowRequestLabels,
  vaultRoot: string | null,
): string {
  const scoped = vaultRoot
    ? labels.request.replace("{vault}", vaultRoot)
    : labels.request.replace(" ({vault})", "").replace("{vault}", "");
  const trimmed = scoped.trim();
  if (trimmed.length <= MAX_CHARS) return trimmed;
  // Truncating a rule mid-sentence would ship a prompt whose last instruction is
  // half-written, so the overflow is reported rather than silently cut.
  throw new Error(
    `Business flow request is ${trimmed.length} characters, over the ${MAX_CHARS} a person will read before pressing.`,
  );
}
