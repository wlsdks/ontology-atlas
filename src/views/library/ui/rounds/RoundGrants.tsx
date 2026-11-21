"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/shared/lib/cn";
import { fieldLabel } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";

/**
 * What this round may do, as a hairline and a list: the one block a person cannot edit, so a box would
 * make it look like another question. The cost line changes ink only above 48 agent turns a day.
 */
export function RoundGrants({ lines, cost, costAlarming, widens }: {
  lines: readonly string[];
  cost: string;
  costAlarming: boolean;
  /** An edit that gives the round more reach than the person allowed before. */
  widens: boolean;
}) {
  const t = useTranslations("library.rounds");
  return (
    <div className="border-t border-[color:var(--color-divider)] pt-3" data-testid="library-rounds-scope">
      <p className={fieldLabel()}>{t("sheet.may")}</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {lines.map((line) => (
          <li key={line} className="flex items-start gap-2 text-body leading-body text-[color:var(--color-text-primary)]">
            <Check size={ICON_SIZE.sm} className="mt-0.5 flex-none text-[color:var(--color-indigo-text-soft)]" aria-hidden />
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <p
        className={cn(
          "mt-3 text-label leading-label",
          costAlarming ? "text-[color:var(--color-amber-source-a90)]" : "text-[color:var(--color-text-tertiary)]",
        )}
        data-cost-tone={costAlarming ? "alarming" : "quiet"}
        data-testid="library-rounds-cost"
      >
        {cost}
      </p>
      {widens ? (
        <p data-testid="library-rounds-widens" className="mt-3 text-body leading-body text-[color:var(--color-amber-source-a90)]">{t("sheet.editWidens")}</p>
      ) : null}
    </div>
  );
}
