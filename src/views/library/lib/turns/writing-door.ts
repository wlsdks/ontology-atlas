import type { TurnRunDoor } from "@/features/work-run";

import type { LibraryAgentOpeningRequest } from "../../ui/parts/agent/LibraryAgentDock";

/**
 * The door a Library turn that may write was started from. A desk question, its report and an
 * answer refresh are none: they end with the Library. `typed` is a request the person wrote.
 */
export function writingDoor(kind: LibraryAgentOpeningRequest["kind"], typed: boolean): TurnRunDoor | null {
  switch (kind) {
    case "compile":
    case "fix":
    case "import":
    case "propose":
      return kind;
    case "ask":
      return typed ? "typed" : null;
    case "lint":
    case "refresh":
      return null;
  }
}
