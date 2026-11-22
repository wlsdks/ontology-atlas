import type { AcpTurnCompletion } from "@/features/acp-session";
import type { TurnToolEvent } from "@/features/work-run";

/** The tool calls of a finished turn, as the work card counts them. */
export function turnToolEvents(completion: Pick<AcpTurnCompletion, "events">): TurnToolEvent[] {
  const tools: TurnToolEvent[] = [];
  for (const event of completion.events) {
    if (event.kind === "tool") tools.push({ id: event.id, toolKind: event.toolKind, status: event.status, title: event.title, rawInput: event.rawInput });
  }
  return tools;
}
