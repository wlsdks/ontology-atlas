"use client";

import { useTranslations } from "next-intl";
import { MessageSquare } from "lucide-react";

import type { AcpTurnActivity } from "@/features/acp-session";
import { ChromeChip } from "@/shared/ui";

/**
 * The Conversation door in the Library header. It stays where it is while the dock is open, selected,
 * and a second press puts the dock away. Behind a shut dock it carries a running turn's phase, since
 * a phase beside the internal prompt read as status text, with no way back to Stop.
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
      icon={
        phase ? (
          <span
            aria-hidden
            data-testid="library-conversation-running-dot"
            className="size-1.5 flex-none rounded-full bg-[color:var(--color-indigo-accent)] motion-safe:animate-pulse"
          />
        ) : (
          <MessageSquare aria-hidden />
        )
      }
      /*
        One line, bounded. The phase can run long; a chip that grows with it would push the header's
        other doors off their row.
      */
      className="min-w-0 max-w-[16rem] flex-none shadow-none"
    >
      {phase ? `${t("conversation.open")} · ${phase}` : t("conversation.open")}
    </ChromeChip>
  );
}
