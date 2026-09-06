"use client";

import type { useTranslations } from "next-intl";

import { Select } from "@/shared/ui";

import type { CompileBrain } from "../../lib/compile-brain";
import type { LibraryLocalModel } from "../../lib/use-library-agent";

/**
 * **Which brain Compile runs on**, when this computer offers two.
 *
 * One control, in the two places Compile can be started from: step two of the shelf and
 * the wiki header in the index. Both read and write the same stored answer, so the shelf
 * and the sidebar can never name different brains — the failure the Compile-reason module
 * was written to prevent, applied to the other half of the same question.
 *
 * It is drawn **only when both are available**. With one brain there is nothing to choose
 * and a select would be a control that cannot change anything, so the static line stays.
 * The options are named exactly as the shelf already names them, because a person reading
 * "Runs on: gemma4:12b on localhost:11434" and then opening a picker must find that same
 * string, not a second vocabulary for the same machine.
 */
export function CompileBrainSelect({
  brain,
  agentLabel,
  localModel,
  onChoose,
  size = "md",
  className,
  t,
}: {
  brain: CompileBrain | null;
  /** The verified coding agent's own name, as the shelf prints it. */
  agentLabel: string | null;
  localModel: LibraryLocalModel | null;
  onChoose: (brain: CompileBrain) => void;
  size?: "md" | "lg";
  className?: string;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  if (!localModel) return null;
  return (
    <Select
      data-testid="library-compile-brain"
      size={size}
      className={className}
      ariaLabel={t("stage.compile.brainLabel")}
      value={brain ?? "agent"}
      onChange={(next) => onChoose(next === "local" ? "local" : "agent")}
      options={[
        { value: "agent", label: t("stage.brainAgent", { name: agentLabel ?? "" }) },
        {
          value: "local",
          label: t("stage.brainLocal", { model: localModel.model, host: localModel.host }),
        },
      ]}
    />
  );
}
