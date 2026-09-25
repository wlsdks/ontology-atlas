"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { cn } from "@/shared/lib/cn";
import { DESTINATION_HREF } from "@/shared/config/destinations";
import { buttonVariants } from "@/shared/ui";
import { controlClass } from "@/shared/ui/control-class";

/**
 * **The way to the thing the sentence just named.**
 *
 * Measured 2026-09-11 on a folder with no coding agent: `stage.blockedNoAgent` printed
 * under a dead Compile button, and the person read a sentence naming a destination with
 * no way to reach it — while `/agents` sat in the rail 26px away, already carrying the
 * same word this control does. A reason a person cannot act on is a reason that teaches
 * them to stop reading reasons (`docs/DECISIONS.md` 2026-09-11, "a feature the product
 * has is always on screen; availability is a state with its reason").
 *
 * ## Why the label is the rail's own word, and not a new sentence
 *
 * `navRail.agents` is the destination's name everywhere else in the app,
 * so this control and the rail tile are visibly the same door. Slice U2's decision 3
 * forbids new copy here on purpose: a door captioned with its own freshly written
 * sentence is a second voice explaining the same blockage, and the sentence above it is
 * already the explanation.
 *
 * ## What it does *not* repair, stated rather than hidden
 *
 * `stage.blockedNoAgent` names two missing things — no verified coding agent, **and** no
 * saved local model address — and makes only the second actionable in words, pointing at
 * the settings sheet's AI-connection section. This door answers the first. It is not a
 * door to the second, and deliberately not dressed as one: `agents.ledeDetail` states
 * that API keys and folders are not chosen on that screen, so sending someone there for
 * an address would be the screen contradicting itself one click later (po-evidence,
 * council 2026-09-11). The
 * owner's decision the same day: the door repairs the coding-agent clause only, the
 * local-address clause stays a sentence, and there is no second door on the same line.
 *
 * ## Where it appears
 *
 * Exactly where one of the three agent-availability sentences prints, which is at most
 * two places at once: the landing prints one reason (`data-landing-blocked-reason`, held
 * to one by `tests/e2e/library-spine.spec.ts`, because the same sentence twice ~200px
 * apart is what design-interaction measured as a defect), and the answer reader prints
 * `answers.refreshUnavailable` on a screen of its own. The source pane's own
 * `compileNote` is the third site and follows the same rule. The index column's no-agent
 * notice (2026-09-25) is the fourth: it replaces the two dead Check and Compile doors in
 * the installed app once detection has found no runtime, and ends in this door. The
 * Check-results page draws the same notice (`AgentMissingNotice`) in the same state, in
 * place of its own dead Check (2026-09-25).
 *
 * ## The fourth site is a sentence's last line, so it wears a link and says its press
 *
 * The first cut drew the notice's door as this full-width outline button, and in a 255px
 * index column it became the strongest box there, stronger than the selected page card,
 * pulling the eye to a side door (design sweep round 2, 2026-09-25). Inside its padding it
 * also stood 11px in from every other box edge in the column. So that one site asks for
 * `variant="link"`: the accent link grammar the header strip's `Compile next` clause
 * already uses for a pressable fact, on the notice's own text line. And a link has no box
 * to read as the rail tile's twin, so the reason for the bare noun below does not carry
 * over: that site names its press (`wiki.agentMissingDoor`, *Connect an agent*). The
 * other sites keep the outline button and the rail's word.
 *
 * It is absent on the web, where the missing thing is the app itself and the existing
 * degradation card to `/download/` is the honest door.
 */
export function AgentDoor({
  testId,
  variant = "button",
  label,
}: {
  testId?: string;
  /** `link` for a door that ends a sentence rather than standing beside a refused press. */
  variant?: "button" | "link";
  /** The words, where they are not the rail's: only the link variant names its press. */
  label?: string;
}) {
  const nav = useTranslations("navRail");
  if (variant === "link") {
    return (
      <Link
        href={DESTINATION_HREF.agents}
        data-testid={testId ?? "library-agent-door"}
        className={controlClass({
          shape: "link",
          tone: "accent",
          hoverInk: "strong",
          className: "atlas-touch-floor max-w-full self-start",
        })}
      >
        <span className="min-w-0 truncate">{label ?? nav("agents")}</span>
      </Link>
    );
  }
  return (
    <Link
      href={DESTINATION_HREF.agents}
      data-testid={testId ?? "library-agent-door"}
      /*
       * `outline`, not `primary`: the press this stands beside is refused, and the way
       * out of a refusal is not the strongest box on the screen. `sm` matches the Ask
       * button it sits near in step three.
       */
      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "atlas-touch-floor max-w-full")}
    >
      {nav("agents")}
    </Link>
  );
}
