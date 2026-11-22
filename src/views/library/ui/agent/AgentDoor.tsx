"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { cn } from "@/shared/lib/cn";
import { DESTINATION_HREF } from "@/shared/config/destinations";
import { buttonVariants } from "@/shared/ui";
import { controlClass } from "@/shared/ui/control-class";

/**
 * The label is `navRail.agents`, the rail's own word, so the door and the rail tile are visibly one
 * door. It repairs only the coding-agent clause of `stage.blockedNoAgent`, not the local-address
 * clause. Absent on the web.
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
