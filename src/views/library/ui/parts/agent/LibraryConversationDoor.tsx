"use client";

import { useTranslations } from "next-intl";
import { MessageSquare } from "lucide-react";

import type { AcpTurnActivity } from "@/features/acp-session";
import { ChromeChip } from "@/shared/ui";

/**
 * Keep the destination visible while a conversation runs behind the closed dock.
 * A phase followed by the internal prompt looked like status text to a fresh reader,
 * who could not find the way back to Stop. The work line owns file targets;
 * this control always names Conversation, with the running phase beside it.
 */
export function LibraryConversationDoor({
  activity,
  agentLabel,
  onOpen,
}: {
  /** The running turn behind the shut dock, or `null` between turns. */
  activity: AcpTurnActivity | null;
  /** The runtime that is answering — named in the accessible name, not on the chip face. */
  agentLabel: string;
  onOpen: () => void;
}) {
  const t = useTranslations("library");
  const tActivity = useTranslations("agentActivity");
  const phase = activity ? tActivity(`phase.${activity.state}`) : null;

  return (
    <ChromeChip
      onClick={onOpen}
      data-testid="library-open-conversation"
      data-library-door="conversation"
      data-agent-running={phase ? "true" : undefined}
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
      className="min-w-0 max-w-[16rem] flex-none"
    >
      {phase ? `${t("conversation.open")} · ${phase}` : t("conversation.open")}
    </ChromeChip>
  );
}
