import { useTranslations } from "use-intl";
import { MessageSquare } from "lucide-react";

import type { AcpTurnActivity } from "@/features/acp-session";
import { cn } from "@/shared/lib/cn";
import { ChromeChip } from "@/shared/ui";
import { OPEN_DOOR_CLASS } from "../home/open-door-class";

/**
 * The Conversation door in the Library header. It stays where it is while the dock is open, selected,
 * and a second press puts the dock away. Behind a shut dock a running turn shows as a dot in the
 * icon's place, with the phase in the tooltip and the accessible name: the face keeps one width, so
 * the doors beside it never move.
 */
export function LibraryConversationDoor({
  activity,
  agentLabel,
  open,
  onToggle,
}: {
  /** The running turn, or `null` between turns. */
  activity: AcpTurnActivity | null;
  /** The runtime that is answering — named in the accessible name, not on the chip face. */
  agentLabel: string;
  /** The dock is showing the conversation. */
  open: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("library");
  const tActivity = useTranslations("agentActivity");
  // An open dock shows the turn itself, so the door names only the destination.
  const phase = activity && !open ? tActivity(`phase.${activity.state}`) : null;

  return (
    <ChromeChip
      onClick={onToggle}
      data-testid="library-open-conversation"
      data-library-door="conversation"
      data-agent-running={phase ? "true" : undefined}
      aria-expanded={open}
      active={open}
      aria-label={phase ? t("conversation.runningLabel", { agent: agentLabel, phase }) : undefined}
      title={phase ? `${t("conversation.open")} · ${phase}` : undefined}
      icon={
        phase ? (
          <span aria-hidden className="flex size-3.5 flex-none items-center justify-center">
            <span
              data-testid="library-conversation-running-dot"
              className="size-1.5 rounded-full bg-[color:var(--color-indigo-accent)] motion-safe:animate-pulse"
            />
          </span>
        ) : (
          <MessageSquare aria-hidden />
        )
      }
      className={cn("min-w-0 flex-none shadow-none", open && OPEN_DOOR_CLASS)}
    >
      {t("conversation.open")}
    </ChromeChip>
  );
}
